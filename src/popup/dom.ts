type Child = Node | string | null | false;

interface Props {
  class?: string;
  attrs?: Record<string, string>;
  on?: { [E in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[E]) => void };
}

/**
 * Builds an element. Text children are always set as text, never parsed as HTML, so
 * cookie names and values can be shown safely.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.class) element.className = props.class;
  for (const [name, value] of Object.entries(props.attrs ?? {})) element.setAttribute(name, value);
  for (const [type, listener] of Object.entries(props.on ?? {})) {
    element.addEventListener(type, listener as EventListener);
  }
  for (const child of children) {
    if (child !== null && child !== false) element.append(child);
  }
  return element;
}

/** One of the brand's sprite icons (`theme/ui/icons.svg`), decorative. */
export function icon(name: string, size = ''): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `icon ${size}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `../theme/ui/icons.svg#i-${name}`);
  svg.append(use);
  return svg;
}
