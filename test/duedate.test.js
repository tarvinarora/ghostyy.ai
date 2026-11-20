const test = require('node:test');
const assert = require('node:assert');
const { parseDue } = require('../duedate');

// Friday, Nov 20 2026, 10:00 local time
const NOW = new Date(2026, 10, 20, 10, 0).getTime();
const at = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi).getTime();
const p = (s) => parseDue(s, NOW);

test('the example: name and due date are split apart', () => {
  assert.deepEqual(p('Assignment due at Nov 01 at 11:59 PM'), { text: 'Assignment', dueAt: at(2026, 10, 1, 23, 59) });
});

test('month-name dates in a few spellings', () => {
  assert.deepEqual(p('Essay due November 3rd 5pm'), { text: 'Essay', dueAt: at(2026, 10, 3, 17, 0) });
  assert.deepEqual(p('Lab report by Dec. 4, 2026 at 9:30 am'), { text: 'Lab report', dueAt: at(2026, 11, 4, 9, 30) });
  assert.deepEqual(p('Pay rent 1st of December'), { text: 'Pay rent', dueAt: at(2026, 11, 1, 23, 59) });
  assert.deepEqual(p('Nov 25 11pm: submit quiz'), { text: 'submit quiz', dueAt: at(2026, 10, 25, 23, 0) });
});

test('a date with no time means the end of that day; no year rolls into next year when long past', () => {
  assert.deepEqual(p('Taxes due Jan 5'), { text: 'Taxes', dueAt: at(2027, 0, 5, 23, 59) });
});

test('relative days and weekdays', () => {
  assert.deepEqual(p('Call mom tomorrow at 6pm'), { text: 'Call mom', dueAt: at(2026, 10, 21, 18, 0) });
  assert.deepEqual(p('Groceries today'), { text: 'Groceries', dueAt: at(2026, 10, 20, 23, 59) });
  assert.deepEqual(p('Team sync monday 14:00'), { text: 'Team sync', dueAt: at(2026, 10, 23, 14, 0) });
  assert.deepEqual(p('Review next friday noon'), { text: 'Review', dueAt: at(2026, 10, 27, 12, 0) });
});

test('a time alone is today, or tomorrow once it has passed', () => {
  assert.deepEqual(p('Standup at 11am'), { text: 'Standup', dueAt: at(2026, 10, 20, 11, 0) });
  assert.deepEqual(p('Stretch at 9am'), { text: 'Stretch', dueAt: at(2026, 10, 21, 9, 0) });
});

test('numeric dates', () => {
  assert.deepEqual(p('Midterm 12/10/2026'), { text: 'Midterm', dueAt: at(2026, 11, 10, 23, 59) });
  assert.deepEqual(p('Form due 12/1'), { text: 'Form', dueAt: at(2026, 11, 1, 23, 59) });
});

test('ordinary text is left alone', () => {
  for (const s of ['Read 1/2 of the book', 'Buy milk', 'Plan the may festival', 'Chapter 11 notes', 'Watch 3 lectures']) {
    assert.deepEqual(p(s), { text: s, dueAt: null });
  }
});

test('text that is only a date keeps its wording as the name', () => {
  assert.deepEqual(p('tomorrow 5pm'), { text: 'tomorrow 5pm', dueAt: at(2026, 10, 21, 17, 0) });
});
