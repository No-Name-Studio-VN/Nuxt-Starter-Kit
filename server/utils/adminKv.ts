import type {
  AdminKvDetectedType,
  AdminKvKeyRow,
  AdminKvValueMode,
  AdminKvValuePayload,
  JsonValue,
} from '~~/types/admin';

const textEncoder = new TextEncoder();

interface TemporaryPrefixDefinition {
  prefix: string;
  reason: string;
}

interface ParseAdminKvJsonResult {
  success: boolean;
  value?: JsonValue;
  message?: string;
}

const temporaryPrefixDefinitions: TemporaryPrefixDefinition[] = [
  {
    prefix: 'auth:challenge:',
    reason:
      'Short-lived WebAuthn challenge. Editing or deleting it can break an in-progress sign-in or passkey flow.',
  },
];

export function getAdminKvKeyRow(key: string): AdminKvKeyRow {
  const temporaryDefinition =
    temporaryPrefixDefinitions.find((definition) => key.startsWith(definition.prefix)) ?? null;

  return {
    key,
    prefix: getAdminKvPrefix(key),
    isTemporary: temporaryDefinition !== null,
    temporaryReason: temporaryDefinition?.reason ?? null,
  };
}

export function serializeAdminKvValue(key: string, value: unknown): AdminKvValuePayload {
  if (typeof value === 'string') {
    const mode: AdminKvValueMode = isJsonText(value) ? 'json' : 'raw';

    return {
      key,
      value,
      mode,
      detectedType: 'string',
      valueBytes: getUtf8ByteLength(value),
    };
  }

  const serializedValue = stringifyJsonValue(value);

  return {
    key,
    value: serializedValue,
    mode: 'json',
    detectedType: getDetectedType(value),
    valueBytes: getUtf8ByteLength(serializedValue),
  };
}

export function parseAdminKvJsonValue(value: string): ParseAdminKvJsonResult {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!isJsonValue(parsed)) {
      return {
        success: false,
        message: 'JSON value must be a valid JSON object, array, string, number, boolean, or null.',
      };
    }

    return {
      success: true,
      value: parsed,
    };
  } catch (error) {
    return {
      success: false,
      message: getJsonParseErrorMessage(error),
    };
  }
}

export function getAdminKvWriteValue(
  value: string,
  mode: AdminKvValueMode,
): ParseAdminKvJsonResult {
  if (mode === 'raw') {
    return {
      success: true,
      value,
    };
  }

  return parseAdminKvJsonValue(value);
}

function getAdminKvPrefix(key: string): string {
  const colonIndex = key.indexOf(':');

  if (colonIndex > 0) {
    return key.slice(0, colonIndex);
  }

  const slashIndex = key.indexOf('/');

  if (slashIndex > 0) {
    return key.slice(0, slashIndex);
  }

  return 'root';
}

function stringifyJsonValue(value: unknown): string {
  const serializedValue = JSON.stringify(value, null, 2);
  return serializedValue === undefined ? '' : serializedValue;
}

function isJsonText(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function getDetectedType(value: unknown): AdminKvDetectedType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'object') return 'object';
  return 'unknown';
}

function getUtf8ByteLength(value: string): number {
  return textEncoder.encode(value).length;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  if (typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item));
  if (!isRecord(value)) return false;

  return Object.values(value).every((item) => isJsonValue(item));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getJsonParseErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Invalid JSON value.';
}
