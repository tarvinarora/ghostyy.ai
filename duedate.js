// Smart typing: pull a due date/time out of a task's text.
// "Assignment due at Nov 01 at 11:59 PM" -> { text: 'Assignment', dueAt: <Nov 1, 23:59> }
// Only clear dates count (a month name with a day, today/tomorrow, a weekday's full
// name, a numeric date with a year or after "due/by/on") and clear times (11:59 PM,
// 5pm, 17:30, noon, midnight), so ordinary task text is left alone.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const DAY_NUM = '(\\d{1,2})(?:st|nd|rd|th)?';
const YEAR = '(?:,?\\s+(\\d{4}))?';

const DATE_PATTERNS = [
  // Nov 01, November 1st, Nov. 1, 2026
  { re: new RegExp(`\\b${MONTH_RE}\\s+${DAY_NUM}\\b${YEAR}`, 'i'), get: (m) => ({ month: MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()), day: +m[2], year: m[3] && +m[3] }) },
  // 1 Nov, 1st of November
  { re: new RegExp(`\\b${DAY_NUM}\\s+(?:of\\s+)?${MONTH_RE}(?![a-z])${YEAR}`, 'i'), get: (m) => ({ month: MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()), day: +m[1], year: m[3] && +m[3] }) },
  // 11/01/2026 or 11/1/26 (month first)
  { re: /\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/, get: (m) => ({ month: +m[1] - 1, day: +m[2], year: m[3].length === 2 ? 2000 + +m[3] : +m[3] }) },
  // 11/01 only right after due/by/on, so "read 1/2 of the book" stays a fraction
  { re: /(?<=\b(?:due|by|on)\s+(?:on\s+|by\s+)?)(\d{1,2})\/(\d{1,2})\b(?!\/)/i, get: (m) => ({ month: +m[1] - 1, day: +m[2] }) },
  { re: /\b(today|tonight)\b/i, get: () => ({ offset: 0 }) },
  { re: /\b(tomorrow|tmrw?)\b/i, get: () => ({ offset: 1 }) },
  { re: new RegExp(`\\b(next\\s+)?(${DAYS.join('|')})\\b`, 'i'), get: (m) => ({ weekday: DAYS.indexOf(m[2].toLowerCase()), next: !!m[1] }) },
];

const TIME_RE = /\b(?:(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m\.?(?![a-z])|([01]?\d|2[0-3]):([0-5]\d)\b|(noon|midnight|midday)\b|(end of (?:the )?day|eod)\b)/i;

// Little words that only make sense next to a date: "due at", "by", "on", ...
const LEAD_IN = /(?:\s*(?:,|-|–|@|\bdue(?:\s+(?:at|on|by|before))?|\bby|\bon|\bat|\bbefore)\s*)*$/i;

function readTime(m) {
  if (m[6]) return /noon|midday/i.test(m[6]) ? [12, 0] : [23, 59]; // "due at midnight" means the end of that day
  if (m[7]) return [23, 59];
  if (m[4]) return [+m[4], +m[5]];
  let h = +m[1];
  if (h < 1 || h > 12) return null;
  if (/p/i.test(m[3]) && h !== 12) h += 12;
  if (/a/i.test(m[3]) && h === 12) h = 0;
  return [h, m[2] ? +m[2] : 0];
}

function resolveDate(d, now) {
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  if (d.offset !== undefined) { base.setDate(base.getDate() + d.offset); return base; }
  if (d.weekday !== undefined) {
    let ahead = (d.weekday - base.getDay() + 7) % 7;
    if (d.next && ahead === 0) ahead = 7;
    base.setDate(base.getDate() + ahead);
    return base;
  }
  if (d.month < 0 || d.month > 11 || d.day < 1 || d.day > 31) return null;
  const out = new Date(d.year || base.getFullYear(), d.month, d.day);
  if (out.getMonth() !== d.month) return null; // Feb 30 and friends
  // No year and well in the past: it's next year's (typing "Jan 5" in December).
  if (!d.year && base - out > 60 * 86400000) out.setFullYear(out.getFullYear() + 1);
  return out;
}

// Cut a match out of the text, along with any "due at" / "by" just before it.
function cut(text, index, length) {
  const before = text.slice(0, index).replace(LEAD_IN, '');
  return `${before} ${text.slice(index + length)}`;
}

function parseDue(input, now = Date.now()) {
  const original = String(input ?? '');
  let text = original;
  let date = null;
  for (const p of DATE_PATTERNS) {
    const m = text.match(p.re);
    if (!m) continue;
    date = resolveDate(p.get(m), now);
    if (!date) continue;
    text = cut(text, m.index, m[0].length);
    break;
  }
  let time = null;
  const tm = text.match(TIME_RE);
  if (tm) {
    time = readTime(tm);
    if (time) text = cut(text, tm.index, tm[0].length);
  }
  if (!date && !time) return { text: original.trim(), dueAt: null };

  let due;
  if (date) {
    due = date;
    const [h, min] = time || [23, 59]; // a date alone means by the end of that day
    due.setHours(h, min, 0, 0);
  } else {
    due = new Date(now);
    due.setHours(time[0], time[1], 0, 0);
    if (due.getTime() <= now) due.setDate(due.getDate() + 1); // that time has passed today: tomorrow
  }

  text = text.replace(/\s+/g, ' ').replace(/^[\s,:;–-]+|[\s,:;–-]+$/g, '').trim();
  return { text: text || original.trim(), dueAt: due.getTime() };
}

module.exports = { parseDue };
