// Browser test for the quiz. Needs Playwright. Set PLAYWRIGHT_PATH to the folder that
// contains Playwright's package if it is not found automatically. Run: node tests/browser-test.cjs
const path = require('path');
const { pathToFileURL } = require('url');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require(path.join(process.env.PLAYWRIGHT_PATH || '.', 'playwright'))); }

const root = path.join(__dirname, '..');
const pages = ['index.html', 'CDL-Practice-Quiz.html'];

function check(cond, msg) { if (!cond) throw new Error('FAILED: ' + msg); console.log('  ok - ' + msg); }

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  for (const name of pages) {
    console.log(name);
    const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    await context.clearCookies();
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

    check(await page.locator('#stat-total').textContent() === '445', 'setup shows 445 questions');
    check(await page.locator('#subject option').count() === 4, 'subject list has all + 3 subjects');

    // Study run: 3 General Knowledge questions in order
    await page.locator('#subject').selectOption('General Knowledge');
    await page.locator('#length').selectOption('custom');
    await page.locator('#custom').fill('3');
    await page.locator('#shuffle').uncheck();
    await page.locator('#start').click();
    check(await page.locator('#position').textContent() === 'Question 1 of 3', 'quiz starts at question 1 of 3');
    await page.locator('.choice').nth(1).click();
    check((await page.locator('#feedback').textContent()).length > 0, 'study mode shows feedback after answering');
    check(await page.locator('.choice.locked').count() === 3, 'answered choices are locked');
    await page.keyboard.press('1');
    await page.keyboard.press('3');
    check(await page.locator('.choice.selected').count() === 1 && await page.locator('.choice').nth(1).evaluate(el => el.classList.contains('selected')), 'locked question cannot be changed');
    await page.keyboard.press('ArrowRight');
    check(await page.locator('#position').textContent() === 'Question 2 of 3', 'right arrow moves to next question');
    await page.keyboard.press('s');
    check(await page.locator('#bookmark').textContent() === 'Bookmarked', 'S key bookmarks the question');
    await page.keyboard.press('2');
    await page.locator('#next').click();
    await page.locator('.choice').first().click();
    await page.locator('#next').click();
    check(await page.locator('#results').isVisible(), 'finishing shows results');
    const score = await page.locator('#score').textContent();
    check(/%|Not scored/.test(score), 'results show a score: ' + score);

    // Persistence: bookmark and missed survive a reload
    await page.reload();
    check(await page.locator('#stat-saved').textContent() === '1', 'bookmark survives reload');
    const missedAfter = Number(await page.locator('#stat-missed').textContent());
    check(missedAfter >= 0, 'missed count is shown after reload (' + missedAfter + ')');

    // Exam mode: answer one, save and exit, resume
    await page.locator('#mode').selectOption('exam');
    await page.locator('#length').selectOption('10');
    await page.locator('#start').click();
    await page.locator('.choice').nth(0).click();
    check(await page.locator('.choice.locked').count() === 0, 'exam mode does not reveal answers');
    await page.locator('#exit').click();
    await page.reload();
    check(await page.locator('#resume').isVisible(), 'resume button appears after save and exit');
    await page.locator('#resume').click();
    check(await page.locator('#position').textContent() === 'Question 1 of 10', 'resume returns to the test');

    // Finish early with unanswered questions, then retry missed
    await page.locator('#finish').click();
    check(await page.locator('#results').isVisible(), 'finish shows results with unanswered questions');
    check(await page.locator('.review-item.unanswered').count() >= 4, 'unanswered questions appear in review');
    await page.locator('#review-filter').selectOption('unanswered');
    check(await page.locator('#review .review-item').count() >= 4, 'review filter works');

    // Responsive: no horizontal scroll at phone width
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(!overflow, 'no horizontal scroll at 390px wide (results)');
    await page.locator('#back-setup').click();
    const setupOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(!setupOverflow, 'no horizontal scroll at 390px wide (setup)');
    await page.locator('#subject').selectOption('all');
    await page.locator('#length').selectOption('10');
    await page.locator('#start').click();
    const quizOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(!quizOverflow, 'no horizontal scroll at 390px wide (quiz)');

    // Reset clears everything
    await page.locator('#exit').click();
    await page.locator('#reset').click();
    check(await page.locator('#stat-saved').textContent() === '0', 'reset clears bookmarks');
    check(!(await page.locator('#resume').isVisible()), 'reset clears the test in progress');

    // Only local requests; no page errors
    const external = requests.filter(u => !u.startsWith('file:') && !u.startsWith('data:'));
    check(external.length === 0, 'no outside network requests (' + external.length + ')');
    check(errors.length === 0, 'no console or page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
    await context.close();
  }
  await browser.close();
  console.log('All browser checks passed.');
})().catch(e => { console.error(e.message || e); process.exit(1); });
