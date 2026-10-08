// Unit tests for the storage logic (spaced review, daily streak, backups, test rules).
// Run with: node tests/store-test.js   (no browser needed)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const DAY = 24 * 60 * 60 * 1000;

// A minimal localStorage stand-in, so store.js runs outside a browser
const memory = new Map();
const context = {
  localStorage: {
    getItem: key => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key),
  },
  console,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'questions.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'store.js'), 'utf8'), context);
vm.runInContext('Store.reset();', context);
const Store = vm.runInContext('Store', context);
const QUESTIONS = vm.runInContext('QUESTIONS', context);

let passed = 0;
function check(cond, msg) {
  if (!cond) throw new Error('FAILED: ' + msg);
  passed++;
  console.log('  ok - ' + msg);
}

const id = QUESTIONS[0].id;
const other = QUESTIONS[1].id;

// ----- spaced review -----
check(Store.isDue(id), 'a new question is due');
Store.recordAnswer(id, true);
let s = Store.statsFor(id);
check(s.box === 2, 'a right answer moves the question up one box');
check(s.due > Date.now() + 0.9 * DAY && s.due < Date.now() + 1.1 * DAY, 'box 2 comes back in about 1 day');
check(!Store.isDue(id), 'a question answered right is not due straight away');

Store.recordAnswer(id, true);
s = Store.statsFor(id);
check(s.box === 3 && s.due > Date.now() + 2.9 * DAY && s.due < Date.now() + 3.1 * DAY, 'box 3 comes back in about 3 days');

Store.recordAnswer(id, false);
s = Store.statsFor(id);
check(s.box === 1 && s.last === 'wrong', 'a wrong answer drops the question back to box 1');
check(Store.isDue(id), 'a question answered wrong is due again straight away');

check(Store.statsFor(id).last === 'wrong' && Store.statsFor(other).last === null, 'only the last wrong answer counts as missed');

const dueBefore = Store.dueCount();
Store.recordAnswer(other, true);
check(Store.dueCount() === dueBefore - 1, 'answering a question right takes it out of the due count');

// ----- daily goal and streak -----
Store.reset();
check(Store.todayCount() === 0 && Store.streak() === 0, 'no activity yet: today 0, streak 0');
Store.recordAnswer(id, true);
Store.recordAnswer(other, false);
check(Store.todayCount() === 2, 'today counts every answer');
check(Store.streak() === 1, 'answering today makes a streak of 1');

const today = new Date();
const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const yesterday = new Date(today.getTime() - DAY);
const twoDaysAgo = new Date(today.getTime() - 2 * DAY);
const threeDaysAgo = new Date(today.getTime() - 3 * DAY);
const backupWithDays = {
  format: 'cdl-quiz-progress',
  data: {
    questions: {}, saved: [], attempts: [], session: null, theme: null, rules: null, reports: [],
    daily: { [dayKey(today)]: 5, [dayKey(yesterday)]: 9, [dayKey(twoDaysAgo)]: 2, [dayKey(threeDaysAgo)]: 0, 'not-a-date': 4 },
  },
};
Store.importText(JSON.stringify(backupWithDays));
check(Store.todayCount() === 5, 'imported activity for today is kept');
check(Store.streak() === 3, 'streak counts back over consecutive days and stops at an empty day');

Store.importText(JSON.stringify({ format: 'cdl-quiz-progress', data: { daily: { [dayKey(yesterday)]: 4 } } }));
check(Store.todayCount() === 0 && Store.streak() === 1, 'if today has no answers yet, the streak counts from yesterday');

// ----- backups -----
Store.reset();
Store.recordAnswer(id, true);
Store.toggleSaved(other);
const backup = Store.exportText();
Store.reset();
check(Store.statsFor(id).seen === 0, 'reset clears the stats');
Store.importText(backup);
check(Store.statsFor(id).seen === 1 && Store.isSaved(other), 'a backup restores stats and bookmarks');

let rejected = false;
try { Store.importText('{"format":"something else"}'); } catch (e) { rejected = true; }
check(rejected, 'a file that is not a backup is refused');

Store.importText(JSON.stringify({ format: 'cdl-quiz-progress', data: { questions: { 'no-such-question': { seen: 3, right: 3 } }, saved: ['no-such-question'] } }));
check(Store.statsFor('no-such-question').seen === 0 && Store.savedIds.length === 0, 'unknown question ids in a backup are ignored');

// ----- test rules -----
Store.resetRules();
check(Store.rules()['Air Brakes'].count === 25 && Store.rules()['General Knowledge'].minutes === 60, 'typical layout is the default');
Store.setRules({ 'Air Brakes': { count: 999, pass: 10, minutes: 1 }, 'Combination Vehicles': { count: 12, pass: 75, minutes: 45 }, 'General Knowledge': { count: 50, pass: 80, minutes: 60 } });
const rules = Store.rules();
check(rules['Air Brakes'].count === 25 && rules['Air Brakes'].pass === 80 && rules['Air Brakes'].minutes === 60, 'out-of-range rules fall back to the typical layout');
check(rules['Combination Vehicles'].count === 12 && rules['Combination Vehicles'].pass === 75, 'valid rules are kept');
Store.resetRules();

console.log('All ' + passed + ' store checks passed.');
