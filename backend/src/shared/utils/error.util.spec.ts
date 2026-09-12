import { errorMessage } from './error.util';

describe('errorMessage', () => {
  it('returns the message for an Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns the stack when withStack is true', () => {
    const err = new Error('boom');
    expect(errorMessage(err, true)).toBe(err.stack);
  });

  it('falls back to the message when withStack is true but stack is undefined', () => {
    const err = new Error('boom');
    err.stack = undefined;
    expect(errorMessage(err, true)).toBe('boom');
  });

  it('returns a non-Error string as-is', () => {
    expect(errorMessage('plain string')).toBe('plain string');
  });

  it('stringifies a non-Error object', () => {
    expect(errorMessage({ code: 'X' })).toBe(String({ code: 'X' }));
  });

  it('stringifies a number', () => {
    expect(errorMessage(42)).toBe('42');
  });

  it('stringifies null', () => {
    expect(errorMessage(null)).toBe('null');
  });

  it('stringifies undefined', () => {
    expect(errorMessage(undefined)).toBe('undefined');
  });
});
