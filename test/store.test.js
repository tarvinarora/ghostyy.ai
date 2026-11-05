const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store, merge, normalize } = require('../store');

function fresh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-'));
  const s = new Store({ localDir: dir });
  s.load();
  s.unwatch();
  const list = s.view().lists[0];
  const add = (text, extra = {}) => {
    s.mutate({ type: 'add-task', listId: list.id, text, ...extra });
    clearTimeout(s.saveTimer);
    return s.view().lists[0].tasks.at(-1);
  };
  return { s, list, add };
}

test('due times, links and steps survive a normalize + merge round trip', () => {
  const t = { id: 'a', text: 'x', updatedAt: 5, dueAt: 123, link: 'https://e.com', parentId: 'p' };
  const d = normalize({ lists: [{ id: 'l', name: 'L', updatedAt: 1, tasks: [t] }] });
  assert.deepEqual(
    (({ dueAt, link, parentId }) => ({ dueAt, link, parentId }))(merge(d, d).lists[0].tasks[0]),
    { dueAt: 123, link: 'https://e.com', parentId: 'p' });
});

test('steps: last step finishes the task, reopening a step reopens it', () => {
  const { s, list, add } = fresh();
  const parent = add('Big task');
  s.mutate({ type: 'add-steps', listId: list.id, taskId: parent.id, steps: ['one', 'two'] });
  const tasks = () => s.view().lists[0].tasks;
  const [a, b] = tasks().filter((t) => t.parentId === parent.id);
  s.mutate({ type: 'toggle-task', listId: list.id, taskId: a.id });
  assert.equal(tasks()[0].done, false);
  s.mutate({ type: 'toggle-task', listId: list.id, taskId: b.id });
  assert.equal(tasks()[0].done, true);
  s.mutate({ type: 'toggle-task', listId: list.id, taskId: b.id });
  assert.equal(tasks()[0].done, false);
});

test('finishing or deleting a task carries its steps with it', () => {
  const { s, list, add } = fresh();
  const parent = add('Big task');
  s.mutate({ type: 'add-steps', listId: list.id, taskId: parent.id, steps: ['one'] });
  s.mutate({ type: 'toggle-task', listId: list.id, taskId: parent.id });
  assert.ok(s.view().lists[0].tasks.every((t) => t.done));
  s.mutate({ type: 'delete-task', listId: list.id, taskId: parent.id });
  assert.equal(s.view().lists[0].tasks.length, 0);
});

test('set-due sets and clears', () => {
  const { s, list, add } = fresh();
  const t = add('x');
  s.mutate({ type: 'set-due', listId: list.id, taskId: t.id, dueAt: 99 });
  assert.equal(s.view().lists[0].tasks[0].dueAt, 99);
  s.mutate({ type: 'set-due', listId: list.id, taskId: t.id, dueAt: null });
  assert.equal(s.view().lists[0].tasks[0].dueAt, undefined);
});

test('recap counts today’s finished tasks even after Clear done', () => {
  const { s, list, add } = fresh();
  const old = add('finished yesterday');
  const t = add('finished today');
  add('still open');
  s.mutate({ type: 'toggle-task', listId: list.id, taskId: t.id });
  s.mutate({ type: 'toggle-task', listId: list.id, taskId: old.id });
  s.shared.lists[0].tasks.find((x) => x.id === old.id).doneAt = 1;
  s.mutate({ type: 'clear-done', listId: list.id });
  assert.deepEqual(s.recap(1000), { finished: ['finished today'], carry: ['still open'] });
});
