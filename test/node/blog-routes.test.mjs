import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Window } from 'happy-dom';

// See the README for setting up a local server with the blog route fixtures.
const origin = process.env.BLOG_TEST_ORIGIN;
if (!origin) throw new Error('Set BLOG_TEST_ORIGIN to a local fixture server.');
const blog = process.env.BLOG_TEST_BASE_PATH ?? '/blogs';
const noPrefix = process.env.BLOG_TEST_NO_PREFIX === '1';
const viBlog = noPrefix ? `${blog}/vi` : `/vi${blog}`;
const viListing = noPrefix ? blog : viBlog;

async function request(path, status, check, headers) {
  const response = await fetch(new URL(path, origin), { redirect: 'manual', headers });
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
  test('Content navigation hides the starter sample and retains opt-in link metadata', async () => {
    const response = await fetch(new URL('/api/blog-test-navigation', origin));
    assert.equal(response.status, 200);
    function flatten(items) {
      return items.flatMap((item) => [item, ...flatten(item.children ?? [])]);
    }
    const { data } = await response.json();
    const items = flatten(data.data);
    assert.ok(!items.some((item) => item.path === '/blogs/sample'));
    assert.ok(items.some((item) => item.path === '/blogs/route-tests/nested'));
    const related = items.find(
      (item) => item.path === (noPrefix ? '/blogs/vi' : '/vi/blogs') + '/route-tests/related',
    );
    assert.equal(related?.redirect, '/docs/getting-started/introduction');
    assert.equal(related?.target, '_blank');
  });

  test('the blog index stays a listing in both locales', async () => {
    await request(blog, 200, (document) => {
      assert.equal(document.querySelector('h1')?.textContent.trim(), 'Stories & Insights');
      assert.ok(document.querySelector(`main a[href="${blog}/route-tests/nested"]`));
      assert.ok(!document.querySelector('article[data-post-panels]'));
    });
    const headers = noPrefix ? { Cookie: 'i18n_redirected=vi' } : undefined;
    await request(
      viListing,
      200,
      (document) => {
        assert.equal(document.querySelector('h1')?.textContent.trim(), 'Câu Chuyện & Ý Tưởng');
        const link = document.querySelector(`main a[href="${viBlog}/route-tests/nested"]`);
        assert.match(link?.textContent ?? '', /Bài viết thử nghiệm/);
        assert.equal(
          document.querySelectorAll(`main a[href="${viBlog}/route-tests/nested"]`).length,
          1,
        );
      },
      headers,
    );
  });

  test('canonical and alternate links use the public article paths', async () => {
    const path = `${blog}/route-tests/nested`;
    await request(`${path}?ref=fixture`, 200, (document) => {
      const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
      assert.ok(canonical);
      assert.equal(new URL(canonical).pathname, path);
      const alternate = document
        .querySelector('link[rel="alternate"][hreflang="vi"]')
        ?.getAttribute('href');
      assert.ok(alternate);
      assert.equal(new URL(alternate).pathname, `${viBlog}/route-tests/nested`);
    });
  });

  test('the sitemap lists the public article paths instead of Content storage paths', async () => {
    const sitemap = await fetch(new URL('/sitemap.xml', origin));
    assert.equal(sitemap.status, 200);
    const index = await sitemap.text();
    const childSitemaps = [...index.matchAll(/<loc>([^<]+\.xml)<\/loc>/g)].map(([, url]) => url);
    const xml = childSitemaps.length
      ? (
          await Promise.all(
            childSitemaps.map(async (url) => {
              const child = await fetch(new URL(new URL(url).pathname, origin));
              assert.equal(child.status, 200);
              return child.text();
            }),
          )
        ).join('')
      : index;
    assert.ok(xml.includes(`${blog}/route-tests/nested</loc>`));
    if (blog !== '/blogs') assert.ok(!xml.includes('/blogs/route-tests/nested</loc>'));
  });

  test('RSS links to the public article paths', async () => {
    const response = await fetch(new URL('/rss.xml', origin));
    assert.equal(response.status, 200);
    const xml = await response.text();
    assert.ok(xml.includes(`${blog}/route-tests/nested</link>`));
    if (blog !== '/blogs') assert.ok(!xml.includes('/blogs/route-tests/nested</link>'));
  });

  test('the public base does not match adjacent slugs or leave old articles publicly readable', async () => {
    await request(`${blog}room/route-tests/nested`, 404, () => {});
    if (blog !== '/blogs') await request('/blogs/route-tests/nested', 404, () => {});
  });

  test('a nested post renders its metadata, headings and frontmatter facts', async () => {
    await request(`${blog}/route-tests/nested`, 200, (document) => {
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
    await request(`${viBlog}/route-tests/nested`, 200, (document) => {
      const post = article(document, 'Bài viết thử nghiệm');
      assert.equal(post.querySelector('header a')?.getAttribute('href'), viListing);
      assert.match(document.title, /Tiêu đề SEO thử nghiệm/);
      assert.equal(document.documentElement.getAttribute('lang'), 'vi');
      assert.equal(post.querySelector('.blog-prose')?.getAttribute('lang'), 'vi');
      assert.doesNotMatch(post.textContent, /chưa có bản dịch/);
      const href = post.querySelector('a[aria-label="Facebook"]')?.getAttribute('href');
      assert.ok(href);
      const share = new URL(href).searchParams.get('u');
      assert.ok(share);
      assert.equal(new URL(share).pathname, `${viBlog}/route-tests/nested`);
      assertRelated(post, `${viBlog}/route-tests/related`);
    });
  });

  test('Vietnamese routes fall back to the default article without recommending it', async () => {
    if (noPrefix) {
      await request(`${viBlog}/sample`, 404, () => {});
      return;
    }
    await request(`${viBlog}/sample`, 200, (document) => {
      const post = article(
        document,
        'Introducing Nuxt Starter Kit: A Production-Ready SaaS Foundation for Busy Nuxters',
      );
      assert.equal(post.querySelector('.blog-prose')?.getAttribute('lang'), 'en');
      assert.match(
        post.querySelector('[role="status"]')?.textContent ?? '',
        /chưa có bản dịch Tiếng Việt.*\(English\)/,
      );
      assert.equal(post.querySelector('header a')?.getAttribute('href'), viListing);
      assert.ok(!post.querySelector('time.invalid, header time, img[fetchpriority="high"]'));
      assert.ok(!post.querySelector(`#post-body a[href="${viBlog}/sample"]`));
      assert.ok(post.querySelector(`#post-body a[href="${viBlog}/route-tests/nested"]`));
    });
  });

  test('the starter article renders without cover or date', async () => {
    await request(`${blog}/sample`, 200, (document) => {
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
    await request(`${viBlog}/route-tests/related`, 200, (document) => {
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
    await request(`${viBlog}/route-tests/missing`, 404, (document) => {
      assert.equal(document.querySelector('h1')?.textContent.trim(), 'Không tìm thấy');
      assert.ok(document.querySelector(`main a[href="${viListing}"]`));
      assert.ok(!document.querySelector('article[data-post-panels]'));
    });
  });
});
