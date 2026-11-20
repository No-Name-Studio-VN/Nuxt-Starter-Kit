import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from '../../../layers/auth/app/utils/safeRedirect';

const origin = 'https://app.example.test';

describe('client safe redirects', () => {
  it('accepts absolute same-origin URLs on the server when given the request origin', () => {
    expect(safeRedirectPath(`${origin}/dashboard?tab=profile#top`, '/', origin)).toBe('/dashboard?tab=profile#top');
  });

  it('honors the caller’s fallback for invalid or off-origin targets', () => {
    expect(safeRedirectPath('https://other.example.test/path', '', origin)).toBe('');
    expect(safeRedirectPath(undefined, '', origin)).toBe('');
  });

  it('rejects paths that would be interpreted as external URLs after removing the origin', () => {
    expect(safeRedirectPath(`${origin}//other.example.test`, '/', origin)).toBe('/');
    expect(safeRedirectPath(`blob:${origin}/id`, '/', origin)).toBe('/');
  });
});
