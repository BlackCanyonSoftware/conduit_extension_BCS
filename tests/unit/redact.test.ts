import { describe, expect, it } from 'vitest';
import { MASK, redact } from '../../src/core/redact';

describe('US-003: redacted previews', () => {
  it('shows only the first and last four characters of a long value', () => {
    expect(redact('abcdefghijklmnopqrstuvwxyz')).toBe('abcd…wxyz');
  });

  it('still redacts a value of exactly twelve characters', () => {
    expect(redact('abcdefghijkl')).toBe('abcd…ijkl');
  });

  it('masks a shorter value completely, because eight characters would reveal most of it', () => {
    expect(redact('abcdefghijk')).toBe(MASK);
    expect(redact('dark')).toBe(MASK);
  });

  it('leaves an empty value empty', () => {
    expect(redact('')).toBe('');
  });

  it('counts characters, not UTF-16 units, so an emoji is never split', () => {
    const value = '😀😀😀😀middle-part😀😀😀😀';

    expect(redact(value)).toBe('😀😀😀😀…😀😀😀😀');
  });
});
