'use strict';

// Everything the app remembers lives here. It is saved in this browser's localStorage.
// Nothing is sent anywhere. Users can export a backup file and import it on another device.

const Store = (function () {
  const KEY = 'cdl-quiz-data-v3';
  const FORMAT = 'cdl-quiz-progress';
  const byId = new Map(QUESTIONS.map(q => [q.id, q]));

  let data = blank();

  function blank() {
    return { questions: {}, saved: [], attempts: [], session: null, theme: null };
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
      };
    }
    out.saved = (Array.isArray(raw.saved) ? raw.saved : []).filter((id, i, all) => byId.has(id) && all.indexOf(id) === i);
    out.attempts = (Array.isArray(raw.attempts) ? raw.attempts : []).filter(validAttempt).slice(-200);
    out.session = validSession(raw.session) ? raw.session : null;
    out.theme = raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : null;
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
    return data.questions[id] || { seen: 0, right: 0, wrong: 0, last: null };
  }

  function recordAnswer(id, isCorrect) {
    const s = data.questions[id] || (data.questions[id] = { seen: 0, right: 0, wrong: 0, last: null });
    s.seen++;
    if (isCorrect) s.right++;
    else s.wrong++;
    s.last = isCorrect ? 'right' : 'wrong';
    save();
  }

  function missedIds() {
    return Object.keys(data.questions).filter(id => data.questions[id].last === 'wrong');
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
    load, statsFor, recordAnswer, missedIds, isSaved, toggleSaved,
    addAttempt, setSession, session, theme, setTheme, reset, exportText, importText,
    get attempts() { return data.attempts; },
    get savedIds() { return data.saved; },
  };
})();
