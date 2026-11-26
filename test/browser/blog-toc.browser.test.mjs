import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const origin = process.env.BLOG_BROWSER_TEST_ORIGIN;
if (!origin) throw new Error('Set BLOG_BROWSER_TEST_ORIGIN to a local Nuxt server.');

// Resolve Playwright from this checkout or from a separate install via NODE_PATH.
const require = createRequire(import.meta.url);
const contents = 'On this page';
const targetId = 'getting-started-in-5-minutes';
const title = 'Getting Started in 5 Minutes';

async function openContents(page) {
  const trigger = page.getByRole('button', { name: contents, exact: true });
  await trigger.waitFor({ timeout: 5000 });
  await trigger.evaluate((element) =>
    element.scrollIntoView({ block: 'center', behavior: 'instant' }),
  );
  await trigger.press('Enter');
  const sheet = page.getByRole('dialog', { name: contents, exact: true });
  await sheet.waitFor({ timeout: 5000 });
  await page.waitForFunction(() => document.body.style.overflow === 'hidden');
  return sheet;
}

async function recordJump(page) {
  await page.evaluate((id) => {
    const heading = document.getElementById(id);
    const sheetState = () => ({
      sheetMounted: Boolean(document.querySelector('[data-slot="sheet-content"]')),
      locked: document.body.style.overflow === 'hidden',
    });
    window.headingJump = { start: scrollY, focus: null, navigation: null };
    heading.addEventListener(
      'focus',
      () => {
        window.headingJump.focus = sheetState();
      },
      { once: true },
    );
    function observeHash() {
      if (location.hash === `#${id}`) window.headingJump.navigation = sheetState();
      else requestAnimationFrame(observeHash);
    }
    requestAnimationFrame(observeHash);
  }, targetId);
}

async function checkJump(page) {
  await page.waitForFunction(
    (id) => {
      const heading = document.getElementById(id);
      const top = heading.getBoundingClientRect().top;
      const offset = Number.parseFloat(getComputedStyle(heading).scrollMarginTop) || 0;
      return (
        window.headingJump.navigation &&
        document.activeElement === heading &&
        Math.abs(top - offset) <= 2
      );
    },
    targetId,
    { timeout: 5000 },
  );
  const result = await page.evaluate(() => ({ ...window.headingJump, end: scrollY }));
  assert.deepEqual(result.focus, { sheetMounted: false, locked: false });
  assert.deepEqual(result.navigation, { sheetMounted: false, locked: false });
  assert.ok(result.end > result.start + 300, 'selection reaches a heading well below the trigger');
}

test('keyboard selection reaches the matching heading after the sheet releases focus and scroll', async (context) => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: process.env.BLOG_BROWSER_CHANNEL });
  context.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const url = new URL('/blogs/sample?ref=contents', origin);
  await page.route(
    (requestUrl) => requestUrl.origin !== url.origin,
    (route) => route.abort(),
  );
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.getElementById('__nuxt')?.__vue_app__?.$nuxt?.isHydrating === false,
  );
  const sheet = await openContents(page);
  await recordJump(page);
  await sheet.getByRole('link', { name: title, exact: true }).press('Enter');
  await checkJump(page);
  assert.equal(new URL(page.url()).search, '?ref=contents');
});
