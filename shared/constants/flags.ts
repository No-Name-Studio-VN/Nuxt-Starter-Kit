/**
 * KV key used to store the cached flag configuration blob.
 * All flags are serialized into a single JSON value under this key
 * so that runtime evaluation requires only one KV read.
 */
export const KV_FLAGS_KEY = 'feature_flags:config';

/**
 * When enabled, visually obfuscates UI text for demos/screenshots while
 * preserving the underlying HTML/content structure for SEO and crawlers.
 */
export const TEXT_OBFUSCATION_FLAG = 'text-obfuscation';
