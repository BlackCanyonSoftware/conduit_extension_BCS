import { logToJson, type CaptureEntry } from '../core/capture';
import { redact } from '../core/redact';
import { saveLog, type StoredState } from '../platform/storage';
import { h, renderKeepingFocus } from '../ui/dom';
import { downloadText } from '../ui/download';

/** Rows shown on the page; the download has everything. */
const SHOWN = 50;

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

export interface LogView {
  render(state: StoredState): void;
}

/** The capture log: newest first, values hidden until shown, with download and clear (US-006). */
export function mountLog(root: HTMLElement): LogView {
  let entries: CaptureEntry[] = [];
  let confirmingClear = false;
  const revealed = new Set<string>();

  const status = h('p', { class: 'small', attrs: { role: 'status' } });
  const summary = h('p', { class: 'small muted' });
  const download = h('button', { class: 'btn', attrs: { type: 'button' } }, 'Download log');
  const clear = h('button', { class: 'btn', attrs: { type: 'button', 'data-focus-key': 'clear' } });
  const keep = h(
    'button',
    { class: 'btn ghost', attrs: { type: 'button', 'data-focus-key': 'keep' } },
    'Keep log',
  );
  const tableRegion = h('div');

  download.addEventListener('click', () => {
    downloadText('conduit-capture-log.json', logToJson(entries), 'application/json');
    status.textContent = 'Saved conduit-capture-log.json. It contains the captured values.';
  });
  clear.addEventListener('click', () => {
    if (!confirmingClear) {
      confirmingClear = true;
      draw();
      return;
    }
    confirmingClear = false;
    revealed.clear();
    void saveLog([]).then(() => {
      status.textContent = 'Log cleared.';
    });
  });
  keep.addEventListener('click', () => {
    confirmingClear = false;
    draw();
  });

  function row(entry: CaptureEntry): HTMLTableRowElement {
    const time = timeFormat.format(new Date(entry.at));
    const values = Object.entries(entry.data).map(([name, value]) => {
      const shown = revealed.has(`${entry.id}:${name}`);
      const text = h('code', {}, shown ? value : redact(value) || '(empty)');
      const toggle = h(
        'button',
        {
          class: 'btn ghost sm',
          attrs: {
            type: 'button',
            'aria-pressed': String(shown),
            'aria-label': `${shown ? 'Hide' : 'Show'} captured value of ${name} at ${time}`,
            'data-focus-key': `${entry.id}:${name}`,
          },
        },
        shown ? 'Hide' : 'Show',
      );
      toggle.addEventListener('click', () => {
        const key = `${entry.id}:${name}`;
        if (revealed.has(key)) revealed.delete(key);
        else revealed.add(key);
        draw();
      });
      return h('div', {}, h('strong', {}, `${name}: `), text, ' ', toggle);
    });
    return h(
      'tr',
      {},
      h('td', {}, time),
      h('td', {}, entry.ruleText),
      h('td', {}, ...values),
      h('td', {}, `${String(entry.bytes)} bytes`),
      h('td', {}, 'Conduit log'),
    );
  }

  function draw(): void {
    renderKeepingFocus(() => {
      download.disabled = entries.length === 0;
      clear.disabled = entries.length === 0;
      clear.textContent = confirmingClear ? 'Confirm clear log' : 'Clear log';
      keep.hidden = !confirmingClear;
      summary.textContent =
        entries.length === 0
          ? ''
          : `${String(entries.length)} ${entries.length === 1 ? 'entry' : 'entries'}${entries.length > SHOWN ? `, newest ${String(SHOWN)} shown` : ''}.`;
      const newest = entries.slice(-SHOWN).reverse();
      tableRegion.replaceChildren(
        newest.length === 0
          ? h('p', { class: 'options-empty' }, 'Nothing captured yet.')
          : h(
              'div',
              { class: 'log-table-wrap' },
              h(
                'table',
                { class: 'log-table' },
                h(
                  'thead',
                  {},
                  h(
                    'tr',
                    {},
                    ...['Time', 'Rule', 'Value', 'Size', 'Destination'].map((label) =>
                      h('th', { attrs: { scope: 'col' } }, label),
                    ),
                  ),
                ),
                h('tbody', {}, ...newest.map(row)),
              ),
            ),
      );
    });
  }

  root.replaceChildren(
    h('div', { class: 'options-toolbar' }, download, clear, keep),
    status,
    summary,
    tableRegion,
  );

  return {
    render(state) {
      entries = state.log;
      if (entries.length === 0) confirmingClear = false;
      draw();
    },
  };
}
