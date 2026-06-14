import type { ServerErrorReportContext } from '~~/types/errors'

export function reportServerError(error: unknown, context: ServerErrorReportContext = {}) {
  console.error('[Server Error]', { error, context })
}
