async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const payload = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(payload?.message || `Request failed (${response.status})`);
  }
  return payload;
}

export const api = {
  dashboard: (month) => request(`/api/dashboard?month=${encodeURIComponent(month)}`),
  transactions: (month) => request(`/api/transactions?month=${encodeURIComponent(month)}`),
  createTransaction: (transaction) =>
    request('/api/transactions', { method: 'POST', body: JSON.stringify(transaction) }),
  deleteTransaction: (id) =>
    request(`/api/transactions/${id}`, { method: 'DELETE' }),
  saveBudget: (month, budget) =>
    request(`/api/budgets?month=${encodeURIComponent(month)}`, {
      method: 'PUT',
      body: JSON.stringify(budget),
    }),
  insights: (month, question = null) =>
    request(`/api/insights?month=${encodeURIComponent(month)}`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),
};

export function currentMonth() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMoney(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function monthLabel(value) {
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' })
    .format(new Date(`${value}-01T00:00:00`));
}
