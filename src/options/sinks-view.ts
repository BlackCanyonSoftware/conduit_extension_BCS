import { patternsForSite } from '../core/cookies/site';
import { describeRule } from '../core/rules/describe';
import type { Rule } from '../core/rules/types';
import { parseHandshake } from '../core/sinks/handshake';
import {
  matchesConfirmation,
  parseRoute,
  parseSinkUrl,
  permissionPatterns,
} from '../core/sinks/host';
import { sinkTarget, type Sink, type Want } from '../core/sinks/types';
import { requestSiteAccess } from '../platform/cookies';
import { requestDiscard, requestRetry } from '../platform/extension';
import { fetchHandshake, probeLoopback } from '../platform/sinks';
import { emptyState, saveRules, saveSinks, type StoredState } from '../platform/storage';
import { h, icon, renderKeepingFocus } from '../ui/dom';

type ParsedAddress = Extract<ReturnType<typeof parseSinkUrl>, { ok: true }>;

/** What the review screen shows: an app and what it asks for. */
interface Review {
  sink: Sink;
  isNew: boolean;
  wants: Want[];
}

const dateFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

function problemText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export interface SinksView {
  render(state: StoredState): void;
}

/** The "Local apps" section: add an app, review what it asks for, and manage it (US-008, US-010, US-011). */
export function mountSinks(root: HTMLElement): SinksView {
  let current = emptyState();
  const confirmingRemove = new Set<string>();

  const status = h('p', { class: 'small', attrs: { role: 'status' } });
  const formRegion = h('div');
  const attentionRegion = h('div');
  const listRegion = h('div');
  const addButton = h('button', { class: 'btn primary', attrs: { type: 'button' } }, 'Add app');
  const lookButton = h(
    'button',
    { class: 'btn', attrs: { type: 'button' } },
    'Look on this computer',
  );

  addButton.addEventListener('click', () => {
    showAddForm({ url: '', route: '' }, {});
  });
  lookButton.addEventListener('click', () => {
    void look();
  });

  const closeForm = (): void => {
    formRegion.replaceChildren();
  };

  /** The sentence for one request, exactly as the rule will read once approved. */
  function wantSentence(sink: Sink, want: Want): string {
    return describeRule(
      {
        site: want.site ?? '',
        names: want.names,
        destination: { kind: 'sink', sinkId: sink.id, wantId: want.id },
      },
      sink,
    );
  }

  // ---- adding an app ------------------------------------------------------------------

  function showAddForm(
    values: { url: string; route: string },
    errors: { url?: string; route?: string },
  ): void {
    const url = h('input', {
      class: 'input',
      attrs: {
        id: 'app-url',
        type: 'text',
        autocomplete: 'off',
        spellcheck: 'false',
        placeholder: 'http://127.0.0.1:8778',
        'aria-describedby': 'app-url-hint app-url-error',
      },
    });
    const route = h('input', {
      class: 'input',
      attrs: {
        id: 'app-route',
        type: 'text',
        autocomplete: 'off',
        spellcheck: 'false',
        placeholder: '/api/integrity',
        'aria-describedby': 'app-route-error',
      },
    });
    const hasRoute = h('input', { attrs: { type: 'checkbox', id: 'app-has-route' } });
    url.value = values.url;
    route.value = values.route;
    hasRoute.checked = values.route !== '';
    const routeField = h(
      'div',
      { class: 'field' },
      h('label', { class: 'label', attrs: { for: 'app-route' } }, 'Delivery path'),
      route,
      h('p', { class: 'field-error', attrs: { id: 'app-route-error', role: 'alert' } }),
    );
    routeField.hidden = !hasRoute.checked;
    hasRoute.addEventListener('change', () => {
      routeField.hidden = !hasRoute.checked;
    });
    const urlError = h('p', {
      class: 'field-error',
      attrs: { id: 'app-url-error', role: 'alert' },
    });
    const routeError = routeField.querySelector('#app-route-error');
    for (const [input, holder, text] of [
      [url, urlError, errors.url],
      [route, routeError, errors.route],
    ] as const) {
      if (text && holder) {
        holder.replaceChildren(icon('error'), text);
        input.setAttribute('aria-invalid', 'true');
      }
    }

    const form = h(
      'form',
      { class: 'card', attrs: { novalidate: '', 'aria-label': 'Add an app' } },
      h(
        'div',
        { class: 'card-b options-stack' },
        h(
          'div',
          { class: 'field' },
          h('label', { class: 'label', attrs: { for: 'app-url' } }, 'Address of the app'),
          url,
          h(
            'span',
            { class: 'hint', attrs: { id: 'app-url-hint' } },
            'For example http://127.0.0.1:8778. Apps on other computers must use https.',
          ),
          urlError,
        ),
        h(
          'label',
          { class: 'check' },
          hasRoute,
          h('span', {}, 'This app has its own delivery path'),
        ),
        routeField,
        h(
          'div',
          { class: 'form-actions' },
          h('button', { class: 'btn primary', attrs: { type: 'submit' } }, 'Connect'),
          h(
            'button',
            { class: 'btn ghost', attrs: { type: 'button' }, on: { click: closeForm } },
            'Cancel',
          ),
        ),
      ),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const address = parseSinkUrl(url.value);
      const path = hasRoute.checked
        ? parseRoute(route.value)
        : { ok: true as const, route: undefined };
      const next: { url?: string; route?: string } = {};
      if (!address.ok) next.url = address.error;
      if (!path.ok) next.route = path.error;
      if (!address.ok || !path.ok) {
        showAddForm({ url: url.value, route: hasRoute.checked ? route.value : '' }, next);
        return;
      }
      if (address.loopback) {
        void connect(address, path.route, undefined, (text) => {
          showAddForm({ url: url.value, route: route.value }, { url: text });
        });
      } else {
        showConfirmation(address, path.route);
      }
    });
    formRegion.replaceChildren(form);
    (errors.route && !errors.url ? route : url).focus();
  }

  /** Apps on other computers need the person to type the host name before anything is asked of them. */
  function showConfirmation(address: ParsedAddress, route: string | undefined): void {
    const typed = h('input', {
      class: 'input',
      attrs: {
        id: 'app-confirm',
        type: 'text',
        autocomplete: 'off',
        spellcheck: 'false',
        'aria-describedby': 'app-confirm-hint',
      },
    });
    const problem = h('p', { class: 'field-error', attrs: { role: 'alert' } });
    const proceed = h('button', { class: 'btn primary', attrs: { type: 'submit' } }, 'Continue');
    proceed.disabled = true;
    typed.addEventListener('input', () => {
      proceed.disabled = !matchesConfirmation(typed.value, address.host);
    });
    const form = h(
      'form',
      {
        class: 'card',
        attrs: { novalidate: '', 'aria-label': 'Confirm an app on another computer' },
      },
      h(
        'div',
        { class: 'card-b options-stack' },
        h(
          'div',
          { class: 'alert warn' },
          icon('alert'),
          h(
            'div',
            {},
            h('strong', {}, 'This app is not on this computer'),
            h(
              'span',
              { class: 'small' },
              `Conduit would send your session values across the network to ${address.label}. Continue only if you trust that app and the network between you.`,
            ),
          ),
        ),
        h(
          'div',
          { class: 'field' },
          h(
            'label',
            { class: 'label', attrs: { for: 'app-confirm' } },
            `Type ${address.host} to confirm`,
          ),
          typed,
          h(
            'span',
            { class: 'hint', attrs: { id: 'app-confirm-hint' } },
            'It stays marked as not on this computer.',
          ),
        ),
        problem,
        h(
          'div',
          { class: 'form-actions' },
          proceed,
          h(
            'button',
            {
              class: 'btn',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  showAddForm({ url: address.url, route: route ?? '' }, {});
                },
              },
            },
            'Back',
          ),
          h(
            'button',
            { class: 'btn ghost', attrs: { type: 'button' }, on: { click: closeForm } },
            'Cancel',
          ),
        ),
      ),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!matchesConfirmation(typed.value, address.host)) return;
      proceed.disabled = true;
      void connect(address, route, new Date().toISOString(), (text) => {
        proceed.disabled = false;
        problem.replaceChildren(icon('error'), text);
      });
    });
    formRegion.replaceChildren(form);
    typed.focus();
  }

  /** Asks the browser for access to the app, asks the app what it wants, then shows the review. */
  async function connect(
    address: ParsedAddress,
    route: string | undefined,
    confirmedAt: string | undefined,
    showProblem: (text: string) => void,
  ): Promise<void> {
    status.textContent = 'Asking the app what it wants…';
    try {
      if (!(await requestSiteAccess(permissionPatterns(address.url)))) {
        status.textContent = '';
        showProblem('Your browser did not allow access to the app, so nothing was changed.');
        return;
      }
      const handshake = parseHandshake(await fetchHandshake(address.url));
      if (!handshake.ok) {
        status.textContent = '';
        showProblem(handshake.error);
        return;
      }
      status.textContent = '';
      showReview({
        sink: {
          id: crypto.randomUUID(),
          name: handshake.name,
          url: address.url,
          loopback: address.loopback,
          addedAt: new Date().toISOString(),
          ...(confirmedAt === undefined ? {} : { confirmedAt }),
          ...(route === undefined ? {} : { route }),
        },
        isNew: true,
        wants: handshake.wants,
      });
    } catch (error) {
      status.textContent = '';
      showProblem(problemText(error, 'Could not reach the app.'));
    }
  }

  /** "Look on this computer": one permission prompt, then a look at the usual ports. */
  async function look(): Promise<void> {
    status.textContent = 'Looking for apps on this computer…';
    try {
      if (!(await requestSiteAccess(['http://127.0.0.1/*']))) {
        status.textContent = 'Your browser did not allow access, so nothing was looked for.';
        return;
      }
      const found = (await probeLoopback()).flatMap((result) => {
        const handshake = parseHandshake(result.answer);
        return handshake.ok && !current.sinks.some((sink) => sink.url === result.url)
          ? [{ url: result.url, name: handshake.name }]
          : [];
      });
      status.textContent = '';
      if (found.length === 0) {
        formRegion.replaceChildren(
          h(
            'p',
            { class: 'options-empty' },
            'No new apps found on the usual ports (8778 to 8787). Start your app, or enter its address.',
          ),
        );
        return;
      }
      formRegion.replaceChildren(
        h(
          'div',
          { class: 'card' },
          h(
            'ul',
            { class: 'rule-list card-b', attrs: { 'aria-label': 'Apps found on this computer' } },
            ...found.map((app) =>
              h(
                'li',
                { class: 'rule-actions' },
                h('span', {}, `${app.name} at ${app.url}`),
                h(
                  'button',
                  {
                    class: 'btn sm',
                    attrs: { type: 'button', 'aria-label': `Add ${app.name} at ${app.url}` },
                    on: {
                      click: () => {
                        const address = parseSinkUrl(app.url);
                        if (address.ok) {
                          void connect(address, undefined, undefined, (text) => {
                            status.textContent = text;
                          });
                        }
                      },
                    },
                  },
                  'Add',
                ),
              ),
            ),
          ),
        ),
      );
    } catch (error) {
      status.textContent = problemText(error, 'Could not look for apps.');
    }
  }

  // ---- reviewing what an app asks for ----------------------------------------------------

  function approvedWantIds(sink: Sink): Set<string> {
    return new Set(
      current.rules.flatMap((rule) =>
        rule.destination.kind === 'sink' && rule.destination.sinkId === sink.id
          ? [rule.destination.wantId]
          : [],
      ),
    );
  }

  function showReview(review: Review): void {
    const { sink, wants, isNew } = review;
    const already = approvedWantIds(sink);
    const boxes = new Map<string, HTMLInputElement>();
    const confirm = h('button', { class: 'btn primary', attrs: { type: 'button' } });
    const problem = h('p', { class: 'field-error', attrs: { role: 'alert' } });

    const chosen = (): Want[] =>
      wants.filter(
        (want) =>
          want.problem === undefined &&
          !already.has(want.id) &&
          boxes.get(want.id)?.checked === true,
      );
    const update = (): void => {
      const count = chosen().length;
      confirm.textContent = isNew
        ? count === 0
          ? 'Add app without approving anything'
          : `Add app and approve ${String(count)} ${count === 1 ? 'request' : 'requests'}`
        : `Approve ${String(count)} ${count === 1 ? 'request' : 'requests'}`;
      confirm.disabled = !isNew && count === 0;
    };

    const items = wants.map((want) => {
      const box = h('input', { attrs: { type: 'checkbox' } });
      const approved = already.has(want.id);
      box.checked = approved;
      box.disabled = approved || want.problem !== undefined;
      box.addEventListener('change', update);
      boxes.set(want.id, box);
      return h(
        'li',
        { class: 'want' },
        h(
          'label',
          { class: 'check' },
          box,
          h(
            'span',
            {},
            want.problem === undefined ? wantSentence(sink, want) : `Request ${want.id}`,
          ),
        ),
        approved ? h('span', { class: 'badge ok' }, 'Approved') : null,
        want.problem === undefined
          ? h(
              'p',
              { class: 'want-why small' },
              h('span', { class: 'muted' }, 'The app says: '),
              want.why,
            )
          : h('p', { class: 'field-error' }, icon('alert'), want.problem),
      );
    });

    confirm.addEventListener('click', () => {
      const approve = chosen();
      const patterns = [
        ...(isNew ? permissionPatterns(sink.url) : []),
        ...approve.flatMap((want) => patternsForSite(want.site ?? '')),
      ];
      confirm.disabled = true;
      problem.replaceChildren();
      void (async () => {
        try {
          if (patterns.length > 0 && !(await requestSiteAccess([...new Set(patterns)]))) {
            problem.replaceChildren(
              icon('error'),
              'Your browser did not allow access, so nothing was changed.',
            );
            confirm.disabled = false;
            return;
          }
          const now = new Date().toISOString();
          const rules: Rule[] = approve.map((want) => ({
            id: crypto.randomUUID(),
            kind: 'cookie',
            site: want.site ?? '',
            names: want.names,
            destination: { kind: 'sink', sinkId: sink.id, wantId: want.id },
            enabled: true,
            createdAt: now,
            approvedAt: now,
          }));
          await saveSinks(
            isNew
              ? [...current.sinks, sink]
              : current.sinks.map((item) => (item.id === sink.id ? sink : item)),
          );
          if (rules.length > 0) await saveRules([...current.rules, ...rules]);
          closeForm();
          status.textContent = `${isNew ? `Added ${sink.name}. ` : ''}${String(rules.length)} ${rules.length === 1 ? 'request' : 'requests'} approved.`;
        } catch (error) {
          problem.replaceChildren(icon('error'), problemText(error, 'Could not save.'));
          confirm.disabled = false;
        }
      })();
    });

    update();
    formRegion.replaceChildren(
      h(
        'div',
        { class: 'card' },
        h(
          'div',
          { class: 'card-b options-stack' },
          h('h3', { class: 'app-name' }, sink.name),
          h(
            'p',
            { class: 'small muted' },
            `${sinkTarget(sink)} `,
            h(
              'span',
              { class: sink.loopback ? 'badge ok' : 'badge warn' },
              sink.loopback ? 'On this computer' : 'Not on this computer',
            ),
          ),
          wants.length === 0
            ? h('p', { class: 'small' }, 'This app has not asked for anything yet.')
            : h(
                'p',
                { class: 'small' },
                'Choose which requests to approve. Each becomes a rule you can switch off at any time.',
              ),
          h(
            'ul',
            { class: 'want-list', attrs: { 'aria-label': `Requests from ${sink.name}` } },
            ...items,
          ),
          problem,
          h(
            'div',
            { class: 'form-actions' },
            confirm,
            h(
              'button',
              { class: 'btn ghost', attrs: { type: 'button' }, on: { click: closeForm } },
              'Cancel',
            ),
          ),
        ),
      ),
    );
    confirm.focus();
  }

  /** Asks an app again what it wants, so new requests can be reviewed. */
  async function refresh(sink: Sink): Promise<void> {
    status.textContent = `Asking ${sink.name} what it wants…`;
    try {
      if (!(await requestSiteAccess(permissionPatterns(sink.url)))) {
        status.textContent = 'Your browser did not allow access to the app.';
        return;
      }
      const handshake = parseHandshake(await fetchHandshake(sink.url));
      if (!handshake.ok) {
        status.textContent = handshake.error;
        return;
      }
      status.textContent = '';
      showReview({ sink: { ...sink, name: handshake.name }, isNew: false, wants: handshake.wants });
    } catch (error) {
      status.textContent = problemText(error, 'Could not reach the app.');
    }
  }

  // ---- the list, and deliveries that need attention ------------------------------------------------

  function drawAttention(): void {
    const failing = current.queue.filter((item) => item.lastError !== undefined);
    if (failing.length === 0) {
      attentionRegion.replaceChildren();
      return;
    }
    const lines = failing
      .slice(0, 3)
      .map((item) =>
        h(
          'li',
          {},
          item.ruleText,
          ' ',
          h(
            'span',
            { class: 'small' },
            `${item.lastError ?? ''} ${
              item.gaveUp || item.nextAttemptAt === undefined
                ? 'Conduit has stopped trying.'
                : `Trying again at ${dateFormat.format(new Date(item.nextAttemptAt))}.`
            }`,
          ),
        ),
      );
    attentionRegion.replaceChildren(
      h(
        'div',
        { class: 'alert bad', attrs: { role: 'alert' } },
        icon('error'),
        h(
          'div',
          {},
          h(
            'strong',
            {},
            `${String(failing.length)} ${failing.length === 1 ? 'delivery has' : 'deliveries have'} not gone through`,
          ),
          h('ul', { class: 'attention-list' }, ...lines),
          h(
            'div',
            { class: 'form-actions' },
            h(
              'button',
              {
                class: 'btn sm',
                attrs: { type: 'button', 'data-focus-key': 'retry' },
                on: {
                  click: () => {
                    void requestRetry().then((reply) => {
                      status.textContent = reply.ok
                        ? `Trying ${String(reply.count)} ${reply.count === 1 ? 'delivery' : 'deliveries'} again.`
                        : reply.reason;
                    });
                  },
                },
              },
              'Retry now',
            ),
            h(
              'button',
              {
                class: 'btn ghost sm',
                attrs: { type: 'button', 'data-focus-key': 'discard' },
                on: {
                  click: () => {
                    void requestDiscard().then((reply) => {
                      status.textContent = reply.ok
                        ? `Dropped ${String(reply.count)} ${reply.count === 1 ? 'delivery' : 'deliveries'}.`
                        : reply.reason;
                    });
                  },
                },
              },
              'Discard',
            ),
          ),
        ),
      ),
    );
  }

  function sinkItem(sink: Sink): HTMLLIElement {
    const ruleCount = current.rules.filter(
      (rule) => rule.destination.kind === 'sink' && rule.destination.sinkId === sink.id,
    ).length;
    const key = (part: string): Record<string, string> => ({
      'data-focus-key': `${sink.id}:${part}`,
    });
    const actions = h(
      'div',
      { class: 'rule-actions' },
      h(
        'button',
        {
          class: 'btn sm',
          attrs: {
            type: 'button',
            'aria-label': `Refresh requests from ${sink.name}`,
            ...key('refresh'),
          },
          on: {
            click: () => {
              void refresh(sink);
            },
          },
        },
        'Refresh requests',
      ),
    );
    if (confirmingRemove.has(sink.id)) {
      actions.append(
        h(
          'button',
          {
            class: 'btn danger sm',
            attrs: { type: 'button', ...key('confirm-remove') },
            on: {
              click: () => {
                confirmingRemove.delete(sink.id);
                void saveRules(
                  current.rules.filter(
                    (rule) =>
                      !(rule.destination.kind === 'sink' && rule.destination.sinkId === sink.id),
                  ),
                )
                  .then(() => saveSinks(current.sinks.filter((item) => item.id !== sink.id)))
                  .then(() => requestDiscard({ sinkId: sink.id }))
                  .then(() => {
                    status.textContent = `Removed ${sink.name}.`;
                  });
              },
            },
          },
          `Confirm remove${ruleCount > 0 ? ` (and ${String(ruleCount)} ${ruleCount === 1 ? 'rule' : 'rules'})` : ''}`,
        ),
        h(
          'button',
          {
            class: 'btn ghost sm',
            attrs: { type: 'button', ...key('keep') },
            on: {
              click: () => {
                confirmingRemove.delete(sink.id);
                drawList();
              },
            },
          },
          'Keep app',
        ),
      );
    } else {
      actions.append(
        h(
          'button',
          {
            class: 'btn ghost sm',
            attrs: { type: 'button', 'aria-label': `Remove ${sink.name}`, ...key('remove') },
            on: {
              click: () => {
                confirmingRemove.add(sink.id);
                drawList();
              },
            },
          },
          'Remove',
        ),
      );
    }
    return h(
      'li',
      { class: 'card', attrs: { 'data-sink-id': sink.id } },
      h(
        'div',
        { class: 'card-b' },
        h('h3', { class: 'app-name' }, sink.name),
        h(
          'div',
          { class: 'rule-meta' },
          h('span', {}, sinkTarget(sink)),
          h(
            'span',
            { class: sink.loopback ? 'badge ok' : 'badge warn' },
            sink.loopback ? 'On this computer' : 'Not on this computer',
          ),
          sink.route ? h('span', { class: 'small muted' }, `Delivers to ${sink.route}`) : null,
          h(
            'span',
            { class: 'small muted' },
            `${String(ruleCount)} ${ruleCount === 1 ? 'rule' : 'rules'}`,
          ),
        ),
        actions,
      ),
    );
  }

  function drawList(): void {
    renderKeepingFocus(() => {
      drawAttention();
      listRegion.replaceChildren(
        current.sinks.length === 0
          ? h(
              'p',
              { class: 'options-empty' },
              'No apps yet. Add one to send captured values to a program on your computer.',
            )
          : h(
              'ul',
              { class: 'rule-list', attrs: { 'aria-label': 'Apps' } },
              ...current.sinks.map(sinkItem),
            ),
      );
    });
  }

  root.replaceChildren(
    h('div', { class: 'options-toolbar' }, addButton, lookButton),
    status,
    formRegion,
    h('div', { class: 'options-stack' }, attentionRegion, listRegion),
  );

  return {
    render(state) {
      current = state;
      drawList();
    },
  };
}
