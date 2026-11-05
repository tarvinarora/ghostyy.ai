const test = require('node:test');
const assert = require('node:assert');
const { parseKey, quickPlan, morningPlan, breakDown } = require('../ai');

const fake = (payload, finishReason = 'STOP') => {
  const calls = [];
  return { calls, models: { generateContent: async (r) => { calls.push(r); return { candidates: [{ finishReason }], text: JSON.stringify(payload) }; } } };
};
const task = (id, text, extra = {}) => ({ id, text, listId: 'l', listName: 'Work', createdAt: 1, ...extra });

test('parseKey handles blanks, quotes and export', () => {
  assert.equal(parseKey('# c\nGEMINI_API_KEY=\n'), '');
  assert.equal(parseKey('GEMINI_API_KEY=abc'), 'abc');
  assert.equal(parseKey('export GEMINI_API_KEY="abc" '), 'abc');
});

test('quickPlan: soonest due, then Today, then oldest; steps replace their parent', () => {
  const picks = quickPlan([
    task('old', 'old', { createdAt: 1 }),
    task('today', 'today', { listName: 'Today', createdAt: 9 }),
    task('due', 'due', { dueAt: 50, createdAt: 9 }),
    task('parent', 'parent', { dueAt: 1 }),
    task('step', 'step', { parentId: 'parent', createdAt: 5 }),
  ]);
  assert.deepEqual(picks.map((p) => p.taskId), ['due', 'today', 'old']);
});

test('morningPlan with three or fewer tasks makes no API call', async () => {
  const client = fake({ picks: [] });
  await morningPlan({ client, open: [task('a', 'a')] });
  assert.equal(client.calls.length, 0);
});

test('morningPlan drops invented and repeated picks', async () => {
  const client = fake({ picks: [{ id: 2, why: 'soon' }, { id: 2, why: 'again' }, { id: 99, why: 'nope' }, { id: 0, why: 'old' }] });
  const open = ['a', 'b', 'c', 'd'].map((x) => task(x, x));
  const { picks, source } = await morningPlan({ client, open });
  assert.equal(source, 'gemini');
  assert.deepEqual(picks.map((p) => p.taskId), ['c', 'a']);
  assert.equal(client.calls[0].config.responseMimeType, 'application/json');
  assert.ok(client.calls[0].config.responseJsonSchema);
});

test('morningPlan falls back locally when Gemini fails', async () => {
  const client = { models: { generateContent: async () => { throw new Error('down'); } } };
  const open = ['a', 'b', 'c', 'd'].map((x) => task(x, x));
  const out = await morningPlan({ client, open });
  assert.equal(out.source, 'local');
  assert.equal(out.picks.length, 3);
  assert.equal(out.error, 'down');
});

test('breakDown needs a key, caps steps and reports refusals', async () => {
  await assert.rejects(breakDown({ text: 'x', listName: 'L' }), /API key/);
  const steps = await breakDown({ client: fake({ steps: [' a ', '', 'b', 'c', 'd', 'e', 'f', 'g'] }), text: 'x', listName: 'L' });
  assert.deepEqual(steps, ['a', 'b', 'c', 'd', 'e', 'f']);
  await assert.rejects(breakDown({ client: fake({ steps: [] }, 'SAFETY'), text: 'x', listName: 'L' }), /declined/);
});
