import { useEventListener } from '@vueuse/core';
import { onScopeDispose, type Ref } from 'vue';

export function useBlogPostSnap(
  article: Readonly<Ref<HTMLElement | null>>,
  body: Readonly<Ref<HTMLElement | null>>,
  enabled: Readonly<Ref<boolean>>,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  useEventListener(
    article,
    'wheel',
    (event) => {
      clearTimeout(timer);
      if (!enabled.value || event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY))
        return;
      if (event.target instanceof Element && event.target.closest('dialog, [role="dialog"]'))
        return;

      timer = setTimeout(() => {
        if (!enabled.value || !article.value || !body.value) return;
        if (
          document.querySelector(
            'dialog[open], [aria-modal="true"], [role="dialog"][data-state="open"]',
          )
        )
          return;

        const bodyTop = body.value.getBoundingClientRect().top;
        const viewport = window.innerHeight;
        // Only settle when the viewport straddles the hero/body boundary. Native
        // scrolling owns the rest of the article, including its entire long body.
        if (bodyTop <= 1 || bodyTop >= viewport - 1) return;

        const heroTop = article.value.getBoundingClientRect().top;
        const top = event.deltaY > 0 ? bodyTop : Math.max(heroTop, bodyTop - viewport);
        window.scrollBy({ top, behavior: 'smooth' });
      }, 150);
    },
    { passive: true },
  );

  onScopeDispose(() => clearTimeout(timer));
}
