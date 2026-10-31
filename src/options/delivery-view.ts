import { deliveryLogToJson, type DeliveryEntry } from '../core/sinks/delivery';
import { saveDeliveries, type StoredState } from '../platform/storage';
import { h, renderKeepingFocus } from '../ui/dom';
import { downloadText } from '../ui/download';

/** Rows shown on the page; the download has everything. */
const SHOWN = 50;

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

const RESULT: Record<DeliveryEntry['result'], { label: string; className: string }> = {
  delivered: { label: 'Delivered', className: 'badge ok' },
  retrying: { label: 'Retrying', className: 'badge warn' },
  failed: { label: 'Failed', className: 'badge bad' },
};

export interface DeliveryView {
  render(state: StoredState): void;
}

/** The delivery log: when, which rule, which app, how big, and what happened. It holds no values (US-009). */
export function mountDeliveries(root: HTMLElement): DeliveryView {
  let entries: DeliveryEntry[] = [];
  let confirmingClear = false;

  const status = h('p', { class: 'small', attrs: { role: 'status' } });
  const summary = h('p', { class: 'small muted' });
  const download = h(
    'button',
    { class: 'btn', attrs: { type: 'button' } },
    'Download delivery log',
  );
  const clear = h('button', {
    class: 'btn',
    attrs: { type: 'button', 'data-focus-key': 'clear-deliveries' },
  });
  const keep = h(
    'button',
    { class: 'btn ghost', attrs: { type: 'button', 'data-focus-key': 'keep-deliveries' } },
    'Keep delivery log',
  );
  const tableRegion = h('div');

  download.addEventListener('click', () => {
    downloadText('conduit-delivery-log.json', deliveryLogToJson(entries), 'application/json');
    status.textContent = 'Saved conduit-delivery-log.json. It holds no captured values.';
  });
  clear.addEventListener('click', () => {
    if (!confirmingClear) {
      confirmingClear = true;
      draw();
      return;
    }
    confirmingClear = false;
    void saveDeliveries([]).then(() => {
      status.textContent = 'Delivery log cleared.';
    });
  });
  keep.addEventListener('click', () => {
    confirmingClear = false;
    draw();
  });

  function row(entry: DeliveryEntry): HTMLTableRowElement {
    const result = RESULT[entry.result];
    return h(
      'tr',
      {},
      h('td', {}, timeFormat.format(new Date(entry.at))),
      h('td', {}, entry.ruleText),
      h('td', {}, `${entry.sinkName} (${entry.target})`),
      h('td', {}, `${String(entry.bytes)} bytes`),
      h(
        'td',
        {},
        h('span', { class: result.className }, result.label),
        entry.detail ? h('div', { class: 'small' }, entry.detail) : null,
      ),
    );
  }

  function draw(): void {
    renderKeepingFocus(() => {
      download.disabled = entries.length === 0;
      clear.disabled = entries.length === 0;
      clear.textContent = confirmingClear ? 'Confirm clear delivery log' : 'Clear delivery log';
      keep.hidden = !confirmingClear;
      summary.textContent =
        entries.length === 0
          ? ''
          : `${String(entries.length)} ${entries.length === 1 ? 'entry' : 'entries'}${entries.length > SHOWN ? `, newest ${String(SHOWN)} shown` : ''}.`;
      const newest = entries.slice(-SHOWN).reverse();
      tableRegion.replaceChildren(
        newest.length === 0
          ? h('p', { class: 'options-empty' }, 'Nothing sent yet.')
          : h(
              'div',
              { class: 'log-table-wrap' },
              h(
                'table',
                { class: 'log-table', attrs: { 'aria-label': 'Delivery log' } },
                h(
                  'thead',
                  {},
                  h(
                    'tr',
                    {},
                    ...['Time', 'Rule', 'App', 'Size', 'Result'].map((label) =>
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
      entries = state.deliveries;
      if (entries.length === 0) confirmingClear = false;
      draw();
    },
  };
}
