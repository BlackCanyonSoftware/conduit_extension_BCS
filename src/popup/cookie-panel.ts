import { CookieFormatError, exportCookies } from '../core/cookies/formats';
import { siteScopeFor } from '../core/cookies/site';
import { cookieKey, sortCookies, type Cookie, type ExportFormat } from '../core/cookies/types';
import { redact } from '../core/redact';
import {
  getActiveTabUrl,
  getSiteCookies,
  hasSiteAccess,
  requestSiteAccess,
} from '../platform/cookies';
import { h, icon } from '../ui/dom';
import { downloadText } from '../ui/download';

const FORMATS: { id: ExportFormat; label: string }[] = [
  { id: 'netscape', label: 'cookies.txt' },
  { id: 'json', label: 'JSON' },
  { id: 'header', label: 'Cookie header' },
];

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

/** Fills `root` with the cookie list for the site in the active tab (US-001 to US-003). */
export async function mountCookiePanel(root: HTMLElement): Promise<void> {
  root.replaceChildren(
    h(
      'div',
      { class: 'popup-message', attrs: { role: 'status' } },
      h('div', { class: 'spinner', attrs: { 'aria-hidden': 'true' } }),
      h('span', {}, 'Reading cookies…'),
    ),
  );
  try {
    const scope = siteScopeFor(await getActiveTabUrl());
    if (!scope.supported) {
      showMessage(
        root,
        'Open a website first',
        'Conduit reads cookies for web pages (http or https). Open one and click Conduit again.',
      );
    } else if (!(await hasSiteAccess(scope.patterns))) {
      showNeedsAccess(root, scope.site, scope.patterns);
    } else {
      const cookies = sortCookies(await getSiteCookies(scope.site));
      if (cookies.length === 0) {
        showMessage(root, `No cookies for ${scope.site}`, 'The browser holds none for this site.');
      } else {
        showCookies(root, scope.site, cookies);
      }
    }
  } catch (error) {
    showError(root, error);
  }
  root.removeAttribute('aria-busy');
}

function showMessage(root: HTMLElement, title: string, detail: string): void {
  root.replaceChildren(
    h(
      'div',
      { class: 'popup-message' },
      h('strong', {}, title),
      h('span', { class: 'muted small' }, detail),
    ),
  );
}

function showError(root: HTMLElement, error: unknown): void {
  const detail = error instanceof Error ? error.message : 'Something went wrong.';
  root.replaceChildren(
    h(
      'div',
      { class: 'alert bad', attrs: { role: 'alert' } },
      icon('error'),
      h(
        'div',
        {},
        h('strong', {}, 'Could not read cookies'),
        h('span', { class: 'small' }, detail),
        h(
          'button',
          {
            class: 'btn sm popup-retry',
            attrs: { type: 'button' },
            on: { click: () => void mountCookiePanel(root) },
          },
          'Try again',
        ),
      ),
    ),
  );
}

function showNeedsAccess(root: HTMLElement, site: string, patterns: string[]): void {
  const status = h('p', { class: 'small muted', attrs: { role: 'status' } });
  const allow = h(
    'button',
    {
      class: 'btn primary block',
      attrs: { type: 'button' },
      on: {
        click: () => {
          requestSiteAccess(patterns).then(
            (granted) => {
              if (granted) void mountCookiePanel(root);
              else status.textContent = 'Access was not granted, so nothing was read.';
            },
            (error: unknown) => {
              status.textContent = error instanceof Error ? error.message : 'The request failed.';
            },
          );
        },
      },
    },
    `Allow access to ${site}`,
  );
  root.replaceChildren(
    h(
      'div',
      { class: 'alert' },
      icon('info'),
      h(
        'div',
        {},
        h('strong', {}, `Allow Conduit to read ${site} cookies?`),
        h(
          'span',
          { class: 'small' },
          'Conduit only reads sites you allow. Your browser will ask you to confirm.',
        ),
      ),
    ),
    h('div', { class: 'popup-actions-row' }, allow),
    status,
  );
}

function showCookies(root: HTMLElement, site: string, cookies: Cookie[]): void {
  const selected = new Set(cookies.map(cookieKey));
  let format: ExportFormat = 'netscape';

  const count = h('span', { class: 'small muted', attrs: { 'aria-live': 'polite' } });
  const selectAll = h('input', { attrs: { type: 'checkbox' } });
  const status = h('p', { class: 'small', attrs: { role: 'status' } });
  const copy = h('button', { class: 'btn primary', attrs: { type: 'button' } }, 'Copy');
  const download = h('button', { class: 'btn', attrs: { type: 'button' } }, 'Download');
  const formatButtons = new Map<ExportFormat, HTMLButtonElement>();
  const rowBoxes = new Map<string, HTMLInputElement>();

  const chosen = (): Cookie[] => cookies.filter((cookie) => selected.has(cookieKey(cookie)));

  function refresh(): void {
    count.textContent = `${String(selected.size)} of ${String(cookies.length)} selected`;
    selectAll.checked = selected.size === cookies.length;
    selectAll.indeterminate = selected.size > 0 && selected.size < cookies.length;
    copy.disabled = selected.size === 0;
    download.disabled = selected.size === 0;
    for (const [id, button] of formatButtons) {
      button.setAttribute('aria-pressed', String(id === format));
    }
  }

  function report(message: string, isError = false): void {
    status.textContent = message;
    status.className = isError ? 'small popup-error' : 'small';
  }

  function build(): { text: string; filename: string; mime: string } | undefined {
    try {
      return exportCookies(chosen(), format, site);
    } catch (error) {
      report(
        error instanceof CookieFormatError ? error.message : 'Could not build the export.',
        true,
      );
      return undefined;
    }
  }

  selectAll.addEventListener('change', () => {
    for (const cookie of cookies) {
      const key = cookieKey(cookie);
      if (selectAll.checked) selected.add(key);
      else selected.delete(key);
      const box = rowBoxes.get(key);
      if (box) box.checked = selectAll.checked;
    }
    refresh();
  });

  for (const { id, label } of FORMATS) {
    const button = h('button', { attrs: { type: 'button', 'aria-pressed': 'false' } }, label);
    button.addEventListener('click', () => {
      format = id;
      status.textContent = '';
      refresh();
    });
    formatButtons.set(id, button);
  }

  copy.addEventListener('click', () => {
    const file = build();
    if (!file) return;
    navigator.clipboard.writeText(file.text).then(
      () => {
        report(`Copied ${plural(selected.size, 'cookie')} as ${formatLabel(format)}.`);
      },
      () => {
        report('The browser did not allow copying. Use Download instead.', true);
      },
    );
  });

  download.addEventListener('click', () => {
    const file = build();
    if (!file) return;
    downloadText(file.filename, file.text, file.mime);
    report(`Saved ${file.filename}.`);
  });

  const rows = cookies.map((cookie) => cookieRow(cookie, selected, rowBoxes, refresh));

  root.replaceChildren(
    h(
      'p',
      { class: 'small muted popup-summary' },
      `${site} and its subdomains: ${plural(cookies.length, 'cookie')}`,
    ),
    h(
      'div',
      { class: 'popup-toolbar' },
      h('label', { class: 'check' }, selectAll, h('span', {}, 'Select all')),
      count,
    ),
    h(
      'ul',
      { class: 'list popup-cookies', attrs: { 'aria-label': `Cookies for ${site}` } },
      ...rows,
    ),
    h(
      'div',
      { class: 'popup-actions-row' },
      h(
        'div',
        { class: 'seg', attrs: { role: 'group', 'aria-label': 'Export format' } },
        ...formatButtons.values(),
      ),
    ),
    h('div', { class: 'popup-actions-row' }, copy, download),
    status,
  );
  refresh();
}

function formatLabel(format: ExportFormat): string {
  return FORMATS.find((entry) => entry.id === format)?.label ?? format;
}

function cookieRow(
  cookie: Cookie,
  selected: Set<string>,
  boxes: Map<string, HTMLInputElement>,
  refresh: () => void,
): HTMLLIElement {
  const key = cookieKey(cookie);
  const box = h('input', { attrs: { type: 'checkbox' } });
  box.checked = true;
  box.addEventListener('change', () => {
    if (box.checked) selected.add(key);
    else selected.delete(key);
    refresh();
  });
  boxes.set(key, box);

  let revealed = false;
  const value = h(
    'code',
    { class: 'popup-value' },
    cookie.value === '' ? '(empty)' : redact(cookie.value),
  );
  const reveal = h(
    'button',
    {
      class: 'btn ghost sm',
      attrs: {
        type: 'button',
        'aria-pressed': 'false',
        'aria-label': `Show value of ${cookie.name}`,
      },
    },
    'Show',
  );
  reveal.addEventListener('click', () => {
    revealed = !revealed;
    value.textContent =
      revealed || cookie.value === '' ? cookie.value || '(empty)' : redact(cookie.value);
    reveal.textContent = revealed ? 'Hide' : 'Show';
    reveal.setAttribute('aria-pressed', String(revealed));
    reveal.setAttribute('aria-label', `${revealed ? 'Hide' : 'Show'} value of ${cookie.name}`);
  });

  const flags = [
    cookie.httpOnly ? h('span', { class: 'badge plain' }, 'HttpOnly') : null,
    cookie.secure ? h('span', { class: 'badge plain' }, 'Secure') : null,
  ];

  return h(
    'li',
    { class: 'cookie-row' },
    h('label', { class: 'check cookie-name' }, box, h('span', {}, cookie.name)),
    reveal,
    value,
    h('span', { class: 'small muted cookie-meta' }, `${cookie.domain}${cookie.path}`, ...flags),
  );
}
