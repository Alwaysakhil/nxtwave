import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseMonth,
  shiftMonth,
  validateBudget,
  validateInsightQuestion,
  validateTransaction,
  ValidationError,
} from '../src/validation.js';

test('month validation rejects invalid calendar months', () => {
  assert.equal(parseMonth('2026-10'), '2026-10');
  assert.throws(() => parseMonth('2026-13'), ValidationError);
  assert.throws(() => parseMonth('2026-1'), ValidationError);
});

test('month shifting handles year boundaries', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});

test('transaction validation trims text and normalizes type', () => {
  const transaction = validateTransaction({
    description: ' Coffee ', amount: '145.50', type: 'expense', category: ' Dining ',
    occurredOn: '2026-10-08', notes: '  ',
  });
  assert.equal(transaction.description, 'Coffee');
  assert.equal(transaction.type, 'EXPENSE');
  assert.equal(transaction.notes, null);
});

test('transaction validation rejects invalid dates and sub-paise values', () => {
  assert.throws(() => validateTransaction({
    description: 'Test', amount: 1.001, type: 'EXPENSE', category: 'Test', occurredOn: '2026-02-30',
  }), ValidationError);
});

test('budget validation rejects zero and negative limits', () => {
  assert.throws(() => validateBudget({ category: 'Dining', monthlyLimit: 0 }), ValidationError);
  assert.throws(() => validateBudget({ category: 'Dining', monthlyLimit: '-1' }), ValidationError);
});

test('insight questions are trimmed and limited to 500 characters', () => {
  assert.equal(validateInsightQuestion({ question: '  How can I save?  ' }), 'How can I save?');
  assert.equal(validateInsightQuestion({ question: null }), null);
  assert.throws(() => validateInsightQuestion({ question: 'x'.repeat(501) }), ValidationError);
  assert.throws(() => validateInsightQuestion({ question: '  ' }), ValidationError);
});
