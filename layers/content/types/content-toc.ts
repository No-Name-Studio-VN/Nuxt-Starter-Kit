export type ContentTocHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface UseContentTocOptions {
  /** CSS selector for content containers. Defaults to `.docs-content`. */
  scopeSelector?: string;
  /** Heading levels to observe. Defaults to h1 through h4; an empty list disables observation. */
  headingLevels?: readonly ContentTocHeadingLevel[];
}
