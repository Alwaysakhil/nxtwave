import express from 'express';
import {
  parseMonth,
  shiftMonth,
  validateBudget,
  validateInsightQuestion,
  validateTransaction,
  ValidationError,
} from './validation.js';
import { generateAiAdvice } from './gemini.js';

const monthStart = (month) => `${month}-01`;
const nextMonthStart = (month) => `${shiftMonth(month, 1)}-01`;
const amount = (value) => Number(value || 0);

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

export function createApp({
  pool,
  fetchImplementation = globalThis.fetch,
  geminiApiKey = process.env.GEMINI_API_KEY,
} = {}) {
  if (!pool) throw new Error('A MySQL connection pool is required.');
  if (typeof fetchImplementation !== 'function') throw new Error('A fetch implementation is required.');
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', asyncRoute(async (_request, response) => {
    await pool.query('SELECT 1');
    response.json({ status: 'ok', database: 'connected' });
  }));

  app.get('/api/transactions', asyncRoute(async (request, response) => {
    const month = parseMonth(request.query.month);
    const [rows] = await pool.execute(
      `SELECT id, description, amount, type, category, occurred_on, notes
       FROM finance_transactions WHERE occurred_on >= ? AND occurred_on < ?
       ORDER BY occurred_on DESC, id DESC`,
      [monthStart(month), nextMonthStart(month)],
    );
    response.json(rows.map((row) => ({
      ...row,
      id: Number(row.id),
      amount: amount(row.amount),
      occurredOn: row.occurred_on,
      occurred_on: undefined,
    })));
  }));

  app.post('/api/transactions', asyncRoute(async (request, response) => {
    const transaction = validateTransaction(request.body);
    const [result] = await pool.execute(
      `INSERT INTO finance_transactions (description, amount, type, category, occurred_on, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [transaction.description, transaction.amount, transaction.type, transaction.category,
        transaction.occurredOn, transaction.notes],
    );
    response.status(201).json({
      id: result.insertId,
      ...transaction,
    });
  }));

  app.delete('/api/transactions/:id', asyncRoute(async (request, response) => {
    if (!/^[1-9]\d*$/.test(request.params.id)) throw new ValidationError('Transaction id must be a positive integer.');
    const [result] = await pool.execute('DELETE FROM finance_transactions WHERE id = ?', [request.params.id]);
    if (result.affectedRows === 0) {
      const error = new Error(`Transaction ${request.params.id} was not found.`);
      error.statusCode = 404;
      throw error;
    }
    response.status(204).end();
  }));

  app.get('/api/budgets', asyncRoute(async (request, response) => {
    const month = parseMonth(request.query.month);
    response.json(await readBudgets(pool, month));
  }));

  app.put('/api/budgets', asyncRoute(async (request, response) => {
    const month = parseMonth(request.query.month);
    const budget = validateBudget(request.body);
    await pool.execute(
      `INSERT INTO monthly_budgets (category, budget_year, budget_month, monthly_limit)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE monthly_limit = VALUES(monthly_limit)`,
      [budget.category, Number(month.slice(0, 4)), Number(month.slice(5, 7)), budget.monthlyLimit],
    );
    const budgets = await readBudgets(pool, month);
    response.json(budgets.find((item) => item.category.toLowerCase() === budget.category.toLowerCase()));
  }));

  app.get('/api/dashboard', asyncRoute(async (request, response) => {
    const month = parseMonth(request.query.month);
    const [totalsResult, categoryResult, budgetResult] = await Promise.all([
      pool.execute(
        `SELECT
           COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) AS totalIncome,
           COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS totalExpenses,
           COUNT(*) AS transactionCount
         FROM finance_transactions WHERE occurred_on >= ? AND occurred_on < ?`,
        [monthStart(month), nextMonthStart(month)],
      ),
      pool.execute(
        `SELECT category, SUM(amount) AS amount FROM finance_transactions
         WHERE type = 'EXPENSE' AND occurred_on >= ? AND occurred_on < ?
         GROUP BY category ORDER BY amount DESC`,
        [monthStart(month), nextMonthStart(month)],
      ),
      pool.execute(
        `SELECT b.category, b.budget_year, b.budget_month, b.monthly_limit,
                COALESCE(SUM(t.amount), 0) AS spent
         FROM monthly_budgets b
         LEFT JOIN finance_transactions t
           ON LOWER(t.category) = LOWER(b.category)
           AND t.type = 'EXPENSE' AND t.occurred_on >= ? AND t.occurred_on < ?
         WHERE b.budget_year = ? AND b.budget_month = ?
         GROUP BY b.id, b.category, b.budget_year, b.budget_month, b.monthly_limit
         ORDER BY b.category`,
        [monthStart(month), nextMonthStart(month), Number(month.slice(0, 4)), Number(month.slice(5, 7))],
      ),
    ]);
    const totals = totalsResult[0][0];
    const totalIncome = amount(totals.totalIncome);
    const totalExpenses = amount(totals.totalExpenses);

    response.json({
      month,
      totalIncome,
      totalExpenses,
      netBalance: totalIncome - totalExpenses,
      savingsRate: totalIncome > 0 ? (totalIncome - totalExpenses) / totalIncome * 100 : 0,
      transactionCount: Number(totals.transactionCount),
      categorySpending: categoryResult[0].map((item) => ({
        category: item.category, amount: amount(item.amount),
      })),
      budgets: budgetResult[0].map(toBudgetResponse),
    });
  }));

  app.post('/api/insights', asyncRoute(async (request, response) => {
    const month = parseMonth(request.query.month);
    const question = validateInsightQuestion(request.body);
    const previousMonth = shiftMonth(month, -1);
    const [currentTotals, previousTotals, currentCategories, previousCategories, budgets] = await Promise.all([
      readTotals(pool, month),
      readTotals(pool, previousMonth),
      readCategoryTotals(pool, month),
      readCategoryTotals(pool, previousMonth),
      readBudgetLimits(pool, month),
    ]);
    const advice = await generateAiAdvice(fetchImplementation, geminiApiKey, {
      month,
      income: currentTotals.income,
      expenses: currentTotals.expenses,
      previousMonthExpenses: previousTotals.expenses,
      expensesByCategory: currentCategories,
      previousExpensesByCategory: previousCategories,
      budgetsByCategory: budgets,
    }, question);
    response.json({ advice });
  }));

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      return response.status(400).json({ message: 'Request body must contain valid JSON.' });
    }
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (status >= 500) console.error('API request failed:', error);
    const message = status >= 500 && status !== 503
      ? 'The request could not be completed. Please try again.'
      : error.message;
    return response.status(status).json({ message });
  });

  return app;
}

async function readBudgets(pool, month) {
  const [rows] = await pool.execute(
    `SELECT b.category, b.budget_year, b.budget_month, b.monthly_limit,
            COALESCE(SUM(t.amount), 0) AS spent
     FROM monthly_budgets b
     LEFT JOIN finance_transactions t
       ON LOWER(t.category) = LOWER(b.category)
       AND t.type = 'EXPENSE' AND t.occurred_on >= ? AND t.occurred_on < ?
     WHERE b.budget_year = ? AND b.budget_month = ?
     GROUP BY b.id, b.category, b.budget_year, b.budget_month, b.monthly_limit
     ORDER BY b.category`,
    [monthStart(month), nextMonthStart(month), Number(month.slice(0, 4)), Number(month.slice(5, 7))],
  );
  return rows.map(toBudgetResponse);
}

function toBudgetResponse(row) {
  const monthlyLimit = amount(row.monthly_limit);
  const spent = amount(row.spent);
  return {
    category: row.category,
    year: Number(row.budget_year),
    month: Number(row.budget_month),
    monthlyLimit,
    spent,
    remaining: Math.max(0, monthlyLimit - spent),
    percentUsed: monthlyLimit ? Math.round(spent / monthlyLimit * 100) : 0,
  };
}

async function readTotals(pool, month) {
  const [rows] = await pool.execute(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS expenses
     FROM finance_transactions WHERE occurred_on >= ? AND occurred_on < ?`,
    [monthStart(month), nextMonthStart(month)],
  );
  return { income: amount(rows[0].income), expenses: amount(rows[0].expenses) };
}

async function readCategoryTotals(pool, month) {
  const [rows] = await pool.execute(
    `SELECT category, SUM(amount) AS amount FROM finance_transactions
     WHERE type = 'EXPENSE' AND occurred_on >= ? AND occurred_on < ? GROUP BY category`,
    [monthStart(month), nextMonthStart(month)],
  );
  return Object.fromEntries(rows.map((row) => [row.category, amount(row.amount)]));
}

async function readBudgetLimits(pool, month) {
  const [rows] = await pool.execute(
    `SELECT category, monthly_limit FROM monthly_budgets
     WHERE budget_year = ? AND budget_month = ?`,
    [Number(month.slice(0, 4)), Number(month.slice(5, 7))],
  );
  return Object.fromEntries(rows.map((row) => [row.category, amount(row.monthly_limit)]));
}
