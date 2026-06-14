import type { PaginationMeta } from '~~/types/models/pagination'

export type ApiFieldErrors = Record<string, string[]>
export type ApiErrorDetails = Record<string, unknown>

export interface ApiResponseSuccess<T> {
  success: true
  data: T
  message?: string
  timestamp: string
}

export interface ApiResponseFailure {
  success: false
  error: {
    code: string
    message: string
    fieldErrors?: ApiFieldErrors
    details?: ApiErrorDetails
  }
  timestamp: string
}

export type ApiResponse<T> = ApiResponseSuccess<T> | ApiResponseFailure

export type PaginatedApiResponse<T> = (ApiResponseSuccess<T> & {
  pagination: PaginationMeta
}) | ApiResponseFailure

export interface ApiErrorOptions {
  status: number
  statusText: string
  message: string
  code?: string
  fieldErrors?: ApiFieldErrors
  details?: ApiErrorDetails
  cause?: unknown
}

export interface ParsedApiError {
  message: string
  code: string
  status?: number
  statusText?: string
  fieldErrors: ApiFieldErrors
  details: ApiErrorDetails
}
