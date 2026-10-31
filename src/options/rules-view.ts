import { patternsForSite } from '../core/cookies/site';
import { describeRule } from '../core/rules/describe';
import { exportRules, importRules, RuleImportError } from '../core/rules/transfer';
import { ruleStatus, type Rule, type RuleStatus } from '../core/rules/types';
import { parseRuleDraft, type RuleDraft } from '../core/rules/validate';
import { requestSiteAccess } from '../platform/cookies';
import { requestCaptureNow } from '../platform/extension';
import { saveKillSwitch, saveRules, type StoredState } from '../platform/storage';
import { h, icon, renderKeepingFocus } from '../ui/dom';
import { downloadText } from '../ui/download';

const STATUS_BADGE: Record<RuleStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'badge ok' },
  paused: { label: 'Paused', className: 'badge warn' },
  disabled: { label: 'Off', className: 'badge plain' },
  'needs-approval': { label: 'Needs approval', className: 'badge warn' },
};

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export interface RulesView {
  render(state: StoredState): void;
}

/** The rules section: toolbar, new-rule form, kill-switch notice and the list of rules (US-004, US-005, US-007). */
export function mountRules(root: HTMLElement): RulesView {
  let current: StoredState = { rules: [], killSwitch: false, log: [] };
  const confirmingDelete = new Set<string>();
  let reviewing: string | undefined;

  const status = h('p', { class: 'small', attrs: { role: 'status' } });
  const formRegion = h('div');
  const noticeRegion = h('div');
  const listRegion = h('div');

  const newRule = h('button', { class: 'btn primary', attrs: { type: 'button' } }, 'New rule');
  const importButton = h('button', { class: 'btn', attrs: { type: 'button' } }, 'Import rules…');
  const exportButton = h('button', { class: 'btn', attrs: { type: 'button' } }, 'Export rules');
  const fileInput = h('input', {
    attrs: { type: 'file', accept: '.json,application/json', hidden: '' },
  });

  newRule.addEventListener('click', () => {
    showForm({ site: '', names: '' }, {});
  });
  importButton.addEventListener('click', () => {
    fileInput.click();
  });
  exportButton.addEventListener('click', () => {
    downloadText('conduit-rules.json', exportRules(current.rules), 'application/json');
    status.textContent = `Exported ${String(current.rules.length)} ${current.rules.length === 1 ? 'rule' : 'rules'}. The file does not include approvals.`;
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    void importFile(file);
  });

  async function importFile(file: File): Promise<void> {
    try {
      const imported = importRules(
        await file.text(),
        () => crypto.randomUUID(),
        () => new Date().toISOString(),
      );
      await saveRules([...current.rules, ...imported]);
      status.textContent = `Imported ${String(imported.length)} ${imported.length === 1 ? 'rule' : 'rules'}. They are switched off until you approve them.`;
    } catch (error) {
      status.textContent =
        error instanceof RuleImportError
          ? error.message
          : message(error, 'Could not import that file.');
    }
  }

  /** Asks the browser for access to the rule's site, then runs `save`. Returns an error message or undefined. */
  async function approve(site: string, save: () => Promise<void>): Promise<string | undefined> {
    try {
      const granted = await requestSiteAccess(patternsForSite(site));
      if (!granted)
        return 'Your browser did not allow access to that site, so nothing was changed.';
      await save();
      return undefined;
    } catch (error) {
      return message(error, 'Could not approve the rule.');
    }
  }

  function approvalPanel(options: {
    text: string;
    site: string;
    confirm: string;
    onApprove: () => Promise<void>;
    onBack: (() => void) | undefined;
    onCancel: () => void;
  }): HTMLElement {
    const problem = h('p', { class: 'field-error', attrs: { role: 'alert' } });
    const confirm = h(
      'button',
      { class: 'btn primary', attrs: { type: 'button' } },
      options.confirm,
    );
    const cancel = h('button', { class: 'btn ghost', attrs: { type: 'button' } }, 'Cancel');
    confirm.addEventListener('click', () => {
      confirm.disabled = true;
      problem.replaceChildren();
      void approve(options.site, options.onApprove).then((failure) => {
        if (failure === undefined) return;
        confirm.disabled = false;
        problem.replaceChildren(icon('error'), failure);
      });
    });
    cancel.addEventListener('click', options.onCancel);
    const back = options.onBack;
    return h(
      'div',
      { class: 'options-stack' },
      h(
        'div',
        { class: 'alert' },
        icon('info'),
        h(
          'div',
          {},
          h('strong', { attrs: { 'data-rule-sentence': '' } }, options.text),
          h(
            'span',
            { class: 'small' },
            `Your browser will ask whether Conduit may read ${options.site} cookies. Nothing is captured until you approve.`,
          ),
        ),
      ),
      problem,
      h(
        'div',
        { class: 'form-actions' },
        confirm,
        back
          ? h('button', { class: 'btn', attrs: { type: 'button' }, on: { click: back } }, 'Back')
          : null,
        cancel,
      ),
    );
  }

  function showForm(
    values: { site: string; names: string },
    errors: { site?: string; names?: string },
  ): void {
    const site = h('input', {
      class: 'input',
      attrs: {
        id: 'rule-site',
        type: 'text',
        autocomplete: 'off',
        spellcheck: 'false',
        placeholder: 'example.com',
        'aria-describedby': 'rule-site-hint rule-site-error',
      },
    });
    const names = h('input', {
      class: 'input',
      attrs: {
        id: 'rule-names',
        type: 'text',
        autocomplete: 'off',
        spellcheck: 'false',
        placeholder: 'sid, theme',
        'aria-describedby': 'rule-names-hint rule-names-error',
      },
    });
    site.value = values.site;
    names.value = values.names;
    const siteError = h('p', {
      class: 'field-error',
      attrs: { id: 'rule-site-error', role: 'alert' },
    });
    const namesError = h('p', {
      class: 'field-error',
      attrs: { id: 'rule-names-error', role: 'alert' },
    });
    for (const [input, holder, text] of [
      [site, siteError, errors.site],
      [names, namesError, errors.names],
    ] as const) {
      if (text) {
        holder.replaceChildren(icon('error'), text);
        input.setAttribute('aria-invalid', 'true');
      }
    }

    const form = h(
      'form',
      { class: 'card', attrs: { novalidate: '', 'aria-label': 'New rule' } },
      h(
        'div',
        { class: 'card-b options-stack' },
        h(
          'div',
          { class: 'field' },
          h('label', { class: 'label', attrs: { for: 'rule-site' } }, 'Site'),
          site,
          h(
            'span',
            { class: 'hint', attrs: { id: 'rule-site-hint' } },
            'For example example.com. Its subdomains are included.',
          ),
          siteError,
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { class: 'label', attrs: { for: 'rule-names' } }, 'Cookie names'),
          names,
          h(
            'span',
            { class: 'hint', attrs: { id: 'rule-names-hint' } },
            'Separate names with commas or spaces.',
          ),
          namesError,
        ),
        h(
          'div',
          { class: 'form-actions' },
          h('button', { class: 'btn primary', attrs: { type: 'submit' } }, 'Review rule'),
          h(
            'button',
            {
              class: 'btn ghost',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  formRegion.replaceChildren();
                },
              },
            },
            'Cancel',
          ),
        ),
      ),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const result = parseRuleDraft({ site: site.value, names: names.value });
      if (result.ok) showReview(result.draft);
      else showForm({ site: site.value, names: names.value }, result.errors);
    });
    formRegion.replaceChildren(form);
    (errors.names && !errors.site ? names : site).focus();
  }

  function showReview(draft: RuleDraft): void {
    const text = describeRule({ ...draft, destination: { kind: 'log' } });
    const panel = approvalPanel({
      text,
      site: draft.site,
      confirm: 'Approve and save',
      onApprove: async () => {
        const now = new Date().toISOString();
        const rule: Rule = {
          id: crypto.randomUUID(),
          kind: 'cookie',
          site: draft.site,
          names: draft.names,
          destination: { kind: 'log' },
          enabled: true,
          createdAt: now,
          approvedAt: now,
        };
        await saveRules([...current.rules, rule]);
        formRegion.replaceChildren();
        status.textContent = 'Rule saved and switched on.';
      },
      onBack: () => {
        showForm({ site: draft.site, names: draft.names.join(', ') }, {});
      },
      onCancel: () => {
        formRegion.replaceChildren();
      },
    });
    formRegion.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'card-b' }, panel)));
    panel.querySelector('button')?.focus();
  }

  function ruleItem(rule: Rule): HTMLLIElement {
    const state = ruleStatus(rule, current.killSwitch);
    const badge = STATUS_BADGE[state];
    const key = (part: string): Record<string, string> => ({
      'data-focus-key': `${rule.id}:${part}`,
    });

    const toggleBox = h('input', {
      attrs: { type: 'checkbox', role: 'switch', ...key('toggle') },
    });
    toggleBox.checked = rule.enabled;
    toggleBox.disabled = state === 'needs-approval';
    toggleBox.addEventListener('change', () => {
      const rules = current.rules.map((item) =>
        item.id === rule.id ? { ...item, enabled: toggleBox.checked } : item,
      );
      void saveRules(rules);
    });

    const actions = h(
      'div',
      { class: 'rule-actions' },
      h('label', { class: 'switch' }, toggleBox, h('span', {}, 'On')),
    );

    if (state === 'needs-approval') {
      actions.prepend(
        h(
          'button',
          {
            class: 'btn primary sm',
            attrs: { type: 'button', ...key('review') },
            on: {
              click: () => {
                reviewing = rule.id;
                renderList();
              },
            },
          },
          'Review and approve',
        ),
      );
    }
    if (state === 'active') {
      actions.append(
        h(
          'button',
          {
            class: 'btn sm',
            attrs: { type: 'button', ...key('capture') },
            on: {
              click: () => {
                status.textContent = 'Capturing…';
                void requestCaptureNow(rule.id).then(
                  (reply) => {
                    status.textContent = reply.ok
                      ? reply.captured === 0
                        ? 'Nothing new to capture: the values have not changed.'
                        : `Captured ${String(reply.captured)} new ${reply.captured === 1 ? 'value' : 'values'}.`
                      : reply.reason;
                  },
                  (error: unknown) => {
                    status.textContent = message(error, 'Capture failed.');
                  },
                );
              },
            },
          },
          'Capture now',
        ),
      );
    }

    if (confirmingDelete.has(rule.id)) {
      actions.append(
        h(
          'button',
          {
            class: 'btn danger sm',
            attrs: { type: 'button', ...key('confirm-delete') },
            on: {
              click: () => {
                confirmingDelete.delete(rule.id);
                void saveRules(current.rules.filter((item) => item.id !== rule.id)).then(() => {
                  status.textContent = 'Rule deleted.';
                });
              },
            },
          },
          'Confirm delete',
        ),
        h(
          'button',
          {
            class: 'btn ghost sm',
            attrs: { type: 'button', ...key('cancel-delete') },
            on: {
              click: () => {
                confirmingDelete.delete(rule.id);
                renderList();
              },
            },
          },
          'Keep rule',
        ),
      );
    } else {
      actions.append(
        h(
          'button',
          {
            class: 'btn ghost sm',
            attrs: { type: 'button', ...key('delete') },
            on: {
              click: () => {
                confirmingDelete.add(rule.id);
                renderList();
              },
            },
          },
          'Delete',
        ),
      );
    }

    const body = h(
      'div',
      { class: 'card-b' },
      h('p', { class: 'rule-text' }, describeRule(rule)),
      h(
        'div',
        { class: 'rule-meta' },
        h('span', { class: badge.className }, badge.label),
        h('span', { class: 'small muted' }, `Added ${dateFormat.format(new Date(rule.createdAt))}`),
      ),
    );
    if (reviewing === rule.id && state === 'needs-approval') {
      body.append(
        h(
          'div',
          { class: 'rule-actions' },
          approvalPanel({
            text: describeRule(rule),
            site: rule.site,
            confirm: 'Approve and switch on',
            onApprove: async () => {
              const now = new Date().toISOString();
              reviewing = undefined;
              await saveRules(
                current.rules.map((item) =>
                  item.id === rule.id ? { ...item, enabled: true, approvedAt: now } : item,
                ),
              );
              status.textContent = 'Rule approved and switched on.';
            },
            onBack: undefined,
            onCancel: () => {
              reviewing = undefined;
              renderList();
            },
          }),
        ),
      );
    } else {
      body.append(actions);
    }
    return h('li', { class: 'card', attrs: { 'data-rule-id': rule.id } }, body);
  }

  function renderList(): void {
    renderKeepingFocus(() => {
      noticeRegion.replaceChildren(
        ...(current.killSwitch && current.rules.length > 0
          ? [
              h(
                'div',
                { class: 'alert warn', attrs: { role: 'status' } },
                icon('alert'),
                h(
                  'div',
                  {},
                  h('strong', {}, 'Capture is paused'),
                  h('span', { class: 'small' }, 'No rule captures anything until you resume.'),
                  h(
                    'div',
                    { class: 'form-actions' },
                    h(
                      'button',
                      {
                        class: 'btn sm',
                        attrs: { type: 'button', 'data-focus-key': 'resume' },
                        on: {
                          click: () => {
                            void saveKillSwitch(false);
                          },
                        },
                      },
                      'Resume capture',
                    ),
                  ),
                ),
              ),
            ]
          : []),
      );
      exportButton.disabled = current.rules.length === 0;
      listRegion.replaceChildren(
        current.rules.length === 0
          ? h(
              'p',
              { class: 'options-empty' },
              'No rules yet. Conduit captures nothing until you create one and approve it.',
            )
          : h(
              'ul',
              { class: 'rule-list', attrs: { 'aria-label': 'Rules' } },
              ...current.rules.map(ruleItem),
            ),
      );
    });
  }

  root.replaceChildren(
    h('div', { class: 'options-toolbar' }, newRule, importButton, exportButton, fileInput),
    status,
    noticeRegion,
    formRegion,
    h('div', { class: 'options-stack' }, listRegion),
  );

  return {
    render(state) {
      current = state;
      renderList();
    },
  };
}
