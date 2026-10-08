'use strict';

// CDL practice quiz. Reads QUESTIONS (questions.js) and Store (store.js).

(function () {
  const SUBJECTS = [
    { name: 'Air Brakes', blurb: 'Braking systems and air pressure', mock: 25 },
    { name: 'Combination Vehicles', blurb: 'Coupling, trailers and vehicle control', mock: 20 },
    { name: 'General Knowledge', blurb: 'Inspections, cargo and driving', mock: 50 },
  ];
    const LETTERS = ['A', 'B', 'C'];
  const VIEWS = ['home', 'quiz', 'results', 'browse', 'stats'];
  const REVIEW_LABEL = { right: 'Correct', wrong: 'Wrong', unanswered: 'Unanswered', ungraded: 'Not scored', flagged: 'Flagged' };

  const byId = new Map(QUESTIONS.map(q => [q.id, q]));
  const $ = id => document.getElementById(id);

  let session = null;       // the test in progress or last finished (same object as Store.session())
  let view = 'home';
  let tick = null;
  const openAnswers = new Set(); // browse cards with their answer showing

  // ---------- helpers ----------

  function shuffled(items) {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
  }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function isScored(q) { return q.answer !== null; }

  function current() { return byId.get(session.ids[session.index]); }

  function statusOf(id) {
    const s = Store.statsFor(id);
    return s.last === 'wrong' ? 'missed' : s.last === 'right' ? 'correct' : 'new';
  }

  function statusLabel(id) {
    return { missed: 'Last answer wrong', correct: 'Last answer right', new: 'Not seen yet' }[statusOf(id)];
  }

  function subjectStats(name) {
    const qs = QUESTIONS.filter(q => q.subject === name);
    let answered = 0, right = 0, wrong = 0;
    qs.forEach(q => {
      const s = Store.statsFor(q.id);
      if (s.last) answered++;
      right += s.right;
      wrong += s.wrong;
    });
    return { total: qs.length, answered, right, wrong, accuracy: right + wrong ? Math.round(right / (right + wrong) * 100) : null };
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ---------- navigation and theme ----------

  function show(name) {
    if (view === 'quiz' && name !== 'quiz') pauseTimer();
    view = name;
    VIEWS.forEach(v => { $(v).hidden = v !== name; });
    document.querySelectorAll('.tabs button').forEach(b => {
      if (b.dataset.nav === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    if (name === 'home') renderHome();
    if (name === 'browse') renderBrowse();
    if (name === 'stats') renderStats();
    if (name === 'quiz') resumeTimer();
  }

  function applyTheme(value) {
    document.documentElement.dataset.theme = value;
    $('theme').textContent = value === 'dark' ? 'Light mode' : 'Dark mode';
  }

  function initTheme() {
    const saved = Store.theme();
    const preferred = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    applyTheme(saved || preferred);
  }

  // ---------- home ----------

  function fillSubjectSelects() {
    [$('subject'), $('browse-subject')].forEach(select => {
      select.replaceChildren();
      select.append(new Option('All subjects (' + QUESTIONS.length + ')', 'all'));
      SUBJECTS.forEach(s => {
        const count = QUESTIONS.filter(q => q.subject === s.name).length;
        select.append(new Option(s.name + ' (' + count + ')', s.name));
      });
    });
  }

  function renderHome() {
    renderResume();
    renderSubjectCards();
    renderMockList();
    renderRulesForm();
    updateSetup();
  }

  function renderResume() {
    const box = $('resume-box');
    const live = session && !session.finished;
    box.hidden = !live;
    if (!live) return;
    $('resume-text').textContent = 'Test in progress: ' + Object.keys(session.answers).length
      + ' of ' + session.ids.length + ' answered (' + formatTime(spentMs()) + ' so far).';
  }

  function renderSubjectCards() {
    const wrap = $('subject-cards');
    wrap.replaceChildren();
    SUBJECTS.forEach(s => {
      const st = subjectStats(s.name);
      const pct = st.total ? Math.round(st.answered / st.total * 100) : 0;
      const card = el('article', 'subject-card panel');
      card.append(el('h2', null, s.name), el('p', 'muted small', s.blurb));

      const meter = el('div', 'bar');
      const fill = el('div');
      fill.style.width = pct + '%';
      meter.append(fill);
      meter.setAttribute('aria-hidden', 'true');

      const detail = el('p', 'small',
        st.answered + ' of ' + st.total + ' answered'
        + (st.accuracy === null ? '' : ', ' + st.accuracy + '% correct'));
      const actions = el('div', 'button-row');
      const study = el('button', 'primary', 'Study one by one');
      study.type = 'button';
      study.addEventListener('click', () => studySubject(s.name));
      const mock = el('button', null, 'Mock test');
      mock.type = 'button';
      mock.addEventListener('click', () => startMock(s));
      const choose = el('button', null, 'Choose questions');
      choose.type = 'button';
      choose.addEventListener('click', () => {
        $('subject').value = s.name;
        updateSetup();
        $('setup-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      actions.append(study, mock, choose);
      card.append(meter, detail, actions);
      wrap.append(card);
    });
  }

  function renderMockList() {
    const wrap = $('mock-list');
    wrap.replaceChildren();
    const rules = Store.rules();
    SUBJECTS.forEach(s => {
      const rule = rules[s.name];
      const last = Store.attempts.slice().reverse().find(a => a.kind === 'mock' && a.subject === s.name);
      const row = el('div', 'mock-row');
      const text = el('div');
      const detail = plural(rule.count, 'question') + ', ' + rule.minutes + ' minutes, pass at ' + rule.pass + '%';
      text.append(el('strong', null, s.name), el('div', 'muted small',
        detail + (last && last.scored ? ', last score ' + Math.round(last.right / last.scored * 100) + '%' : '')));
      const button = el('button', null, 'Start');
      button.type = 'button';
      button.addEventListener('click', () => startMock(s));
      row.append(text, button);
      wrap.append(row);
    });
  }

    function renderRulesForm() {
    const form = $('rules-form');
    form.replaceChildren();
    const rules = Store.rules();
    SUBJECTS.forEach(s => {
      const size = QUESTIONS.filter(q => q.subject === s.name).length;
      const fieldset = el('div', 'rules-row');
      fieldset.append(el('strong', null, s.name));
      [
        ['count', 'Questions', 1, size],
        ['pass', 'Pass %', 50, 100],
        ['minutes', 'Minutes', 5, 240],
      ].forEach(([field, label, min, max]) => {
        const wrapLabel = el('label', 'rule-field');
        wrapLabel.append(document.createTextNode(label + ' '));
        const input = document.createElement('input');
        input.type = 'number';
        input.min = String(min);
        input.max = String(max);
        input.value = String(rules[s.name][field]);
        input.dataset.subject = s.name;
        input.dataset.field = field;
        input.setAttribute('aria-label', s.name + ' ' + label.toLowerCase());
        input.addEventListener('change', saveRules);
        wrapLabel.append(input);
        fieldset.append(wrapLabel);
      });
      form.append(fieldset);
    });
  }

  function saveRules() {
    const next = Store.rules();
    document.querySelectorAll('#rules-form input').forEach(input => {
      next[input.dataset.subject][input.dataset.field] = Number(input.value);
    });
    Store.setRules(next);
    renderRulesForm();
    renderMockList();
    $('rules-message').textContent = 'Saved. Mock tests now use these rules.';
  }

  function resetRules() {
    Store.resetRules();
    renderRulesForm();
    renderMockList();
    $('rules-message').textContent = 'Back to the typical layout.';
  }

  function toggleReportBox() {
    const box = $('report-box');
    box.hidden = !box.hidden;
    $('report-btn').setAttribute('aria-expanded', String(!box.hidden));
    if (!box.hidden) $('report-note').focus();
  }

  function saveReport() {
    Store.addReport(current().id, $('report-note').value.trim());
    $('report-note').value = '';
    $('report-message').textContent = 'Saved. You can see it under Progress, in Reported questions.';
  }

  function matchingQuestions() {
    const subject = $('subject').value;
    const which = $('pool').value;
    return QUESTIONS.filter(q => {
      if (subject !== 'all' && q.subject !== subject) return false;
      if (which === 'missed') return statusOf(q.id) === 'missed';
      if (which === 'new') return statusOf(q.id) === 'new';
      if (which === 'saved') return Store.isSaved(q.id);
      if (which === 'due') return Store.isDue(q.id);
      return true;
    });
  }

  function updateSetup() {
    const total = matchingQuestions().length;
    $('custom').hidden = $('length').value !== 'custom';
    $('match').textContent = total ? plural(total, 'question') + ' match these settings.' : 'No questions match these settings yet.';
    $('start').disabled = total === 0;
    $('study-all').disabled = total === 0;
  }

  function requestedCount(total) {
    const value = $('length').value;
    if (value === 'all') return total;
    const n = Number(value === 'custom' ? $('custom').value : value);
    return Number.isInteger(n) && n >= 1 ? Math.min(n, total) : NaN;
  }

  function confirmReplace() {
    return !session || session.finished || confirm('Start a new test? This replaces the test in progress.');
  }

  function startFromSetup(mode, useAll) {
    const pool = matchingQuestions();
    if (!pool.length) { setupMessage('No questions match these settings yet.'); return; }
    const n = useAll ? pool.length : requestedCount(pool.length);
    if (Number.isNaN(n)) { setupMessage('Enter a whole number of 1 or more.'); return; }
    if (!confirmReplace()) return;
    setupMessage('');
    const picked = $('shuffle').checked ? shuffled(pool) : pool;
    const subjectValue = $('subject').value;
    begin({
      ids: picked.slice(0, n).map(q => q.id),
      mode,
      kind: 'practice',
      subject: subjectValue === 'all' ? 'All subjects' : subjectValue,
    });
  }

  // One subject, in the order of the study file, one question at a time (no shuffle).
  function studySubject(name) {
    if (!confirmReplace()) return;
    const ids = QUESTIONS.filter(q => q.subject === name).map(q => q.id);
    begin({ ids, mode: 'study', kind: 'practice', subject: name });
  }

  function startMock(subject) {
    if (!confirmReplace()) return;
    const rule = Store.rules()[subject.name];
    const pool = QUESTIONS.filter(q => q.subject === subject.name);
    begin({
      ids: shuffled(pool).slice(0, rule.count).map(q => q.id),
      mode: 'exam',
      kind: 'mock',
      subject: subject.name,
      passPct: rule.pass,
      limitMs: rule.minutes * 60 * 1000,
    });
  }

    function setupMessage(text) { $('setup-message').textContent = text; }

  // ---------- quiz ----------

  function begin(fields) {
    session = Object.assign({
      answers: {}, flags: [], index: 0, finished: false, spent: 0, runStart: null,
    }, fields);
    Store.setSession(session);
    show('quiz');
  }

  function spentMs() {
    if (!session) return 0;
    return (session.spent || 0) + (session.runStart ? Date.now() - session.runStart : 0);
  }

  function updateTimer() {
    const spent = spentMs();
    if (session && session.limitMs && !session.finished) {
      const left = session.limitMs - spent;
      if (left <= 0) {
        timeUp();
        return;
      }
      $('timer').textContent = 'Time left ' + formatTime(left);
    } else {
      $('timer').textContent = formatTime(spent);
    }
  }

  function timeUp() {
    if (!session || session.finished) return;
    session.timedOut = true;
    finish(true);
  }

  function resumeTimer() {
    if (!session || session.finished) return;
    if (!session.runStart) session.runStart = Date.now();
    clearInterval(tick);
    tick = setInterval(updateTimer, 1000);
    updateTimer();
    openQuiz();
  }

  function pauseTimer() {
    clearInterval(tick);
    tick = null;
    if (session && session.runStart) {
      session.spent = spentMs();
      session.runStart = null;
      Store.setSession(session);
    }
  }

  function openQuiz() {
    render();
    $('question').focus();
  }

  function choose(i) {
    if (!session || session.finished) return;
    const q = current();
    if (session.mode === 'study' && session.answers[q.id] !== undefined) return;
    session.answers[q.id] = i;
    if (session.mode === 'study' && isScored(q)) Store.recordAnswer(q.id, i === q.answer);
    Store.setSession(session);
    render();
    $('next').focus();
  }

  function toggleFlag() {
    const id = current().id;
    session.flags = session.flags.includes(id) ? session.flags.filter(x => x !== id) : [...session.flags, id];
    Store.setSession(session);
    render();
  }

  function toggleBookmark() {
    Store.toggleSaved(current().id);
    render();
  }

  function goTo(index) {
    session.index = index;
    Store.setSession(session);
    render();
  }

  function next() {
    if (session.index === session.ids.length - 1) finish();
    else goTo(session.index + 1);
  }

  function previous() {
    if (session.index > 0) goTo(session.index - 1);
  }

  function render() {
    const q = current();
    const total = session.ids.length;
    const answer = session.answers[q.id];
    const revealed = session.mode === 'study' && answer !== undefined;
    const flagged = session.flags.includes(q.id);
    const saved = Store.isSaved(q.id);
    const answeredCount = Object.keys(session.answers).length;

    $('position').textContent = 'Question ' + (session.index + 1) + ' of ' + total;
    $('topic').textContent = q.subject + ', #' + q.number + (session.kind === 'mock' ? ', mock test' : '');
    $('progress').style.width = (answeredCount / total * 100) + '%';
    $('question').textContent = q.question;
    $('flag').textContent = flagged ? 'Flagged' : 'Flag';
    $('flag').setAttribute('aria-pressed', String(flagged));
    $('bookmark').textContent = saved ? 'Bookmarked' : 'Bookmark';
    $('bookmark').setAttribute('aria-pressed', String(saved));
    updateTimer();

    const box = $('choices');
    box.replaceChildren();
    q.options.forEach((text, i) => {
      const button = el('button', 'choice');
      button.type = 'button';
      button.append(el('span', 'letter', LETTERS[i]), el('span', null, text));
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

    // Explanation, shown only after an answer and only when the question has one
    const why = $('why');
    why.hidden = !(revealed && q.why);
    why.textContent = revealed && q.why ? 'Why: ' + q.why : '';

    $('prev').disabled = session.index === 0;
    $('next').textContent = session.index === total - 1 ? 'See results' : 'Next';

    const grid = $('grid');
    grid.replaceChildren();
    session.ids.forEach((id, i) => {
      const dot = el('button', 'dot', String(i + 1));
      dot.type = 'button';
      dot.setAttribute('aria-label', 'Go to question ' + (i + 1));
      const a = session.answers[id];
      const qq = byId.get(id);
      if (i === session.index) {
        dot.classList.add('active');
        dot.setAttribute('aria-current', 'step');
      }
      if (a !== undefined) dot.classList.add('answered');
      if (session.flags.includes(id)) dot.classList.add('flagged');
      if (session.mode === 'study' && a !== undefined && isScored(qq)) {
        dot.classList.add(a === qq.answer ? 'right' : 'wrong');
      }
      dot.addEventListener('click', () => goTo(i));
      grid.append(dot);
    });
  }

  function finish(force) {
    if (!session) return;
    const left = session.ids.filter(id => session.answers[id] === undefined).length;
    if (!force && left && !confirm(plural(left, 'unanswered question') + '. Finish the test anyway?')) return;
    pauseTimer();
    session.finished = true;

    const scored = session.ids.map(id => byId.get(id)).filter(isScored);
    const answered = scored.filter(q => session.answers[q.id] !== undefined);
    const right = scored.filter(q => session.answers[q.id] === q.answer).length;
    if (session.mode === 'exam') {
      answered.forEach(q => Store.recordAnswer(q.id, session.answers[q.id] === q.answer));
    }

    const pct = scored.length ? Math.round(right / scored.length * 100) : null;
    Store.addAttempt({
      at: Date.now(),
      subject: session.subject,
      kind: session.kind,
      total: session.ids.length,
      scored: scored.length,
      right,
      seconds: Math.round(spentMs() / 1000),
      passed: session.passPct ? pct !== null && pct >= session.passPct : null,
    });
    Store.setSession(session);
    showResults();
  }

  function saveAndExit() {
    pauseTimer();
    Store.setSession(session);
    show('home');
  }

  // ---------- results ----------

  function showResults() {
    const qs = session.ids.map(id => byId.get(id));
    const scored = qs.filter(isScored);
    const right = scored.filter(q => session.answers[q.id] === q.answer).length;
    const ungraded = qs.length - scored.length;
    const pct = scored.length ? Math.round(right / scored.length * 100) : null;

    $('score').textContent = pct === null ? 'Not scored' : pct + '%';
    $('result-text').textContent = right + ' of ' + scored.length + ' scored questions correct'
      + (ungraded ? '. ' + plural(ungraded, 'question') + ' had no marked answer.' : '.');
    $('result-time').textContent = 'Time: ' + formatTime(spentMs()) + (session.timedOut ? '. Time is up.' : '');

    const verdict = $('verdict');
    if (session.passPct && pct !== null) {
      verdict.hidden = false;
      const passed = pct >= session.passPct;
      verdict.textContent = passed
        ? 'Pass. You reached the ' + session.passPct + '% pass mark.'
        : 'Not yet. You need ' + session.passPct + '% to pass.';
      verdict.className = 'verdict ' + (passed ? 'good' : 'bad');
    } else {
      verdict.hidden = true;
    }

    const toPractice = scored.filter(q => session.answers[q.id] !== q.answer);
    $('retry').disabled = toPractice.length === 0;
    $('retry').textContent = 'Practice the ones I missed (' + toPractice.length + ')';

    const breakdown = $('breakdown');
    breakdown.replaceChildren();
    SUBJECTS.forEach(s => {
      const part = scored.filter(q => q.subject === s.name);
      if (!part.length) return;
      const ok = part.filter(q => session.answers[q.id] === q.answer).length;
      const row = el('div', 'row');
      row.append(el('span', null, s.name), el('strong', null, ok + ' / ' + part.length));
      breakdown.append(row);
    });

    renderReview();
    show('results');
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
      const flagged = session.flags.includes(q.id);
      if (filter === 'flagged' ? !flagged : filter !== 'all' && filter !== status) return;
      shown++;

      const card = el('article', 'review-item ' + status);
      card.append(el('p', 'muted small', q.subject + ', #' + q.number + ', ' + REVIEW_LABEL[status] + (flagged ? ', flagged' : '')));
      card.append(el('h3', null, q.question));
      card.append(el('p', null, 'Your answer: ' + (a === undefined ? 'none' : LETTERS[a] + '. ' + q.options[a])));
      card.append(el('p', null, isScored(q)
        ? 'Correct answer: ' + LETTERS[q.answer] + '. ' + q.options[q.answer]
        : 'No answer is marked in the study material, so this question is not scored.'));
      if (q.why) card.append(el('p', 'small', 'Why: ' + q.why));
      list.append(card);
    });

    if (!shown) list.append(el('p', 'muted', 'Nothing matches this filter.'));
  }

  // ---------- browse ----------

  function renderBrowse() {
    const term = $('search').value.trim().toLowerCase();
    const subject = $('browse-subject').value;
    const status = $('browse-status').value;
    const list = $('browse-list');
    list.replaceChildren();

    const matches = QUESTIONS.filter(q => {
      if (subject !== 'all' && q.subject !== subject) return false;
      if (status === 'saved' && !Store.isSaved(q.id)) return false;
      if (status !== 'all' && status !== 'saved' && statusOf(q.id) !== status) return false;
      if (!term) return true;
      return (q.question + ' ' + q.options.join(' ')).toLowerCase().includes(term);
    });

    $('browse-count').textContent = plural(matches.length, 'question') + ' shown.';
    matches.forEach(q => list.append(browseCard(q)));
    if (!matches.length) list.append(el('p', 'muted', 'No questions match. Try another search or filter.'));
  }

  function browseCard(q) {
    const card = el('article', 'browse-card panel');
    const head = el('div', 'browse-head');
    head.append(el('span', 'muted small', q.subject + ', #' + q.number), el('span', 'badge ' + statusOf(q.id), statusLabel(q.id)));
    card.append(head, el('h3', null, q.question));

    const answerBox = el('div', 'browse-answer');
    answerBox.hidden = !openAnswers.has(q.id);
    q.options.forEach((text, i) => {
      const line = el('p', 'browse-option' + (isScored(q) && i === q.answer ? ' correct' : ''));
      line.textContent = LETTERS[i] + '. ' + text;
      answerBox.append(line);
    });
    if (!isScored(q)) answerBox.append(el('p', 'muted small', 'No answer is marked in the study material.'));

    const actions = el('div', 'button-row');
    const toggle = el('button', null, openAnswers.has(q.id) ? 'Hide answers' : 'Show answers');
    toggle.type = 'button';
    toggle.addEventListener('click', () => {
      if (openAnswers.has(q.id)) openAnswers.delete(q.id);
      else openAnswers.add(q.id);
      renderBrowse();
    });
    const bookmark = el('button', null, Store.isSaved(q.id) ? 'Bookmarked' : 'Bookmark');
    bookmark.type = 'button';
    bookmark.addEventListener('click', () => { Store.toggleSaved(q.id); renderBrowse(); });
    const practice = el('button', null, 'Practice this');
    practice.type = 'button';
    practice.addEventListener('click', () => {
      if (!confirmReplace()) return;
      begin({ ids: [q.id], mode: 'study', kind: 'practice', subject: q.subject });
    });
    actions.append(toggle, bookmark, practice);
    card.append(answerBox, actions);
    return card;
  }

  // ---------- progress and backup ----------

  function renderReports() {
    const wrap = $('reports');
    wrap.replaceChildren();
    const list = Store.reports();
    if (!list.length) {
      wrap.append(el('p', 'muted', 'No reports yet.'));
      return;
    }
    list.slice().reverse().forEach(r => {
      const q = byId.get(r.id);
      const row = el('div', 'report-row');
      row.append(el('p', 'muted small', q.subject + ', #' + q.number));
      row.append(el('h3', null, q.question));
      if (r.note) row.append(el('p', null, 'Note: ' + r.note));
      const remove = el('button', null, 'Remove');
      remove.type = 'button';
      remove.addEventListener('click', () => { Store.removeReport(r.at); renderStats(); });
      row.append(remove);
      wrap.append(row);
    });
  }

  function renderStats() {
    renderReports();
    const answeredTotal = QUESTIONS.filter(q => Store.statsFor(q.id).last).length;
    let right = 0, wrong = 0;
    QUESTIONS.forEach(q => { const s = Store.statsFor(q.id); right += s.right; wrong += s.wrong; });
    const attempts = Store.attempts;
    const mocks = attempts.filter(a => a.kind === 'mock');

    const cards = $('stat-cards');
    cards.replaceChildren();
    [
      [answeredTotal + ' / ' + QUESTIONS.length, 'questions answered'],
      [right + wrong ? Math.round(right / (right + wrong) * 100) + '%' : 'None yet', 'correct, all time'],
      [String(attempts.length), 'tests finished'],
      [mocks.filter(a => a.passed).length + ' / ' + mocks.length, 'mock tests passed'],
      [String(Store.savedIds.length), 'bookmarked'],
      [String(Store.dueCount()), 'due for review now'],
    ].forEach(([value, label]) => {
      const box = el('div', 'stat-card panel');
      box.append(el('strong', null, value), el('span', 'muted small', label));
      cards.append(box);
    });

    const table = $('subject-table');
    table.replaceChildren();
    SUBJECTS.forEach(s => {
      const st = subjectStats(s.name);
      const row = el('div', 'subject-row');
      const pct = st.total ? Math.round(st.answered / st.total * 100) : 0;
      const bar = el('div', 'bar');
      const fill = el('div');
      fill.style.width = pct + '%';
      bar.append(fill);
      row.append(
        el('strong', null, s.name),
        el('span', 'muted small', st.answered + ' of ' + st.total + ' answered'),
        el('span', 'small', st.accuracy === null ? 'No answers yet' : st.accuracy + '% correct'),
        bar,
      );
      table.append(row);
    });

    const missed = $('most-missed');
    missed.replaceChildren();
    const top = QUESTIONS
      .map(q => ({ q, wrong: Store.statsFor(q.id).wrong }))
      .filter(x => x.wrong > 0)
      .sort((a, b) => b.wrong - a.wrong)
      .slice(0, 10);
    if (!top.length) missed.append(el('p', 'muted', 'No misses yet. Keep practising.'));
    top.forEach(({ q, wrong }) => {
      const row = el('p', 'small');
      row.append(el('span', 'muted', plural(wrong, 'miss') + ': '), document.createTextNode(q.question));
      missed.append(row);
    });

    const recent = $('recent');
    recent.replaceChildren();
    if (!attempts.length) recent.append(el('p', 'muted', 'No finished tests yet.'));
    attempts.slice().reverse().slice(0, 10).forEach(a => {
      const pct = a.scored ? Math.round(a.right / a.scored * 100) : null;
      const row = el('div', 'recent-row');
      const when = new Date(a.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      const kind = a.kind === 'mock' ? 'Mock test' : 'Practice';
      const outcome = a.passed === null || a.passed === undefined ? '' : a.passed ? ', passed' : ', not yet';
      row.append(
        el('span', 'muted small', when),
        el('span', null, kind + ', ' + a.subject),
        el('strong', null, (pct === null ? 'Not scored' : pct + '%') + outcome),
      );
      recent.append(row);
    });
  }

  function setDataMessage(text) { $('data-message').textContent = text; }

  function exportBackup() {
    const blob = new Blob([Store.exportText()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = el('a');
    link.href = url;
    link.download = 'cdl-quiz-progress-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDataMessage('Backup saved. Keep the file somewhere safe.');
  }

  function importBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        Store.importText(String(reader.result));
        session = Store.session();
        if (session) session.runStart = null;
        renderStats();
        setDataMessage('Backup loaded. Your progress is restored.');
      } catch (e) {
        setDataMessage('That file could not be loaded. ' + (e.message || 'Check that it is a backup from this quiz.'));
      }
      $('import').value = '';
    };
    reader.onerror = () => setDataMessage('That file could not be read.');
    reader.readAsText(file);
  }

  function resetAll() {
    if (!confirm('Erase all progress, bookmarks, mock results and the test in progress? This cannot be undone.')) return;
    pauseTimer();
    Store.reset();
    session = null;
    renderStats();
    setDataMessage('All progress was erased.');
  }

  // ---------- events ----------

  document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => show(b.dataset.nav)));
  $('theme').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    Store.setTheme(next);
    applyTheme(next);
  });

  $('subject').addEventListener('change', updateSetup);
  $('pool').addEventListener('change', updateSetup);
  $('length').addEventListener('change', updateSetup);
  $('custom').addEventListener('input', updateSetup);
  $('setup-form').addEventListener('submit', e => { e.preventDefault(); startFromSetup($('mode').value, false); });
  $('study-all').addEventListener('click', () => startFromSetup('study', true));
  $('resume').addEventListener('click', () => { if (session && !session.finished) show('quiz'); });

  $('prev').addEventListener('click', previous);
  $('next').addEventListener('click', next);
  $('flag').addEventListener('click', toggleFlag);
  $('bookmark').addEventListener('click', toggleBookmark);
  $('finish').addEventListener('click', () => finish());
  $('exit').addEventListener('click', saveAndExit);

  $('retry').addEventListener('click', () => {
    const ids = session.ids.filter(id => {
      const q = byId.get(id);
      return isScored(q) && session.answers[id] !== q.answer;
    });
    begin({ ids: $('shuffle').checked ? shuffled(ids) : ids, mode: 'study', kind: 'practice', subject: session.subject });
    show('quiz');
  });
  $('home-from-results').addEventListener('click', () => show('home'));
  $('review-filter').addEventListener('change', renderReview);

  $('search').addEventListener('input', renderBrowse);
  $('browse-subject').addEventListener('change', renderBrowse);
  $('browse-status').addEventListener('change', renderBrowse);

  $('export').addEventListener('click', exportBackup);
  $('import-button').addEventListener('click', () => $('import').click());
  $('rules-reset').addEventListener('click', resetRules);
  $('report-btn').addEventListener('click', toggleReportBox);
  $('report-save').addEventListener('click', saveReport);
  $('import').addEventListener('change', e => importBackup(e.target.files[0]));
  $('reset').addEventListener('click', resetAll);

  // Keyboard: 1, 2, 3 answer. Enter or Space go to the next question.
  // Arrows move between questions. F flags. S bookmarks. / searches on the Questions page.
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target && target.closest('input, select, textarea')) return;

    if (view === 'browse' && e.key === '/') {
      e.preventDefault();
      $('search').focus();
      return;
    }
    if (view !== 'quiz' || !session || session.finished) return;

    // On a focused button, Enter and Space already press that button, so only act when focus is elsewhere.
    const onControl = !!(target && target.closest('button, a'));
    switch (e.key) {
      case '1': case '2': case '3':
        choose(Number(e.key) - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        next();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        previous();
        break;
      case 'Enter':
      case ' ':
        if (onControl) break;
        e.preventDefault();
        next();
        break;
      case 'f': case 'F':
        toggleFlag();
        break;
      case 's': case 'S':
        toggleBookmark();
        break;
    }
  });

  // ---------- start ----------

  // Offline support needs a secure address (https or localhost). Browsers ignore it on a file.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }


  Store.load();
  session = Store.session();
  if (session && !session.finished) session.runStart = null; // time while the page was closed is not counted
  fillSubjectSelects();
  initTheme();
  show('home');
})();
