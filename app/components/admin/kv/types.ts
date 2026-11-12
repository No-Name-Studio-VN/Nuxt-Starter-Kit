import type { AdminKvKeyRow, AdminKvValuePayload } from '#layers/admin/types/admin';

export interface AdminKvTableRow extends AdminKvKeyRow {
  value?: AdminKvValuePayload;
}
