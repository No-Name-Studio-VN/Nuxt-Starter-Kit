import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Window } from 'happy-dom';

// See the README for setting up a local server with the blog route fixtures.
const origin = process.env.BLOG_TEST_ORIGIN;
if (!origin) throw new Error('Set BLOG_TEST_ORIGIN to a local fixture server.');

async function request(path, status, check) {
  const response = await fetch(new URL(path, origin), { redirect: 'manual' });
  assert.equal(response.status, status, path);
  const window = new Window({
    settings: {
      disableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
    },
  });
  try {
    window.document.write(await response.text());
    check(window.document);
  } finally {
    await window.happyDOM.close();
  }
}

function article(document, title) {
  const article = document.querySelector('article[data-post-panels]');
  assert.ok(article, 'renders the dedicated article view, not the docs catch-all');
  assert.equal(article.querySelector('h1')?.textContent.trim(), title);
  return article;
}

function assertRelated(article, path) {
  const related = [...article.querySelectorAll('#post-body h3')].map((title) =>
    title.closest('a')?.getAttribute('href'),
  );
  assert.deepEqual(related, [path]);
}

describe('blog SSR routes', () => {
  test('the blog index stays a listing in both locales', async () => {
    await request('/blogs', 200, (document) => {
      assert.equal(document.querySelector('h1')?.textContent.trim(), 'Stories & Insights');
      assert.ok(document.querySelector('main a[href="/blogs/route-tests/nested"]'));
      assert.ok(!document.querySelector('article[data-post-panels]'));
    });
    await request('/vi/blogs', 200, (document) => {
      assert.equal(document.querySelector('h1')?.textContent.trim(), 'Câu Chuyện & Ý Tưởng');
      const link = document.querySelector('main a[href="/vi/blogs/route-tests/nested"]');
      assert.match(link?.textContent ?? '', /Bài viết thử nghiệm/);
      assert.equal(
        document.querySelectorAll('main a[href="/vi/blogs/route-tests/nested"]').length,
        1,
      );
    });
  });

  test('a nested post renders its metadata, headings and frontmatter facts', async () => {
    await request('/blogs/route-tests/nested', 200, (document) => {
      const post = article(document, 'Nested route fixture');
      assert.equal(post.querySelector('dl dt')?.textContent.trim(), 'Fixture detail');
      assert.equal(post.querySelector('dl dd')?.textContent.trim(), 'A fact');
      assert.match(
        post.querySelector('img[fetchpriority="high"]')?.getAttribute('src') ?? '',
        /social-preview\.png/,
      );
      assert.match(post.textContent, /Fixture cover caption/);
      assert.ok(post.querySelector('a[href="#fixture-heading"]'));
      assert.ok(post.querySelector('h2#fixture-heading'));
      assert.match(document.title, /Nested fixture SEO title/);
    });
  });

  test('the Vietnamese article wins and shares its own public URL', async () => {
    await request('/vi/blogs/route-tests/nested', 200, (document) => {
      const post = article(document, 'Bài viết thử nghiệm');
      assert.equal(post.querySelector('header a')?.getAttribute('href'), '/vi/blogs');
      assert.match(document.title, /Tiêu đề SEO thử nghiệm/);
      assert.doesNotMatch(post.textContent, /chưa có bản dịch/);
      const href = post.querySelector('a[aria-label="Facebook"]')?.getAttribute('href');
      assert.ok(href);
      const share = new URL(href).searchParams.get('u');
      assert.ok(share);
      assert.equal(new URL(share).pathname, '/vi/blogs/route-tests/nested');
      assertRelated(post, '/vi/blogs/route-tests/related');
    });
  });

  test('Vietnamese routes fall back to the default article without recommending it', async () => {
    await request('/vi/blogs/sample', 200, (document) => {
      const post = article(
        document,
        'Introducing Nuxt Starter Kit: A Production-Ready SaaS Foundation for Busy Nuxters',
      );
      assert.equal(post.querySelector('.blog-prose')?.getAttribute('lang'), 'en');
      assert.match(
        post.querySelector('[role="status"]')?.textContent ?? '',
        /chưa có bản dịch Tiếng Việt.*\(English\)/,
      );
      assert.equal(post.querySelector('header a')?.getAttribute('href'), '/vi/blogs');
      assert.ok(!post.querySelector('time.invalid, header time, img[fetchpriority="high"]'));
      assert.ok(!post.querySelector('#post-body a[href="/vi/blogs/sample"]'));
      assert.ok(post.querySelector('#post-body a[href="/vi/blogs/route-tests/nested"]'));
    });
  });

  test('the starter article renders without cover or date', async () => {
    await request('/blogs/sample', 200, (document) => {
      const post = article(
        document,
        'Introducing Nuxt Starter Kit: A Production-Ready SaaS Foundation for Busy Nuxters',
      );
      assert.match(post.querySelector('header')?.textContent ?? '', /\d+ min read/);
      assert.doesNotMatch(post.textContent, /hasn’t been translated/);
      assert.ok(!post.querySelector('header time, img[fetchpriority="high"]'));
    });
  });

  test('legacy OG cover metadata remains usable without empty contents navigation', async () => {
    await request('/vi/blogs/route-tests/related', 200, (document) => {
      const post = article(document, 'Bài viết liên quan');
      assert.match(
        post.querySelector('img[fetchpriority="high"]')?.getAttribute('src') ?? '',
        /social-preview\.png/,
      );
      assert.ok(!post.querySelector('aside'));
    });
  });

  test('a docs URL still uses the docs layout', async () => {
    await request('/docs/getting-started/installation', 200, (document) => {
      assert.match(document.querySelector('h1')?.textContent ?? '', /Installation/);
      assert.ok(!document.querySelector('article[data-post-panels]'));
    });
  });

  test('a missing post returns 404 and links to the localized blog listing', async () => {
    await request('/vi/blogs/route-tests/missing', 404, (document) => {
      assert.equal(document.querySelector('h1')?.textContent.trim(), 'Không tìm thấy');
      assert.ok(document.querySelector('main a[href="/vi/blogs"]'));
      assert.ok(!document.querySelector('article[data-post-panels]'));
    });
  });
});
