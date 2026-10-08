// Browser test for the quiz. Needs Playwright. Set PLAYWRIGHT_PATH to the folder that
// contains Playwright's package if it is not found automatically. Run: node tests/browser-test.cjs
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require(path.join(process.env.PLAYWRIGHT_PATH || '.', 'playwright'))); }

const root = path.join(__dirname, '..');
const pages = ['index.html', 'CDL-Practice-Quiz.html'];
let passed = 0;

function check(cond, msg) {
  if (!cond) throw new Error('FAILED: ' + msg);
  passed++;
  console.log('  ok - ' + msg);
}

async function go(page, name) {
  await page.locator('.tabs button[data-nav="' + name + '"]').click();
}

async function answerAll(page, count, choice) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press(String(choice));
    if (i < count - 1) await page.keyboard.press('ArrowRight');
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  const backupFile = path.join(os.tmpdir(), 'cdl-quiz-test-backup.json');

  for (const name of pages) {
    console.log(name);
    const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, acceptDownloads: true });
    const page = await context.newPage();
    const requests = [];
    const errors = [];
    page.on('request', r => requests.push(r.url()));
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('dialog', d => d.accept());

    await page.goto(pathToFileURL(path.join(root, name)).href);
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Home
    check(await page.locator('.subject-card').count() === 3, 'home shows three subject cards');
    check(await page.locator('#mock-list button').count() === 3, 'home offers three mock tests');
    check(await page.locator('#subject option').count() === 4, 'subject list has all + 3 subjects');

    // Study one subject one by one, in file order
    await page.locator('.subject-card').nth(0).getByRole('button', { name: 'Study one by one' }).click();
    check(await page.locator('#position').textContent() === 'Question 1 of 64', 'study one by one starts Air Brakes at question 1 of 64');
    check((await page.locator('#topic').textContent()).startsWith('Air Brakes, #1'), 'study one by one follows the study-file order');
    check(await page.locator('#progress').evaluate(el => el.style.width) === '0%', 'progress starts at zero');
    await page.keyboard.press('1');
    await page.keyboard.press('ArrowRight');
    check(await page.locator('#position').textContent() === 'Question 2 of 64', 'arrow key moves to question 2 in order');

    // Keyboard only: answer with a number, continue with Enter, then Space, then a focused answer must not skip
    await page.keyboard.press('2');
    check(await page.evaluate(() => document.activeElement.id) === 'next', 'after answering, focus moves to Next');
    await page.keyboard.press('Enter');
    check(await page.locator('#position').textContent() === 'Question 3 of 64', 'Enter continues to question 3');
    await page.keyboard.press(' ');
    check(await page.locator('#position').textContent() === 'Question 4 of 64', 'Space continues to question 4');
    await page.locator('.choice').nth(0).focus();
    await page.keyboard.press('Enter');
    check(await page.locator('.choice.locked').count() === 3, 'Enter on a focused answer picks it');
    check(await page.locator('#position').textContent() === 'Question 4 of 64', 'picking an answer with Enter does not skip the question');
    await page.locator('.tabs button[data-nav="browse"]').click();
    await page.keyboard.press('/');
    check(await page.evaluate(() => document.activeElement.id) === 'search', '/ jumps to search on the Questions page');
    await page.locator('.tabs button[data-nav="stats"]').click();
    await page.locator('#import-button').focus();
    check(await page.evaluate(() => document.activeElement.id) === 'import-button', 'Load backup file can be reached by keyboard');

    await page.locator('.tabs button[data-nav="home"]').click();

    // Study practice: 3 General Knowledge questions in order
    await page.locator('#subject').selectOption('General Knowledge');
    await page.locator('#length').selectOption('custom');
    await page.locator('#custom').fill('3');
    await page.locator('#shuffle').uncheck();
    await page.locator('#start').click();
    check(await page.locator('#position').textContent() === 'Question 1 of 3', 'practice starts at question 1 of 3');
    check(await page.locator('#timer').textContent() !== '', 'timer is shown during a test');
    await page.locator('.choice').nth(1).click();
    check((await page.locator('#feedback').textContent()).length > 0, 'study mode shows feedback after answering');
    check(await page.locator('.choice.locked').count() === 3, 'answered choices are locked');
    await page.keyboard.press('3');
    check(await page.locator('.choice').nth(1).evaluate(el => el.classList.contains('selected')), 'a locked answer cannot be changed');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('f');
    check(await page.locator('#flag').textContent() === 'Flagged', 'F key flags the question');
    await page.keyboard.press('s');
    check(await page.locator('#bookmark').textContent() === 'Bookmarked', 'S key bookmarks the question');
    await page.keyboard.press('2');
    await page.locator('#next').click();
    await page.locator('.choice').first().click();
    await page.locator('#next').click();
    check(await page.locator('#results').isVisible(), 'finishing shows results');
    check(/%|Not scored/.test(await page.locator('#score').textContent()), 'results show a score');

    // Browser: the bookmark shows up
    await go(page, 'browse');
    await page.locator('#browse-status').selectOption('saved');
    check(await page.locator('.browse-card').count() === 1, 'bookmarked question shows in the browser');
    await page.locator('#browse-status').selectOption('all');

    // Save and exit, then resume from the home page
    await go(page, 'home');
    await page.locator('#subject').selectOption('all');
    await page.locator('#length').selectOption('10');
    await page.locator('#mode').selectOption('exam');
    await page.locator('#start').click();
    await page.keyboard.press('1');
    await page.locator('#exit').click();
    await page.reload();
    check(await page.locator('#resume-box').isVisible(), 'resume banner shows after save and exit');
    await page.locator('#resume').click();
    check(await page.locator('#position').textContent() === 'Question 1 of 10', 'resume returns to the same test');
    check(await page.locator('.choice.locked').count() === 0, 'exam mode does not reveal answers');
    await page.locator('#finish').click();
    check(await page.locator('#results').isVisible(), 'finish with unanswered questions shows results');
    check(await page.locator('.review-item.unanswered').count() >= 9, 'unanswered questions appear in review');
    await page.locator('#review-filter').selectOption('unanswered');
    check(await page.locator('#review .review-item').count() >= 9, 'review filter works');

    // Mock test: 20 Combination Vehicles questions, timed, exam style
    await go(page, 'home');
    await page.locator('#mock-list button').nth(1).click();
    check(await page.locator('#position').textContent() === 'Question 1 of 20', 'mock test has the usual 20 questions');
    check((await page.locator('#topic').textContent()).includes('mock test'), 'mock test is labelled');
    await answerAll(page, 20, 1);
    await page.locator('#finish').click();
    check((await page.locator('#verdict').textContent()).length > 0, 'mock test shows a pass or not-yet verdict');

    // Progress page reflects the tests
    await go(page, 'stats');
    check(await page.locator('#recent .recent-row').count() >= 2, 'recent tests are listed');
    check(await page.locator('#subject-table .subject-row').count() === 3, 'progress lists each subject');

    // Browser: search, show answer, practise a single question
    await go(page, 'browse');
    await page.locator('#search').fill('air brake');
    const found = await page.locator('.browse-card').count();
    check(found > 0, 'search finds questions (' + found + ')');
    await page.locator('.browse-card').first().getByRole('button', { name: 'Show answers' }).click();
    check(await page.locator('.browse-card').first().locator('.browse-option.correct').count() === 1, 'show answers marks the correct option');
    await page.locator('#search').fill('');
    await page.locator('.browse-card').first().getByRole('button', { name: 'Practice this' }).click();
    check(await page.locator('#position').textContent() === 'Question 1 of 1', 'practise this starts a single-question test');
    await go(page, 'home');

    // Backup: export, then import the file back
    await go(page, 'stats');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
    check(download.suggestedFilename().startsWith('cdl-quiz-progress-'), 'backup downloads with a dated name');
    await download.saveAs(backupFile);
    await page.locator('#import').setInputFiles(backupFile);
    await page.waitForFunction(() => document.getElementById('data-message').textContent.includes('restored'));
    check(true, 'backup file loads back in');
    await page.locator('#import').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
    await page.waitForFunction(() => document.getElementById('data-message').textContent.includes('could not be loaded'));
    check(true, 'a file that is not a backup is refused');

    // Theme
    const before = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.locator('#theme').click();
    const after = await page.evaluate(() => document.documentElement.dataset.theme);
    check(before !== after, 'theme switches between light and dark');
    await page.locator('#theme').click();

    // Phone width: no sideways scrolling on any screen
    await page.setViewportSize({ width: 390, height: 844 });
    for (const screen of ['home', 'browse', 'stats']) {
      await go(page, screen);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      check(!wide, 'no sideways scroll at 390px on ' + screen);
    }
    await go(page, 'home');
    await page.locator('#mock-list button').first().click();
    const quizWide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(!quizWide, 'no sideways scroll at 390px in a test');
    await page.locator('#exit').click();
    await page.setViewportSize({ width: 1280, height: 850 });

    // Reset clears everything
    await go(page, 'stats');
    await page.locator('#reset').click();
    await page.waitForFunction(() => document.getElementById('data-message').textContent.includes('erased'));
    await go(page, 'home');
    check(!(await page.locator('#resume-box').isVisible()), 'reset clears the test in progress');

    const external = requests.filter(u => !u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:'));
    check(external.length === 0, 'no outside network requests (' + external.length + ')');
    check(errors.length === 0, 'no console or page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
    await context.close();
  }
  fs.rmSync(backupFile, { force: true });
  await browser.close();
  console.log('All ' + passed + ' browser checks passed.');
})().catch(e => { console.error(e.message || e); process.exit(1); });
