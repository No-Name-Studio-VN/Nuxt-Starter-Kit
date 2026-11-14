import type { tables } from '#layers/database/server/utils/db';

export type DBPasskey = typeof tables.credentials.$inferSelect;

export interface PasskeyModel {
  id: string;
  name: string;
  transports: string[] | null;
  backedUp: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DeletePasskeyResponse = {
  message: string;
};
