// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, shallowRef } from 'vue';
import { useBlogPostSnap } from '../../../layers/content/app/composables/useBlogPostSnap';

let unmount: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('innerHeight', 800);
});

afterEach(() => {
  unmount?.();
  unmount = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mountArticle(bodyTop: number, enabled = true) {
  const host = document.createElement('main');
  const article = document.createElement('article');
  const body = document.createElement('section');
  host.append(article);
  article.append(body);
  document.body.append(host);
  const mountPoint = document.createElement('div');
  document.body.append(mountPoint);
  vi.spyOn(article, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, bodyTop - 800));
  vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, bodyTop));
  const scrollBy = vi.spyOn(window, 'scrollBy');
  const app = createApp({
    setup() {
      useBlogPostSnap(shallowRef(article), shallowRef(body), shallowRef(enabled));
      return () => h('div');
    },
  });
  app.mount(mountPoint);
  unmount = () => app.unmount();
  await nextTick();
  return { article, body, host, scrollBy };
}

function wheel(target: Element, deltaY = 100) {
  const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
}

describe('article panel settling', () => {
  it.each([
    [100, 500],
    [-100, -300],
  ])('settles a partial transition in wheel direction %s', async (delta, top) => {
    const { article, scrollBy } = await mountArticle(500);
    wheel(article, delta);
    expect(scrollBy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(scrollBy).toHaveBeenCalledWith({ top, behavior: 'smooth' });
  });

  it('leaves reading inside a long body to native scrolling', async () => {
    const { body, scrollBy } = await mountArticle(-200);
    wheel(body);
    vi.advanceTimersByTime(150);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('never snaps with narrow-screen or reduced-motion settings', async () => {
    const { article, scrollBy } = await mountArticle(500, false);
    wheel(article);
    vi.advanceTimersByTime(150);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('does not move the article if a modal opens during the scroll pause', async () => {
    const { article, scrollBy } = await mountArticle(500);
    wheel(article);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    vi.advanceTimersByTime(150);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('cancels pending settling on route exit and drops the wheel listener', async () => {
    const { article, scrollBy } = await mountArticle(500);
    wheel(article);
    unmount?.();
    unmount = undefined;
    vi.advanceTimersByTime(150);
    wheel(article);
    vi.advanceTimersByTime(150);
    expect(scrollBy).not.toHaveBeenCalled();
  });
});
