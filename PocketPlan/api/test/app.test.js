import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { generateAiAdvice } from '../src/gemini.js';

test('Gemini receives only the supplied monthly summary and returns its text suggestions', async () => {
  let request;
  const advice = await generateAiAdvice(async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '- Review dining.' }, { text: '- Keep saving.' }] } }],
      }),
    };
  }, 'test-api-key', {
    month: '2026-10',
    income: 50000,
    expensesByCategory: { Dining: 6000 },
    budgetsByCategory: { Dining: 7000 },
  });

  assert.equal(advice, '- Review dining.\n- Keep saving.');
  assert.match(request.url, /gemini-3\.5-flash:generateContent$/);
  assert.equal(request.options.headers['x-goog-api-key'], 'test-api-key');
  const body = JSON.parse(request.options.body);
  assert.match(body.contents[0].parts[0].text, /"expensesByCategory"/);
  assert.doesNotMatch(body.contents[0].parts[0].text, /description|notes|test-api-key/i);
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'MINIMAL');
});

test('AI suggestions fail clearly when no Gemini key is configured', async () => {
  await assert.rejects(
    generateAiAdvice(async () => assert.fail('Gemini should not be called without a key'), '', {}),
    { message: /GEMINI_API_KEY/, statusCode: 503 },
  );
});

test('AI reports a model-specific message for an unavailable Gemini model', async () => {
  await assert.rejects(
    generateAiAdvice(async () => ({ ok: false, status: 404 }), 'test-api-key', {}),
    { message: /Gemini model is unavailable/, statusCode: 503 },
  );
});

test('insights route sends summary numbers, not transaction details, to Gemini', async () => {
  const requests = [];
  const pool = {
    execute: async (sql) => {
      if (sql.includes('GROUP BY category')) {
        return [[{ category: 'Dining', amount: 250 }]];
      }
      if (sql.includes('FROM monthly_budgets')) {
        return [[{ category: 'Dining', monthly_limit: 500 }]];
      }
      return [[{ income: 3000, expenses: 250 }]];
    },
  };
  const server = createApp({
    pool,
    geminiApiKey: 'test-api-key',
    fetchImplementation: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Review dining spending.' }] } }],
        }),
      };
    },
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/insights?month=2026-10`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'How can I reduce dining spending?' }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { advice: 'Review dining spending.' });
    const prompt = requests[0].contents[0].parts[0].text;
    assert.match(prompt, /"expensesByCategory"/);
    assert.match(prompt, /How can I reduce dining spending/);
    assert.doesNotMatch(prompt, /description|notes/i);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
