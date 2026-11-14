import type { AdminKvKeyRow, AdminKvValuePayload } from '#layers/admin-kv/types/adminKv';

export interface AdminKvTableRow extends AdminKvKeyRow {
  value?: AdminKvValuePayload;
}
