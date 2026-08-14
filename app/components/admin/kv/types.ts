import type { AdminKvKeyRow, AdminKvValuePayload } from '~~/types/admin';

export interface AdminKvTableRow extends AdminKvKeyRow {
  value?: AdminKvValuePayload;
}
