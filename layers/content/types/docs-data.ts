import type { ContentCollectionItem, ContentNavigationItem } from '@nuxt/content';
import type { ShallowRef } from 'vue';

export interface DocsPageContent {
  page: ContentCollectionItem;
  isFallback: boolean;
}

export interface DocsSharedState {
  page: ShallowRef<ContentCollectionItem | null>;
  navigation: ShallowRef<ContentNavigationItem[] | null>;
  /** [previous, next]; either side is null at the ends of the tree. */
  surroundings: ShallowRef<(ContentNavigationItem | null)[] | null>;
}
