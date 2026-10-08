'use strict';

// CDL practice quiz. Reads QUESTIONS from questions.js.
// Progress is stored only in this browser's localStorage. Nothing is sent anywhere.

(function () {
  const STORAGE_KEY = 'cdl-quiz-progress-v2';
  const SUBJECTS = ['Air Brakes', 'Combination Vehicles', 'General Knowledge'];
  const LETTERS = ['A', 'B', 'C'];
  const STATUS_LABEL = { right: 'Correct', wrong: 'Wrong', unanswered: 'Unanswered', ungraded: 'Not scored' };

  const byId = new Map(QUESTIONS.map(q => [q.id, q]));
  const $ = id => document.getElementById(id);

  let missed = new Set();   // ids answered wrong (scored questions only)
  let saved = new Set();    // bookmarked ids
  let session = null;       // { ids, answers, index, mode, finished }

  // ---------- storage ----------

  function loadProgress() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      const known = ids => (Array.isArray(ids) ? ids : []).filter(id => byId.has(id));
      missed = new Set(known(data.missed));
      saved = new Set(known(data.saved));
      const s = data.session;
      const valid = s && Array.isArray(s.ids) && s.ids.length > 0 && s.ids.every(id => byId.has(id))
        && Number.isInteger(s.index) && s.index >= 0 && s.index < s.ids.length;
      session = valid ? s : null;
    } catch (e) {
      missed = new Set();
      saved = new Set();
      session = null;
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ missed: [...missed], saved: [...saved], session }));
    } catch (e) {
      // Storage can be blocked (for example in a private window). The quiz still works for this visit.
    }
  }

  // ---------- helpers ----------

  function shuffled(items) {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function showPanel(name) {
    ['setup', 'quiz', 'results'].forEach(p => { $(p).hidden = p !== name; });
    window.scrollTo(0, 0);
  }

  function isScored(q) { return q.answer !== null; }

  function current() { return byId.get(session.ids[session.index]); }

  // ---------- setup screen ----------

  function fillSubjects() {
    const select = $('subject');
    select.append(new Option('All subjects (' + QUESTIONS.length + ')', 'all'));
    SUBJECTS.forEach(name => {
      const count = QUESTIONS.filter(q => q.subject === name).length;
      select.append(new Option(name + ' (' + count + ')', name));
    });
  }

  function matchingQuestions() {
    const subject = $('subject').value;
    const which = $('pool').value;
    const set = which === 'missed' ? missed : which === 'saved' ? saved : null;
    return QUESTIONS.filter(q => (subject === 'all' || q.subject === subject) && (!set || set.has(q.id)));
  }

  function updateSetup() {
    const total = matchingQuestions().length;
    $('custom').hidden = $('length').value !== 'custom';
    $('match').textContent = total
      ? total + ' question' + (total === 1 ? '' : 's') + ' match these settings.'
      : 'No questions match these settings yet.';
    $('start').disabled = total === 0;
    $('study-all').disabled = total === 0;
  }

  function updateStats() {
    $('stat-total').textContent = QUESTIONS.length;
    $('stat-missed').textContent = missed.size;
    $('stat-saved').textContent = saved.size;
  }

  function setMessage(text) { $('setup-message').textContent = text; }

  function requestedCount(total) {
    const value = $('length').value;
    if (value === 'all') return total;
    const n = Number(value === 'custom' ? $('custom').value : value);
    return Number.isInteger(n) && n >= 1 ? Math.min(n, total) : NaN;
  }

  function startFromSetup(mode, useAll) {
    const pool = matchingQuestions();
    if (!pool.length) { setMessage('No questions match these settings yet.'); return; }
    const n = useAll ? pool.length : requestedCount(pool.length);
    if (Number.isNaN(n)) { setMessage('Enter a whole number of 1 or more.'); return; }
    if (session && !session.finished && !confirm('Start a new test? This replaces the test in progress.')) return;
    setMessage('');
    const picked = $('shuffle').checked ? shuffled(pool) : pool;
    begin(picked.slice(0, n).map(q => q.id), mode);
  }

  function showSetup() {
    updateStats();
    updateSetup();
    const resumable = session && !session.finished;
    $('resume').hidden = !resumable;
    if (resumable) {
      $('resume').textContent = 'Resume test (' + Object.keys(session.answers).length + ' of ' + session.ids.length + ' answered)';
    }
    showPanel('setup');
  }

  // ---------- quiz ----------

  function begin(ids, mode) {
    session = { ids, answers: {}, index: 0, mode, finished: false };
    saveProgress();
    openQuiz();
  }

  function openQuiz() {
    showPanel('quiz');
    render();
    $('question').focus();
  }

  function choose(i) {
    if (!session || session.finished) return;
    const q = current();
    if (session.mode === 'study' && session.answers[q.id] !== undefined) return;
    session.answers[q.id] = i;
    if (isScored(q)) {
      if (i === q.answer) missed.delete(q.id);
      else missed.add(q.id);
    }
    saveProgress();
    render();
  }

  function goTo(index) {
    session.index = index;
    saveProgress();
    render();
  }

  function next() {
    if (session.index === session.ids.length - 1) finish();
    else goTo(session.index + 1);
  }

  function previous() {
    if (session.index > 0) goTo(session.index - 1);
  }

  function toggleBookmark() {
    const id = current().id;
    if (saved.has(id)) saved.delete(id);
    else saved.add(id);
    saveProgress();
    render();
  }

  function render() {
    const q = current();
    const total = session.ids.length;
    const answer = session.answers[q.id];
    const revealed = session.mode === 'study' && answer !== undefined;
    const answeredCount = Object.keys(session.answers).length;
    const isSaved = saved.has(q.id);

    $('position').textContent = 'Question ' + (session.index + 1) + ' of ' + total;
    $('topic').textContent = q.subject + ', #' + q.number;
    $('progress').style.width = (answeredCount / total * 100) + '%';
    $('question').textContent = q.question;
    $('bookmark').textContent = isSaved ? 'Bookmarked' : 'Bookmark';
    $('bookmark').setAttribute('aria-pressed', String(isSaved));

    const box = $('choices');
    box.replaceChildren();
    q.options.forEach((text, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice';
      const letter = document.createElement('span');
      letter.className = 'letter';
      letter.textContent = LETTERS[i];
      const label = document.createElement('span');
      label.textContent = text;
      button.append(letter, label);
      if (answer === i) button.classList.add('selected');
      if (revealed && isScored(q)) {
        if (i === q.answer) button.classList.add('correct');
        else if (i === answer) button.classList.add('wrong');
      }
      if (revealed) button.classList.add('locked');
      button.setAttribute('aria-pressed', String(answer === i));
      button.addEventListener('click', () => choose(i));
      box.append(button);
    });

    const feedback = $('feedback');
    feedback.className = 'feedback';
    if (!revealed) {
      feedback.textContent = answer !== undefined ? 'Answer recorded. You can change it until you finish.' : '';
    } else if (!isScored(q)) {
      feedback.textContent = 'No answer is marked in the study material, so this question is not scored.';
    } else if (answer === q.answer) {
      feedback.textContent = 'Correct.';
      feedback.classList.add('good');
    } else {
      feedback.textContent = 'Not quite. The correct answer is ' + LETTERS[q.answer] + ': ' + q.options[q.answer];
      feedback.classList.add('bad');
    }

    $('prev').disabled = session.index === 0;
    $('next').textContent = session.index === total - 1 ? 'See results' : 'Next';

    const grid = $('grid');
    grid.replaceChildren();
    session.ids.forEach((id, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'dot';
      dot.textContent = i + 1;
      dot.setAttribute('aria-label', 'Go to question ' + (i + 1));
      const a = session.answers[id];
      const qq = byId.get(id);
      if (i === session.index) {
        dot.classList.add('active');
        dot.setAttribute('aria-current', 'step');
      }
      if (a !== undefined) dot.classList.add('answered');
      if (session.mode === 'study' && a !== undefined && isScored(qq)) {
        dot.classList.add(a === qq.answer ? 'right' : 'wrong');
      }
      dot.addEventListener('click', () => goTo(i));
      grid.append(dot);
    });
  }

  function finish() {
    if (!session) return;
    const left = session.ids.filter(id => session.answers[id] === undefined).length;
    if (left && !confirm(left + ' unanswered question' + (left === 1 ? '' : 's') + '. Finish the test anyway?')) return;
    session.finished = true;
    saveProgress();
    showResults();
  }

  function saveAndExit() {
    saveProgress();
    showSetup();
  }

  // ---------- results ----------

  function showResults() {
    const qs = session.ids.map(id => byId.get(id));
    const scored = qs.filter(isScored);
    const right = scored.filter(q => session.answers[q.id] === q.answer).length;
    const ungraded = qs.length - scored.length;

    $('score').textContent = scored.length ? Math.round(right / scored.length * 100) + '%' : 'Not scored';
    $('result-text').textContent = right + ' of ' + scored.length + ' scored questions correct'
      + (ungraded ? '. ' + ungraded + ' had no marked answer.' : '.');

    const toPractice = scored.filter(q => session.answers[q.id] !== q.answer);
    $('retry').disabled = toPractice.length === 0;
    $('retry').textContent = 'Practice the ones I missed (' + toPractice.length + ')';

    const breakdown = $('breakdown');
    breakdown.replaceChildren();
    SUBJECTS.forEach(name => {
      const part = scored.filter(q => q.subject === name);
      if (!part.length) return;
      const ok = part.filter(q => session.answers[q.id] === q.answer).length;
      const row = document.createElement('div');
      row.className = 'row';
      const label = document.createElement('span');
      label.textContent = name;
      const value = document.createElement('strong');
      value.textContent = ok + ' / ' + part.length;
      row.append(label, value);
      breakdown.append(row);
    });

    renderReview();
    showPanel('results');
  }

  function renderReview() {
    const filter = $('review-filter').value;
    const list = $('review');
    list.replaceChildren();
    let shown = 0;

    session.ids.map(id => byId.get(id)).forEach(q => {
      const a = session.answers[q.id];
      const status = a === undefined ? 'unanswered'
        : !isScored(q) ? 'ungraded'
        : a === q.answer ? 'right' : 'wrong';
      if (filter !== 'all' && filter !== status) return;
      shown++;

      const card = document.createElement('article');
      card.className = 'review-item ' + status;

      const meta = document.createElement('p');
      meta.className = 'muted small';
      meta.textContent = q.subject + ', #' + q.number + ', ' + STATUS_LABEL[status];

      const heading = document.createElement('h3');
      heading.textContent = q.question;

      const yours = document.createElement('p');
      yours.textContent = 'Your answer: ' + (a === undefined ? 'none' : LETTERS[a] + '. ' + q.options[a]);

      card.append(meta, heading, yours);
      if (isScored(q)) {
        const correct = document.createElement('p');
        correct.textContent = 'Correct answer: ' + LETTERS[q.answer] + '. ' + q.options[q.answer];
        card.append(correct);
      } else {
        const note = document.createElement('p');
        note.className = 'muted small';
        note.textContent = 'No answer is marked in the study material, so this question is not scored.';
        card.append(note);
      }
      list.append(card);
    });

    if (!shown) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'Nothing matches this filter.';
      list.append(empty);
    }
  }

  // ---------- events ----------

  $('subject').addEventListener('change', updateSetup);
  $('pool').addEventListener('change', updateSetup);
  $('length').addEventListener('change', updateSetup);
  $('custom').addEventListener('input', updateSetup);
  $('start').addEventListener('click', () => startFromSetup($('mode').value, false));
  $('study-all').addEventListener('click', () => startFromSetup('study', true));
  $('resume').addEventListener('click', () => { if (session && !session.finished) openQuiz(); });
  $('reset').addEventListener('click', () => {
    if (!confirm('Erase your missed questions, bookmarks and the test in progress? This cannot be undone.')) return;
    missed.clear();
    saved.clear();
    session = null;
    saveProgress();
    showSetup();
    setMessage('Your progress was reset.');
  });

  $('prev').addEventListener('click', previous);
  $('next').addEventListener('click', next);
  $('bookmark').addEventListener('click', toggleBookmark);
  $('finish').addEventListener('click', finish);
  $('exit').addEventListener('click', saveAndExit);

  $('retry').addEventListener('click', () => {
    const ids = session.ids.filter(id => {
      const q = byId.get(id);
      return isScored(q) && session.answers[id] !== q.answer;
    });
    begin($('shuffle').checked ? shuffled(ids) : ids, 'study');
  });
  $('back-setup').addEventListener('click', showSetup);
  $('review-filter').addEventListener('change', renderReview);

  document.addEventListener('keydown', e => {
    if (!session || session.finished || $('quiz').hidden) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest('input, select, textarea')) return;
    switch (e.key) {
      case '1': case '2': case '3': choose(Number(e.key) - 1); break;
      case 'ArrowRight': next(); break;
      case 'ArrowLeft': previous(); break;
      case 's': case 'S': toggleBookmark(); break;
    }
  });

  // ---------- start ----------

  fillSubjects();
  loadProgress();
  showSetup();
  updateStats();
})();
