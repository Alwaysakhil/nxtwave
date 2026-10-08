import { formatMoney } from './api.js';

export const OTHER_CATEGORY = '__other__';

const categories = [
  'Bills & Utilities',
  'Books',
  'Business',
  'Childcare',
  'Clothing',
  'Donations',
  'Education',
  'Electronics',
  'Entertainment',
  'Fees & Charges',
  'Food & Dining',
  'Gifts',
  'Groceries',
  'Healthcare',
  'Home & Garden',
  'Insurance',
  'Loans',
  'Personal Care',
  'Pets',
  'Rent',
  'Salary',
  'Savings',
  'Shopping',
  'Subscriptions',
  'Taxes',
  'Transportation',
  'Travel',
];
const categoryOptions = [
  ...categories.map((category) => ({ value: category, label: category })),
  { value: OTHER_CATEGORY, label: 'Other (custom)' },
].sort((a, b) => a.label.localeCompare(b.label));

export function CategoryField({ value, customValue, onChange }) {
  return <>
    <select required value={value} onChange={(event) => onChange(event.target.value, '')}>
      <option value="">Choose a category</option>
      {categoryOptions.map(({ value, label }) => (
        <option key={value} value={value}>{label}</option>
      ))}
    </select>
    {value === OTHER_CATEGORY && (
      <input
        required
        maxLength="60"
        aria-label="Custom category"
        value={customValue}
        onChange={(event) => onChange(value, event.target.value)}
        placeholder="Enter a category"
      />
    )}
  </>;
}

export function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export function SummaryCard({ label, value, helper, icon, tone }) {
  return <article className="summary-card"><div className="summary-card-top"><span>{label}</span><span className={`summary-icon ${tone}`}>{icon}</span></div><strong className="summary-value">{value}</strong><span className="summary-helper">{helper}</span></article>;
}

export function BudgetList({ budgets }) {
  if (!budgets.length) return null;
  return <div className="budget-list">{budgets.map((budget) => {
    const percent = Math.min(100, Math.round(budget.spent / budget.monthlyLimit * 100));
    return <div className="budget-item" key={`${budget.year}-${budget.month}-${budget.category}`}>
      <div className="budget-row"><div><strong>{budget.category}</strong><span>{formatMoney(budget.spent)} of {formatMoney(budget.monthlyLimit)}</span></div><span className={budget.spent > budget.monthlyLimit ? 'over-budget' : ''}>{percent}%</span></div>
      <div className="progress-track"><span className={percent >= 85 ? 'progress-warning' : ''} style={{ width: `${percent}%` }} /></div>
      <div className="budget-remaining">{budget.spent > budget.monthlyLimit ? `${formatMoney(budget.spent - budget.monthlyLimit)} over limit` : `${formatMoney(budget.monthlyLimit - budget.spent)} left`}</div>
    </div>;
  })}</div>;
}

export function CategoryList({ categories }) {
  if (!categories.length) return <EmptyMessage title="No spending recorded yet" text="Once an expense is added, you’ll see the categories that make up your month." />;
  const total = categories.reduce((sum, item) => sum + item.amount, 0);
  return <div className="category-list">{categories.slice(0, 6).map((category, index) => (
    <div className="category-item" key={category.category}>
      <span className={`category-dot dot-${index % 5}`} />
      <span className="category-name">{category.category}</span>
      <span className="category-percent">{total ? Math.round(category.amount / total * 100) : 0}%</span>
      <strong>{formatMoney(category.amount)}</strong>
    </div>
  ))}</div>;
}

export function TransactionList({ transactions, onDelete }) {
  if (!transactions.length) return <EmptyMessage title="A fresh start" text="Add a transaction to begin your monthly picture." />;
  return <div className="transaction-list">{transactions.map((transaction) => (
    <article className="transaction-row" key={transaction.id}>
      <span className={`transaction-icon ${transaction.type === 'INCOME' ? 'transaction-income' : 'transaction-expense'}`}>{transaction.type === 'INCOME' ? '↙' : '↗'}</span>
      <div className="transaction-details"><strong>{transaction.description}</strong><span>{transaction.category} <i>·</i> {transaction.occurredOn}</span></div>
      <strong className={`transaction-amount ${transaction.type === 'INCOME' ? 'amount-income' : ''}`}>{transaction.type === 'INCOME' ? '+' : '−'}{formatMoney(transaction.amount)}</strong>
      <button className="delete-button" onClick={() => onDelete(transaction)} aria-label={`Delete ${transaction.description}`}>×</button>
    </article>
  ))}</div>;
}

export function InsightList({ advice }) {
  return <article className="insight-card"><span className="insight-icon">✳</span><div><span className="eyebrow">GEMINI AI</span><p>{advice}</p></div></article>;
}

export function EmptyMessage({ title, text }) {
  return <div className="empty-message"><span>✳</span><strong>{title}</strong><p>{text}</p></div>;
}
