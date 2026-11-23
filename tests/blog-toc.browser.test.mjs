import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, describe, test } from 'node:test';

// The fixture server is shared with blog-routes.test.mjs. Playwright is optional
// for this suite; install it locally or expose a separate install via NODE_PATH.
const origin = process.env.BLOG_BROWSER_TEST_ORIGIN;
const require = createRequire(import.meta.url);
const contents = 'On this page';
const targetId = 'getting-started-in-5-minutes';
const title = 'Getting Started in 5 Minutes';

async function openPost(browser, testContext, options) {
  const {
    path = '/blogs/sample',
    width = 390,
    reducedMotion = 'no-preference',
    prepare,
  } = options ?? {};
  const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion });
  testContext.after(() => page.close());
  await prepare?.(page);
  const url = new URL(path, origin);
  await page.route(
    (requestUrl) => requestUrl.origin !== url.origin,
    (route) => route.abort(),
  );
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.getElementById('__nuxt')?.__vue_app__?.$nuxt?.isHydrating === false,
  );
  return page;
}

async function openContents(page, name = contents) {
  const trigger = page.getByRole('button', { name, exact: true });
  await trigger.waitFor({ timeout: 5000 });
  await trigger.evaluate((element) =>
    element.scrollIntoView({ block: 'center', behavior: 'instant' }),
  );
  await trigger.press('Enter');
  const sheet = page.getByRole('dialog', { name, exact: true });
  await sheet.waitFor({ timeout: 5000 });
  await page.waitForFunction(() => document.body.style.overflow === 'hidden');
  return { trigger, sheet };
}

async function recordJump(page) {
  await page.evaluate((id) => {
    const heading = document.getElementById(id);
    const sheetState = () => ({
      sheetMounted: Boolean(document.querySelector('[data-slot="sheet-content"]')),
      locked: document.body.style.overflow === 'hidden',
    });
    window.headingJump = { start: scrollY, steps: [], focus: null, navigation: null };
    window.addEventListener('scroll', () => window.headingJump.steps.push(scrollY), {
      passive: true,
    });
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
  return result;
}

describe(
  'blog contents sheet in Chromium',
  { skip: !origin && 'Set BLOG_BROWSER_TEST_ORIGIN to a local fixture server' },
  () => {
    let browser;

    before(async () => {
      const { chromium } = require('playwright');
      browser = await chromium.launch({ channel: process.env.BLOG_BROWSER_CHANNEL });
    });

    after(async () => {
      await browser?.close();
    });

    test('keyboard selection reaches the matching heading after the sheet releases focus and scroll', async (context) => {
      const page = await openPost(browser, context, { path: '/blogs/sample?ref=contents' });
      const { sheet } = await openContents(page);
      await recordJump(page);
      await sheet.getByRole('link', { name: title, exact: true }).press('Enter');
      await checkJump(page);
      assert.equal(new URL(page.url()).search, '?ref=contents');
    });

    test('Escape restores trigger focus without changing the hash or scroll position', async (context) => {
      const page = await openPost(browser, context);
      const { trigger } = await openContents(page);
      const before = await page.evaluate(() => ({ url: location.href, scroll: scrollY }));
      await page.keyboard.press('Escape');
      await page
        .locator('[data-slot="sheet-content"]')
        .waitFor({ state: 'detached', timeout: 5000 });
      await trigger.and(page.locator(':focus')).waitFor({ timeout: 5000 });
      await page.waitForFunction(() => document.body.style.overflow !== 'hidden');
      assert.deepEqual(
        await page.evaluate(() => ({ url: location.href, scroll: scrollY })),
        before,
      );
    });

    test('pointer selection jumps straight to the heading with reduced motion', async (context) => {
      const page = await openPost(browser, context, { reducedMotion: 'reduce' });
      const { sheet } = await openContents(page);
      await recordJump(page);
      await sheet.getByRole('link', { name: title, exact: true }).click();
      const result = await checkJump(page);
      assert.ok(
        result.steps.some((step) => Math.abs(step - result.end) <= 2),
        'the browser scrolled',
      );
      assert.ok(
        result.steps.every((step) => Math.abs(step - result.end) <= 2),
        'no intermediate scroll positions',
      );
    });

    test('large screens keep the sticky desktop contents instead of the sheet trigger', async (context) => {
      const page = await openPost(browser, context, { width: 1024 });
      const desktop = page.getByRole('complementary').getByRole('navigation', { name: contents });
      await desktop.waitFor();
      assert.equal(
        await desktop.evaluate((element) => getComputedStyle(element.parentElement).position),
        'sticky',
      );
      assert.equal(await page.getByRole('button', { name: contents }).count(), 0);
      await desktop.getByRole('link', { name: title, exact: true }).click();
      await page.waitForURL((url) => url.hash === `#${targetId}`);
    });

    test('just below the desktop breakpoint, the Vietnamese sheet has a translated title and links', async (context) => {
      const dateMismatches = [];
      const page = await openPost(browser, context, {
        path: '/vi/blogs/route-tests/nested',
        width: 1023,
        async prepare(page) {
          page.on('console', (message) => {
            const text = message.text();
            if (
              text.includes('Hydration text content mismatch') &&
              text.includes('[browser date]')
            ) {
              dateMismatches.push(text);
            }
          });
          await page.addInitScript(() => {
            // Keep the ICU discrepancy reproducible even when Node and Chromium agree.
            const format = Date.prototype.toLocaleDateString;
            Date.prototype.toLocaleDateString = function (locale, options) {
              const date = format.call(this, locale, options);
              return locale === 'vi' && options?.timeZone === 'UTC'
                ? `${date} [browser date]`
                : date;
            };
          });
        },
      });
      assert.deepEqual(
        dateMismatches,
        [],
        'Vietnamese dates should hydrate without text mismatches',
      );
      assert.match(
        (await page.locator('article header time[datetime="2026-01-15"]').textContent()).trim(),
        /^15 tháng 1,? 2026$/,
      );
      assert.match(
        (await page.locator('#post-body time[datetime="2026-01-16"]').textContent()).trim(),
        /^16 .+ 2026$/,
      );
      const { sheet } = await openContents(page, 'Trong bài này');
      await sheet.getByRole('link', { name: 'Tiêu đề thử nghiệm' }).waitFor();
    });

    test('a translated article without headings does not offer a contents trigger', async (context) => {
      const page = await openPost(browser, context, { path: '/vi/blogs/route-tests/related' });
      await page.getByRole('heading', { name: 'Bài viết liên quan', level: 1 }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Trong bài này' }).count(), 0);
    });
  },
);
