import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import AppleCard from '@/components/ui/apple-card-carousel/AppleCard.vue';
import AppleCardCarousel from '@/components/ui/apple-card-carousel/AppleCardCarousel.vue';

const compactHeight = 'md:h-[clamp(18rem,calc(100svh-26rem),40rem)]';
const defaultHeight = 'md:h-[40rem]';

function renderCard() {
  return h(AppleCard, {
    card: { src: '/sample.jpg', title: 'Sample card', category: 'Samples' },
    index: 0,
  });
}

describe('AppleCardCarousel sizing', () => {
  it('preserves the default card height and rail padding when shortScreen is omitted', () => {
    const wrapper = mount(AppleCardCarousel, { slots: { default: renderCard } });

    try {
      const rail = wrapper.get('[class~="overflow-x-scroll"]');
      const card = rail.get('[class~="w-56"]');

      expect(rail.classes()).toEqual(expect.arrayContaining(['py-10', 'md:py-20']));
      expect(rail.classes()).not.toContain('py-8');
      expect(card.classes()).toEqual(expect.arrayContaining(['h-80', 'md:w-96', defaultHeight]));
      expect(card.classes()).not.toContain(compactHeight);
    } finally {
      wrapper.unmount();
    }
  });

  it('tracks shortScreen changes on the rail and its already-mounted cards', async () => {
    const wrapper = mount(AppleCardCarousel, {
      props: { shortScreen: true },
      slots: { default: renderCard },
    });

    try {
      const rail = wrapper.get('[class~="overflow-x-scroll"]');
      const card = rail.get('[class~="w-56"]');

      expect(rail.classes()).toContain('py-8');
      expect(rail.classes()).not.toContain('py-10');
      expect(rail.classes()).not.toContain('md:py-20');
      expect(card.classes()).toEqual(expect.arrayContaining(['h-80', 'md:w-96', compactHeight]));
      expect(card.classes()).not.toContain(defaultHeight);

      await wrapper.setProps({ shortScreen: false });

      expect(rail.classes()).toEqual(expect.arrayContaining(['py-10', 'md:py-20']));
      expect(rail.classes()).not.toContain('py-8');
      expect(card.classes()).toEqual(expect.arrayContaining(['h-80', 'md:w-96', defaultHeight]));
      expect(card.classes()).not.toContain(compactHeight);

      await wrapper.setProps({ shortScreen: true });

      expect(rail.classes()).toContain('py-8');
      expect(card.classes()).toContain(compactHeight);
    } finally {
      wrapper.unmount();
    }
  });
});
