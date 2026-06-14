import { z } from 'zod'
import { TOTP_LENGTH } from '#shared/constants/totp'

export const positiveIdSchema = z.coerce.number().int().positive('ID is required')

export const userIdSchema = z.coerce.number().int().positive('User ID is required')

export const coerceDateFields = {
  createdAt: z.coerce.date().nullish(),
  updatedAt: z.coerce.date().nullish(),
}

export function nonEmptyStringSchema(fieldName: string) {
  return z.string().trim().min(1, `${fieldName} is required`)
}

export function requiredStringSchema(message: string) {
  return z.string().min(1, message)
}

export function emailFieldSchema(error = 'Valid email is required') {
  return z.email({ error })
}

export function urlFieldSchema(error = 'Must be a valid URL') {
  return z.string().trim().url({ error })
}

export function urlOrEmptyFieldSchema(error = 'Must be a valid URL') {
  return z.string().trim().url({ error }).or(z.literal(''))
}

export function maxStringSchema(max: number, error: string) {
  return z.string().max(max, error)
}

export function totpCodeSchema(error = `Authenticator code must be ${TOTP_LENGTH} digits`) {
  return z.string().length(TOTP_LENGTH, error)
}

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
})

export const commonSchemaFragments = {
  userId: userIdSchema,
  coerceDates: coerceDateFields,
  positiveId: positiveIdSchema,
  nonEmptyString: nonEmptyStringSchema,
}
