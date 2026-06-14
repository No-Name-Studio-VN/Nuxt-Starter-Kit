import type { ApiErrorDetails, ApiResponseFailure, ParsedApiError } from '~~/types/api'

export type { ParsedApiError } from '~~/types/api'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' ? value : undefined
}

function readErrorStatus(record: Record<string, unknown>): number | undefined {
  return readNumber(record, 'status') ?? readNumber(record, 'statusCode')
}

function readErrorStatusText(record: Record<string, unknown>): string | undefined {
  return readString(record, 'statusText') ?? readString(record, 'statusMessage')
}

function readFieldErrors(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {}

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string[]] => isStringArray(entry[1])),
  )
}

function readDetails(value: unknown): ApiErrorDetails {
  return isRecord(value) ? value : {}
}

function readOptionalRecordField(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = record[key]
  return isRecord(value) ? value : null
}

function readBareErrorObject(value: unknown): {
  code: string
  message: string
  fieldErrors: Record<string, string[]>
  details: ApiErrorDetails
} | null {
  if (!isRecord(value)) return null

  const code = readString(value, 'code')
  const message = readString(value, 'message')
  if (!code || !message) return null

  return {
    code,
    message,
    fieldErrors: readFieldErrors(value.fieldErrors),
    details: readDetails(value.details),
  }
}

function readFailureEnvelope(value: unknown): ApiResponseFailure | null {
  if (!isRecord(value) || value.success !== false || !isRecord(value.error)) {
    return null
  }

  const code = readString(value.error, 'code')
  const message = readString(value.error, 'message')

  if (!code || !message) {
    return null
  }

  const timestamp = readString(value, 'timestamp')

  if (!timestamp) {
    return null
  }

  const fieldErrors = readFieldErrors(value.error.fieldErrors)
  const details = readDetails(value.error.details)

  return {
    success: false,
    error: Object.keys(fieldErrors).length > 0 || Object.keys(details).length > 0
      ? { code, message, ...(Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}), ...(Object.keys(details).length > 0 ? { details } : {}) }
      : { code, message },
    timestamp,
  }
}

export function parseApiError(error: unknown, fallbackMessage = 'An unexpected error occurred.'): ParsedApiError {
  const errorRecord = isRecord(error) ? error : null
  const data = errorRecord && 'data' in errorRecord ? errorRecord.data : undefined
  const dataRecord = isRecord(data) ? data : null
  const nestedData = dataRecord ? dataRecord.data : undefined
  const nestedRecord = dataRecord ? readOptionalRecordField(dataRecord, 'data') : null

  const envelope = readFailureEnvelope(nestedData) ?? readFailureEnvelope(data) ?? readFailureEnvelope(error)
  const bareError = readBareErrorObject(error) ?? readBareErrorObject(data) ?? readBareErrorObject(nestedData)

  const status = errorRecord
    ? readErrorStatus(errorRecord) ?? (dataRecord ? readErrorStatus(dataRecord) : undefined)
    : dataRecord ? readErrorStatus(dataRecord) : undefined
  const statusText = errorRecord
    ? readErrorStatusText(errorRecord) ?? (dataRecord ? readErrorStatusText(dataRecord) : undefined)
    : dataRecord ? readErrorStatusText(dataRecord) : undefined

  if (envelope) {
    return {
      message: envelope.error.message,
      code: envelope.error.code,
      status,
      statusText,
      fieldErrors: envelope.error.fieldErrors ?? {},
      details: envelope.error.details ?? {},
    }
  }

  if (bareError) {
    return {
      message: bareError.message,
      code: bareError.code,
      status,
      statusText,
      fieldErrors: bareError.fieldErrors,
      details: bareError.details,
    }
  }

  const legacyMessage = nestedRecord
    ? readString(nestedRecord, 'message')
    ?? readString(nestedRecord, 'statusText')
    ?? readString(nestedRecord, 'statusMessage')
    : undefined

  const bodyMessage = dataRecord
    ? readString(dataRecord, 'message')
    ?? readString(dataRecord, 'statusText')
    ?? readString(dataRecord, 'statusMessage')
    : undefined

  const errorMessage = error instanceof Error ? error.message : undefined
  const nestedFieldErrors = nestedRecord ? readFieldErrors(nestedRecord.fieldErrors) : {}
  const bodyFieldErrors = dataRecord ? readFieldErrors(dataRecord.fieldErrors) : {}
  const nestedDetails = nestedRecord ? readDetails(nestedRecord.details) : {}
  const bodyDetails = dataRecord ? readDetails(dataRecord.details) : {}

  return {
    message: legacyMessage ?? bodyMessage ?? errorMessage ?? fallbackMessage,
    code: nestedRecord
      ? readString(nestedRecord, 'code') ?? (dataRecord ? readString(dataRecord, 'code') : undefined) ?? 'ERROR'
      : dataRecord ? readString(dataRecord, 'code') ?? 'ERROR' : 'ERROR',
    status,
    statusText,
    fieldErrors: Object.keys(nestedFieldErrors).length > 0
      ? nestedFieldErrors
      : bodyFieldErrors,
    details: Object.keys(nestedDetails).length > 0
      ? nestedDetails
      : bodyDetails,
  }
}
