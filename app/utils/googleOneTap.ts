import type { GoogleAccountsId } from '~~/types/googleOneTap';

export type { GoogleAccountsId, GoogleCredentialResponse } from '~~/types/googleOneTap';

export const GOOGLE_IDENTITY_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let googleIdentityScriptPromise: Promise<GoogleAccountsId | null> | null = null;
const GOOGLE_IDENTITY_DISABLE_AUTO_SELECT_TIMEOUT_MS = 1500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isGoogleAccountsId(value: unknown): value is GoogleAccountsId {
  return (
    isRecord(value) &&
    typeof value.initialize === 'function' &&
    typeof value.prompt === 'function' &&
    typeof value.cancel === 'function' &&
    typeof value.disableAutoSelect === 'function'
  );
}

export function getGoogleAccountsId() {
  if (typeof window === 'undefined') {
    return null;
  }

  const google = Reflect.get(window, 'google');
  if (!isRecord(google)) {
    return null;
  }

  const accounts = Reflect.get(google, 'accounts');
  if (!isRecord(accounts)) {
    return null;
  }

  const accountsId = Reflect.get(accounts, 'id');
  return isGoogleAccountsId(accountsId) ? accountsId : null;
}

function resolveGoogleAccountsId() {
  return getGoogleAccountsId();
}

function findGoogleIdentityScriptElement() {
  const script = document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT_SRC}"]`);

  return script instanceof HTMLScriptElement ? script : null;
}

function waitForGoogleIdentityScript(script: HTMLScriptElement) {
  return new Promise<void>((resolve) => {
    if (getGoogleAccountsId()) {
      resolve();
      return;
    }

    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => resolve(), { once: true });
  });
}

function loadGoogleIdentityScriptElement() {
  const existingScript = findGoogleIdentityScriptElement();

  if (existingScript) {
    return waitForGoogleIdentityScript(existingScript);
  }

  const script = document.createElement('script');
  script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
  script.async = true;
  script.defer = true;

  const loadPromise = waitForGoogleIdentityScript(script);
  document.head.appendChild(script);

  return loadPromise;
}

export function loadGoogleIdentityScript() {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  if (!googleIdentityScriptPromise) {
    googleIdentityScriptPromise = loadGoogleIdentityScriptElement().then(() =>
      resolveGoogleAccountsId(),
    );
  }

  return googleIdentityScriptPromise;
}

export function cancelGoogleOneTapPrompt() {
  getGoogleAccountsId()?.cancel();
}

function waitForGoogleIdentityDisableAutoSelectTimeout() {
  return new Promise<null>((resolve) => {
    window.setTimeout(() => resolve(null), GOOGLE_IDENTITY_DISABLE_AUTO_SELECT_TIMEOUT_MS);
  });
}

export async function disableGoogleOneTapAutoSelect() {
  if (typeof window === 'undefined') {
    return;
  }

  await Promise.race([loadGoogleIdentityScript(), waitForGoogleIdentityDisableAutoSelectTimeout()]);

  getGoogleAccountsId()?.disableAutoSelect();
}
