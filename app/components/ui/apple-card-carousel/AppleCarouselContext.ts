import type { ComputedRef, InjectionKey, Ref } from "vue";

export interface CarouselContextType {
  onCardClose: (index: number) => void;
  currentIndex: Ref<number>;
  shortScreen: ComputedRef<boolean>;
}

export const CarouselKey: InjectionKey<CarouselContextType> = Symbol();
