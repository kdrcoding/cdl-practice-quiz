// Checks the question bank. Run with: node tests/check-questions.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', 'questions.js');
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(file, 'utf8') + '\nthis.QUESTIONS = QUESTIONS;', context);
const questions = context.QUESTIONS;

const SUBJECTS = ['Air Brakes', 'Combination Vehicles', 'General Knowledge'];
const problems = [];
const fail = (q, msg) => problems.push((q ? q.id + ': ' : '') + msg);

const ids = new Set();
for (const q of questions) {
  if (ids.has(q.id)) fail(q, 'duplicate id');
  ids.add(q.id);
  if (!SUBJECTS.includes(q.subject)) fail(q, 'unknown subject ' + q.subject);
  if (!q.question || !q.question.trim()) fail(q, 'empty question');
  if (!Array.isArray(q.options) || q.options.length !== 3) fail(q, 'needs exactly 3 options');
  if (q.answer !== null && !(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 2)) fail(q, 'bad answer index');
  if (new Set(q.options).size !== q.options.length) fail(q, 'repeated option text');
  const all = [q.question, ...q.options];
  for (const text of all) {
    if (/\*|\uFEFF|\s{2,}|^\s|\s$/.test(text)) fail(q, 'stray characters or spacing: ' + JSON.stringify(text));
    if (/\b([A-Za-z]+) \1\b/i.test(text)) fail(q, 'doubled word: ' + JSON.stringify(text));
  }
}

const unscored = questions.filter(q => q.answer === null).map(q => q.id);
const bySubject = Object.fromEntries(SUBJECTS.map(s => [s, questions.filter(q => q.subject === s).length]));

console.log('Questions:', questions.length, bySubject);
console.log('Unscored (no marked answer):', unscored.join(', ') || 'none');
if (problems.length) {
  console.log('PROBLEMS:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('OK: question bank passed every check');
