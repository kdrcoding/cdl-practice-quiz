'use strict';

// Everything the app remembers lives here. It is saved in this browser's localStorage.
// Nothing is sent anywhere. Users can export a backup file and import it on another device.

const Store = (function () {
  const KEY = 'cdl-quiz-data-v3';
  const FORMAT = 'cdl-quiz-progress';
  const DAY = 24 * 60 * 60 * 1000;
  // Spaced review: after each right answer a question waits longer before it comes back.
  const BOX_DAYS = [0, 1, 3, 7, 14];
  const byId = new Map(QUESTIONS.map(q => [q.id, q]));

  // Typical layout for most states. Users can change these in the app, because layouts vary.
  const DEFAULT_RULES = {
    'Air Brakes': { count: 25, pass: 80, minutes: 60 },
    'Combination Vehicles': { count: 20, pass: 80, minutes: 60 },
    'General Knowledge': { count: 50, pass: 80, minutes: 60 },
  };

  let data = blank();

  function blank() {
    return { questions: {}, saved: [], attempts: [], session: null, theme: null, rules: null, reports: [] };
  }

  function count(value) {
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  }

  function validAttempt(a) {
    return a && typeof a === 'object' && Number.isFinite(a.at)
      && typeof a.subject === 'string' && (a.kind === 'practice' || a.kind === 'mock')
      && Number.isInteger(a.total) && Number.isInteger(a.scored) && Number.isInteger(a.right);
  }

  function validSession(s) {
    if (!s || typeof s !== 'object') return false;
    if (!Array.isArray(s.ids) || s.ids.length === 0 || !s.ids.every(id => byId.has(id))) return false;
    if (!Number.isInteger(s.index) || s.index < 0 || s.index >= s.ids.length) return false;
    if (s.mode !== 'study' && s.mode !== 'exam') return false;
    if (s.kind !== 'practice' && s.kind !== 'mock') return false;
    if (typeof s.answers !== 'object' || s.answers === null) return false;
    return true;
  }

  function sanitizeRules(raw) {
    const out = {};
    for (const name of Object.keys(DEFAULT_RULES)) {
      const d = DEFAULT_RULES[name];
      const r = raw && typeof raw === 'object' && raw[name] ? raw[name] : {};
      const inRange = (v, lo, hi, fallback) => Number.isInteger(v) && v >= lo && v <= hi ? v : fallback;
      const size = QUESTIONS.filter(q => q.subject === name).length;
      out[name] = {
        count: inRange(r.count, 1, size, d.count),
        pass: inRange(r.pass, 50, 100, d.pass),
        minutes: inRange(r.minutes, 5, 240, d.minutes),
      };
    }
    return out;
  }

  function sanitize(raw) {
    const out = blank();
    const stats = raw.questions && typeof raw.questions === 'object' ? raw.questions : {};
    for (const id of Object.keys(stats)) {
      const s = stats[id];
      if (!byId.has(id) || !s || typeof s !== 'object') continue;
      out.questions[id] = {
        seen: count(s.seen),
        right: count(s.right),
        wrong: count(s.wrong),
        last: s.last === 'right' || s.last === 'wrong' ? s.last : null,
        box: Number.isInteger(s.box) && s.box >= 1 && s.box <= 5 ? s.box : 1,
        due: Number.isFinite(s.due) ? s.due : null,
      };
    }
    out.saved = (Array.isArray(raw.saved) ? raw.saved : []).filter((id, i, all) => byId.has(id) && all.indexOf(id) === i);
    out.attempts = (Array.isArray(raw.attempts) ? raw.attempts : []).filter(validAttempt).slice(-200);
    out.session = validSession(raw.session) ? raw.session : null;
    out.theme = raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : null;
    out.rules = raw.rules ? sanitizeRules(raw.rules) : null;
    out.reports = (Array.isArray(raw.reports) ? raw.reports : [])
      .filter(r => r && byId.has(r.id) && Number.isFinite(r.at))
      .map(r => ({ id: r.id, note: typeof r.note === 'string' ? r.note.slice(0, 500) : '', at: r.at }))
      .slice(-200);
    return out;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      // Storage can be blocked (private windows). The app keeps working for this visit.
    }
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      data = raw && typeof raw === 'object' ? sanitize(raw) : blank();
    } catch (e) {
      data = blank();
    }
    return data;
  }

  // ----- questions -----

  function statsFor(id) {
    return data.questions[id] || { seen: 0, right: 0, wrong: 0, last: null, box: 1, due: null };
  }

  function recordAnswer(id, isCorrect) {
    const s = data.questions[id] || (data.questions[id] = { seen: 0, right: 0, wrong: 0, last: null, box: 1, due: null });
    const now = Date.now();
    s.seen++;
    if (isCorrect) {
      s.right++;
      s.box = Math.min(5, s.box + 1);
      s.due = now + BOX_DAYS[s.box - 1] * DAY;
    } else {
      s.wrong++;
      s.box = 1;
      s.due = now;
    }
    s.last = isCorrect ? 'right' : 'wrong';
    save();
  }

  // A question is due when it has never been answered, or its review time has passed.
  function isDue(id, now) {
    const s = statsFor(id);
    return s.seen === 0 || s.due === null || s.due <= (now || Date.now());
  }

  function dueCount() {
    const now = Date.now();
    return QUESTIONS.filter(q => isDue(q.id, now)).length;
  }

  function isSaved(id) { return data.saved.includes(id); }

  function toggleSaved(id) {
    data.saved = isSaved(id) ? data.saved.filter(x => x !== id) : [...data.saved, id];
    save();
  }

  // ----- tests -----

  function addAttempt(attempt) {
    data.attempts = [...data.attempts, attempt].slice(-200);
    save();
  }

  function setSession(session) {
    data.session = session;
    save();
  }

  function session() { return data.session; }

  // ----- reports (questions the user says look wrong or unclear) -----

  function reports() { return data.reports.slice(); }

  function addReport(id, note) {
    data.reports = [...data.reports, { id, note: note.slice(0, 500), at: Date.now() }].slice(-200);
    save();
  }

  function removeReport(at) {
    data.reports = data.reports.filter(r => r.at !== at);
    save();
  }

  // ----- test rules (questions, pass mark, time limit per subject) -----

  function rules() {
    return JSON.parse(JSON.stringify(data.rules || DEFAULT_RULES));
  }

  function setRules(next) {
    data.rules = sanitizeRules(next);
    save();
  }

  function resetRules() {
    data.rules = null;
    save();
  }

  // ----- settings and backup -----

  function theme() { return data.theme; }

  function setTheme(value) {
    data.theme = value;
    save();
  }

  function reset() {
    data = blank();
    save();
  }

  function exportText() {
    return JSON.stringify({ format: FORMAT, version: 3, exportedAt: new Date().toISOString(), data }, null, 2);
  }

  function importText(text) {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.format !== FORMAT || !parsed.data || typeof parsed.data !== 'object') {
      throw new Error('This file is not a CDL quiz progress backup.');
    }
    data = sanitize(parsed.data);
    save();
  }

  return {
    load, statsFor, recordAnswer, isDue, dueCount, isSaved, toggleSaved,
    addReport, removeReport, reports,
    addAttempt, setSession, session, rules, setRules, resetRules,
    theme, setTheme, reset, exportText, importText,
    get attempts() { return data.attempts; },
    get savedIds() { return data.saved; },
  };
})();
