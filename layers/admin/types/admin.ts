export interface DeletePayload {
  deleted: true;
}

export interface FeatureFlagEvaluatePayload {
  key: string;
  enabled: boolean;
  context: {
    userId?: number;
    isAdmin: boolean;
    region?: string;
  };
}

export interface FeatureFlagImportSummaryPayload {
  created: number;
  updated: number;
  skipped: number;
}
