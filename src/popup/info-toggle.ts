/**
 * Wires every `[data-info-toggle]` button to show or hide the element named by its
 * `aria-controls`, keeping `aria-expanded` and `hidden` in step (US-016).
 * Throws if a button points at an element that is not on the page.
 */
export function initInfoToggles(root: ParentNode = document): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-info-toggle]')) {
    const panelId = button.getAttribute('aria-controls');
    const panel = panelId ? document.getElementById(panelId) : null;
    if (!panel) {
      throw new Error(`Info button has no panel to control (aria-controls="${panelId ?? ''}")`);
    }
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
    });
  }
}
