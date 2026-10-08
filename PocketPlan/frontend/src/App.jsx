import { useCallback, useEffect, useState } from 'react';
import { api, currentMonth, formatMoney, monthLabel } from './api.js';
import {
  BudgetList,
  CategoryField,
  CategoryList,
  EmptyMessage,
  greeting,
  InsightList,
  OTHER_CATEGORY,
  SummaryCard,
  TransactionList,
} from './components.jsx';

const menu = [
  ['overview', 'Overview', '◫'],
  ['transactions', 'Transactions', '↕'],
  ['budgets', 'Budgets', '▤'],
  ['insights', 'Insights', '✳'],
];

const emptyTransaction = () => {
  const today = new Date();
  return {
    description: '',
    amount: '',
    type: 'EXPENSE',
    category: '',
    customCategory: '',
    occurredOn: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
    notes: '',
  };
};

function App() {
  const [month, setMonth] = useState(currentMonth);
  const [section, setSection] = useState('overview');
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [insights, setInsights] = useState(null);
  const [insightQuestion, setInsightQuestion] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [form, setForm] = useState(emptyTransaction);
  const [saving, setSaving] = useState(false);
  const [busyInsights, setBusyInsights] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ category: '', customCategory: '', monthlyLimit: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dashboard, rows] = await Promise.all([
        api.dashboard(month),
        api.transactions(month),
      ]);
      setSummary(dashboard);
      setTransactions(rows);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    setSummary(null);
    setTransactions([]);
    setInsights(null);
    loadData();
  }, [loadData]);

  async function saveTransaction(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createTransaction({
        ...form,
        category: form.category === OTHER_CATEGORY ? form.customCategory.trim() : form.category,
        amount: Number(form.amount),
        notes: form.notes.trim() || null,
      });
      setShowTransactionForm(false);
      setForm(emptyTransaction());
      setSuccess('Transaction saved. Your dashboard is up to date.');
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeTransaction(transaction) {
    if (!window.confirm(`Delete "${transaction.description}"? This cannot be undone.`)) return;
    setError('');
    try {
      await api.deleteTransaction(transaction.id);
      setSuccess('Transaction deleted.');
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function saveBudget(event) {
    event.preventDefault();
    setError('');
    try {
      await api.saveBudget(month, {
        category: budgetForm.category === OTHER_CATEGORY ? budgetForm.customCategory.trim() : budgetForm.category,
        monthlyLimit: Number(budgetForm.monthlyLimit),
      });
      setBudgetForm({ category: '', customCategory: '', monthlyLimit: '' });
      setSuccess('Monthly budget saved.');
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function loadInsights(question = null) {
    setBusyInsights(true);
    setError('');
    try {
      const result = await api.insights(month, question);
      setInsights(result.advice);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyInsights(false);
    }
  }

  function askInsightQuestion(event) {
    event.preventDefault();
    const question = insightQuestion.trim();
    if (question) loadInsights(question);
  }

  const title = menu.find(([key]) => key === section)?.[1] || 'Overview';

  return (
    <div className="app-shell" data-theme="dark">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setSection('overview'); }}>
          <span className="brand-mark">p.</span>
          <span>Pocket<span className="brand-light">Plan</span></span>
        </a>
        <span className="nav-caption">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {menu.map(([key, label, glyph]) => (
            <button key={key} className={`nav-link ${section === key ? 'active' : ''}`} onClick={() => setSection(key)}>
              <span className="icon" aria-hidden="true">{glyph}</span>{label}
              {key === 'insights' && <span className="nav-badge">AI</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <div className="privacy-mark">⌑</div>
          <strong>Private by design.</strong>
          <p>Your question and monthly totals go to Gemini, never transaction descriptions or notes.</p>
        </div>
        <div className="sidebar-footer">
          <span className="avatar">Y</span>
          <span><strong>Your workspace</strong><small>Single-user demo</small></span>
          <span className="muted-dot">●</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> {title}</div>
          <div className="topbar-actions">
            <label className="month-select">
              <span className="sr-only">Select month</span>
              <input aria-label="Select month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
            </label>
            <button className="button button-primary" onClick={() => { setError(''); setShowTransactionForm(true); }}>
              <span>＋</span> Add transaction
            </button>
          </div>
        </header>

        <div className="page-content">
          {error && <div className="notice notice-error" role="alert"><strong>Something needs attention.</strong> {error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
          {success && <div className="notice notice-success" role="status">{success}<button onClick={() => setSuccess('')} aria-label="Dismiss message">×</button></div>}
          {loading && !summary ? <div className="loading-card">Loading your money overview…</div> : null}
          {!loading && !summary && !error ? <div className="loading-card">No dashboard data yet. Try refreshing.</div> : null}

          {summary && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow"><span className="live-dot" /> YOUR MONEY, IN PERSPECTIVE</div>
                  <h1>{greeting()}, Akhil <span className="wave">✳</span></h1>
                  <p>A clearer picture of {monthLabel(month).toLowerCase()}, one small step at a time.</p>
                </div>
                <button className="button button-quiet" onClick={loadData} disabled={loading} aria-label="Refresh overview">
                  <span className="icon" aria-hidden="true">⟳</span> Refresh
                </button>
              </section>

              {section === 'overview' && (
                <>
                  <section className="summary-grid" aria-label="Monthly financial summary">
                    <SummaryCard label="Money in" value={formatMoney(summary.totalIncome)} helper="Income received this month" icon="↙" tone="mint" />
                    <SummaryCard label="Money out" value={formatMoney(summary.totalExpenses)} helper="Spending recorded this month" icon="↗" tone="peach" />
                    <SummaryCard label="Left to plan" value={formatMoney(summary.netBalance)} helper="Income minus spending" icon="◌" tone="lavender" />
                    <SummaryCard label="Saved so far" value={`${summary.savingsRate.toFixed(0)}%`} helper="Of this month's recorded income" icon="✳" tone="yellow" />
                  </section>
                  <section className="dashboard-grid">
                    <div className="panel budget-panel">
                      <div className="panel-header"><div><span className="eyebrow">YOUR GUARDRAILS</span><h2>Monthly budgets</h2></div><button className="text-link" onClick={() => setSection('budgets')}>See all →</button></div>
                      <BudgetList budgets={summary.budgets.slice(0, 4)} />
                      {summary.budgets.length === 0 && <EmptyMessage title="No budgets yet" text="Set a monthly limit to keep a spending goal in sight." />}
                    </div>
                    <div className="panel category-panel">
                      <div className="panel-header"><div><span className="eyebrow">WHERE IT WENT</span><h2>Spending by category</h2></div></div>
                      <CategoryList categories={summary.categorySpending} />
                    </div>
                  </section>
                </>
              )}

              {section === 'transactions' && (
                <section className="panel full-panel">
                  <div className="panel-header"><div><span className="eyebrow">YOUR ACTIVITY</span><h2>Transactions</h2><p>{transactions.length} transactions in {monthLabel(month)}</p></div></div>
                  <TransactionList transactions={transactions} onDelete={removeTransaction} />
                </section>
              )}

              {section === 'budgets' && (
                <section className="panel full-panel">
                  <div className="panel-header"><div><span className="eyebrow">PLAN WITH INTENTION</span><h2>Monthly budgets</h2><p>Set a spending limit for each category in {monthLabel(month)}.</p></div></div>
                  <form className="budget-form" onSubmit={saveBudget}>
                    <label>Category
                      <CategoryField
                        value={budgetForm.category}
                        customValue={budgetForm.customCategory}
                        onChange={(category, customCategory) => setBudgetForm({ ...budgetForm, category, customCategory })}
                      />
                    </label>
                    <label>Monthly limit (₹)<input required min="0.01" step="0.01" type="number" value={budgetForm.monthlyLimit} onChange={(event) => setBudgetForm({ ...budgetForm, monthlyLimit: event.target.value })} placeholder="e.g. 8000" /></label>
                    <button className="button button-primary">Save budget</button>
                  </form>
                  <BudgetList budgets={summary.budgets} />
                  {summary.budgets.length === 0 && <EmptyMessage title="Start with one category" text="A small, realistic limit is more useful than a perfect plan." />}
                </section>
              )}

              {section === 'insights' && (
                <section className="panel full-panel insights-panel">
                  <div className="panel-header"><div><span className="eyebrow">GEMINI AI · THOUGHTFUL, NOT JUDGMENTAL</span><h2>Your monthly insights</h2><p>Get suggestions or ask a question about this month’s spending and budgets.</p></div>
                    <button className="button button-primary" onClick={() => loadInsights()} disabled={busyInsights}>{busyInsights ? 'Asking Gemini…' : '✳ Get suggestions'}</button>
                  </div>
                  <form className="insight-question-form" onSubmit={askInsightQuestion}>
                    <label htmlFor="insight-question">Ask about your finances</label>
                    <div className="insight-question-row">
                      <input id="insight-question" type="text" maxLength="500" required value={insightQuestion} onChange={(event) => setInsightQuestion(event.target.value)} placeholder="e.g. Which category should I focus on reducing?" />
                      <button className="button button-secondary" type="submit" disabled={busyInsights || !insightQuestion.trim()}>{busyInsights ? 'Asking Gemini…' : 'Ask question'}</button>
                    </div>
                  </form>
                  {insights ? <InsightList advice={insights} /> : <EmptyMessage title="Your money, your patterns" text="Get monthly suggestions or ask Gemini a question about your spending. Add a Gemini API key to .env to enable AI." />}
                  <p className="privacy-footnote">When you ask, PocketPlan sends your question (if provided) and monthly totals, category totals, and budgets to Google Gemini. Transaction descriptions and notes are not sent. AI answers are not financial advice.</p>
                </section>
              )}
            </>
          )}
        </div>
      </main>

      {showTransactionForm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowTransactionForm(false); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="transaction-form-title">
            <div className="modal-heading"><div><span className="eyebrow">MAKE IT COUNT</span><h2 id="transaction-form-title">Add a transaction</h2></div><button className="close-button" onClick={() => setShowTransactionForm(false)} aria-label="Close form">×</button></div>
            <form className="transaction-form" onSubmit={saveTransaction}>
              <label>Description<input required maxLength="120" autoFocus value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What was it?" /></label>
              <div className="form-row"><label>Amount (₹)<input required min="0.01" step="0.01" type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label><label>Type<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="EXPENSE">Expense</option><option value="INCOME">Income</option></select></label></div>
              <div className="form-row"><label>Category
                <CategoryField
                  value={form.category}
                  customValue={form.customCategory}
                  onChange={(category, customCategory) => setForm({ ...form, category, customCategory })}
                />
              </label><label>Date<input required type="date" value={form.occurredOn} onChange={(event) => setForm({ ...form, occurredOn: event.target.value })} /></label></div>
              <label>Note <span className="optional-label">(optional)</span><input maxLength="500" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Add a little context" /></label>
              <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setShowTransactionForm(false)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save transaction'}</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
