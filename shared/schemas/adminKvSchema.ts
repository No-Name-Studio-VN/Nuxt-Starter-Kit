import { z } from 'zod';

export const ADMIN_KV_MAX_KEY_BYTES = 512;
export const ADMIN_KV_MAX_VALUE_BYTES = 25 * 1024 * 1024;

const textEncoder = new TextEncoder();

function getUtf8ByteLength(value: string): number {
  return textEncoder.encode(value).length;
}

export const adminKvKeySchema = z
  .string()
  .refine((value) => value.trim().length > 0, 'KV key is required')
  .refine(
    (value) => getUtf8ByteLength(value) <= ADMIN_KV_MAX_KEY_BYTES,
    'KV key must be 512 bytes or less',
  );

export const adminKvValueModeSchema = z.enum(['raw', 'json']);

export const adminKvValueTextSchema = z
  .string()
  .refine(
    (value) => getUtf8ByteLength(value) <= ADMIN_KV_MAX_VALUE_BYTES,
    'KV value must be 25 MiB or less',
  );

export const adminKvMutationSchema = z.object({
  key: adminKvKeySchema,
  value: adminKvValueTextSchema,
  mode: adminKvValueModeSchema.default('raw'),
});

export const adminKvValuesPayloadSchema = z.object({
  keys: z
    .array(adminKvKeySchema)
    .min(1, 'At least one KV key is required')
    .max(100, 'Load at most 100 values at once'),
});

export const adminKvDeletePayloadSchema = z.object({
  keys: z
    .array(adminKvKeySchema)
    .min(1, 'At least one KV key is required')
    .max(1000, 'Delete at most 1000 keys at once'),
});

export type AdminKvValueMode = z.infer<typeof adminKvValueModeSchema>;
export type AdminKvMutationInput = z.infer<typeof adminKvMutationSchema>;
export type AdminKvValuesPayloadInput = z.infer<typeof adminKvValuesPayloadSchema>;
export type AdminKvDeletePayloadInput = z.infer<typeof adminKvDeletePayloadSchema>;
