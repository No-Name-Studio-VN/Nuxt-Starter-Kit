// Credit: nuxt-themes/docus

/**
 * Scrollspy allows you to watch visible headings in a specific page.
 * Useful for table of contents live style updates.
 */
export function useScrollspy() {
  const observer = shallowRef<IntersectionObserver | null>(null);
  const visibleHeadings = ref<string[]>([]);
  const activeHeadings = ref<string[]>([]);

  const observerCallback = (entries: IntersectionObserverEntry[]) =>
    entries.forEach((entry) => {
      const id = entry.target.id;

      if (entry.isIntersecting) visibleHeadings.value.push(id);
      else visibleHeadings.value = visibleHeadings.value.filter((t) => t !== id);
    });

  const updateHeadings = (headings: Element[]) => {
    if (observer.value) observer.value.disconnect();
    observer.value = new IntersectionObserver(observerCallback);

    const currentObserver = observer.value;
    headings.forEach((heading) => {
      currentObserver.observe(heading);
    });
  };

  watch(
    visibleHeadings,
    (val, oldVal) => {
      if (val.length === 0) activeHeadings.value = oldVal;
      else activeHeadings.value = val;
    },
    { deep: true },
  );

  onBeforeUnmount(() => {
    observer.value?.disconnect();
  });

  return {
    visibleHeadings,
    activeHeadings,
    updateHeadings,
  };
}
