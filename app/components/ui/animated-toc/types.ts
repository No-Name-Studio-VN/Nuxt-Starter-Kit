import type { HTMLAttributes } from 'vue';

export interface AnimatedTocItem {
  /** Entry label. */
  label: string;
  /** Nesting depth (0 = top level, 1 = nested). */
  depth?: number;
  /** Optional anchor href for real page navigation. */
  href?: string;
}

export interface AnimatedTocProps {
  /** Table of contents entries, in order. */
  items: AnimatedTocItem[];
  /** Row height in px. */
  rowHeight?: number;
  /** Horizontal indent per depth level in px. */
  indent?: number;
  /** Heading shown above the list. Empty string hides it. */
  title?: string;
  /** Accessible navigation name, even when the visible title is hidden. */
  ariaLabel?: string;
  /** Show the SVG progress rail and dot. */
  progressBar?: boolean;
  class?: HTMLAttributes['class'];
}
