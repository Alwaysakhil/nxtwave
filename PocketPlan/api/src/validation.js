export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

export function parseMonth(value) {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || Number(value.slice(0, 4)) < 1900) {
    throw new ValidationError('Month must use YYYY-MM format.');
  }
  return value;
}

export function shiftMonth(value, offset) {
  const month = parseMonth(value);
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function cleanText(value, name, maximum, required = true) {
  if (value === null || value === undefined) {
    if (!required) return null;
    throw new ValidationError(`${name} is required.`);
  }
  if (typeof value !== 'string') throw new ValidationError(`${name} must be text.`);
  const result = value.trim();
  if (required && result.length === 0) throw new ValidationError(`${name} is required.`);
  if (result.length > maximum) throw new ValidationError(`${name} cannot exceed ${maximum} characters.`);
  return result || null;
}

function cleanAmount(value, name = 'Amount') {
  const text = typeof value === 'string' ? value : String(value);
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) {
    throw new ValidationError(`${name} must be a positive amount with no more than two decimal places.`);
  }
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError(`${name} must be greater than zero.`);
  return amount;
}

function cleanDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError('Date must use YYYY-MM-DD format.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new ValidationError('Date must be a valid calendar date.');
  }
  return value;
}

export function validateTransaction(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Each transaction must be a JSON object.');
  }
  const type = typeof input.type === 'string' ? input.type.toUpperCase() : '';
  if (!['INCOME', 'EXPENSE'].includes(type)) {
    throw new ValidationError('Type must be INCOME or EXPENSE.');
  }
  return {
    description: cleanText(input.description, 'Description', 120),
    amount: cleanAmount(input.amount),
    type,
    category: cleanText(input.category, 'Category', 60),
    occurredOn: cleanDate(input.occurredOn),
    notes: cleanText(input.notes, 'Notes', 500, false),
  };
}

export function validateBudget(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Budget must be a JSON object.');
  }
  return {
    category: cleanText(input.category, 'Category', 60),
    monthlyLimit: cleanAmount(input.monthlyLimit, 'Monthly limit'),
  };
}

export function validateInsightQuestion(input) {
  if (input === undefined) return null;
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Question must be a JSON object.');
  }
  if (input.question === undefined || input.question === null) return null;
  return cleanText(input.question, 'Question', 500);
}
