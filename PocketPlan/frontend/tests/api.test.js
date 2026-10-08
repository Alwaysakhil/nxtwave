import assert from 'node:assert/strict';
import test from 'node:test';
import { currentMonth, formatMoney, monthLabel } from '../src/api.js';

test('current month uses the YYYY-MM format', () => {
  assert.match(currentMonth(), /^\d{4}-(0[1-9]|1[0-2])$/);
});

test('money formatting uses Indian rupees', () => {
  assert.match(formatMoney(1200), /₹/);
  assert.match(formatMoney(1200), /1,200/);
});

test('month labels include a month and year', () => {
  assert.match(monthLabel('2026-10'), /2026/);
});
