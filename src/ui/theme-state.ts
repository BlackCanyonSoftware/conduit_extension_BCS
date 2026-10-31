export type Theme = 'light' | 'dark';

/** What the theme button must announce for the theme currently showing (US-015). */
export function themeButtonState(theme: Theme): { pressed: boolean; label: string } {
  return {
    pressed: theme === 'dark',
    label: `Switch to a ${theme === 'dark' ? 'light' : 'dark'} background`,
  };
}

/**
 * The brand's theme-switch script only updates the button after a click, so on a dark
 * system with no saved choice the button would start out describing the wrong theme.
 * This brings it in line on load, using the same wording the script uses.
 */
export function syncThemeButton(
  root: HTMLElement = document.documentElement,
  button: HTMLElement | null = document.getElementById('bk-theme'),
): void {
  if (!button) return;
  const explicit = root.dataset.theme;
  const theme: Theme =
    explicit === 'dark' || explicit === 'light'
      ? explicit
      : matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  const { pressed, label } = themeButtonState(theme);
  button.setAttribute('aria-pressed', String(pressed));
  button.setAttribute('aria-label', label);
}
