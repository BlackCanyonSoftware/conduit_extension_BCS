import { describe, expect, it } from 'vitest';
import { themeButtonState } from '../../src/popup/theme-state';

describe('theme button state (US-015)', () => {
  it('offers the light background while the dark one is showing', () => {
    expect(themeButtonState('dark')).toEqual({
      pressed: true,
      label: 'Switch to a light background',
    });
  });

  it('offers the dark background while the light one is showing', () => {
    expect(themeButtonState('light')).toEqual({
      pressed: false,
      label: 'Switch to a dark background',
    });
  });
});
