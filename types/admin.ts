export interface DeletePayload {
  deleted: true;
}

export interface ClearedPayload {
  cleared: true;
}

export type AdminKvValueMode = 'raw' | 'json';

export type AdminKvDetectedType =
  | 'array'
  | 'boolean'
  | 'json'
  | 'null'
  | 'number'
  | 'object'
  | 'string'
  | 'unknown';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface AdminKvKeyRow {
  key: string;
  prefix: string;
  isTemporary: boolean;
  temporaryReason: string | null;
}

export interface AdminKvValuePayload {
  key: string;
  value: string;
  mode: AdminKvValueMode;
  detectedType: AdminKvDetectedType;
  valueBytes: number;
}

export interface AdminKvKeysPayload {
  keys: AdminKvKeyRow[];
  total: number;
}

export interface AdminKvValuesResponsePayload {
  values: AdminKvValuePayload[];
}

export interface AdminKvDeletePayload {
  deleted: number;
}

export interface AdminUserCreatePayload {
  id: number;
  username: string;
  name: string;
  email: string;
  isAdmin: boolean;
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

export interface AdminBulkUserDeletePayload {
  deleted: number;
}
