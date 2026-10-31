export const MASK = '••••••••';

const REVEAL = 4;
/** Below this length, showing the first and last four characters would reveal most of the value. */
const MIN_LENGTH_TO_PREVIEW = 12;

/**
 * A safe preview of a secret: the first and last four characters with an ellipsis between.
 * Shorter values are masked completely. Counts characters, not UTF-16 units.
 */
export function redact(value: string): string {
  const characters = Array.from(value);
  if (characters.length === 0) return '';
  if (characters.length < MIN_LENGTH_TO_PREVIEW) return MASK;
  return `${characters.slice(0, REVEAL).join('')}…${characters.slice(-REVEAL).join('')}`;
}
