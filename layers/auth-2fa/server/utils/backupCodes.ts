import { BACKUP_CODE_COUNT, BACKUP_CODE_LENGTH } from '#layers/auth-2fa/shared/constants/totp';

export function generateBackupCodes(previousCodes: readonly string[] = []): string[] {
  const codes = new Set<string>();
  while (codes.size < BACKUP_CODE_COUNT) {
    let code = '';
    while (code.length < BACKUP_CODE_LENGTH) {
      const bytes = crypto.getRandomValues(new Uint8Array(BACKUP_CODE_LENGTH));
      for (const byte of bytes) {
        // 252 is divisible by 36; rejecting the remaining values avoids modulo bias.
        if (byte >= 252) continue;
        code += (byte % 36).toString(36).toUpperCase();
        if (code.length === BACKUP_CODE_LENGTH) break;
      }
    }
    if (!previousCodes.includes(code)) codes.add(code);
  }
  return [...codes];
}
