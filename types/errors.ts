export interface ReportServerErrorContext {
  code?: string;
  status?: number;
  statusText?: string;
  message?: string;
  extra?: Record<string, unknown>;
}
