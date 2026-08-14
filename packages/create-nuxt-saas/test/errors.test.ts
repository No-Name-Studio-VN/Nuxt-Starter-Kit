import { describe, expect, it } from 'vitest';
import { CliError } from '../src/errors';

describe('CliError', () => {
  it('carries a message and is identifiable by name', () => {
    const error = new CliError('registry is missing');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CliError');
    expect(error.message).toBe('registry is missing');
  });
});
