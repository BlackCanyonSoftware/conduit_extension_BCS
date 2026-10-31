import { patternsForSite } from '../core/cookies/site';
import { describeRule } from '../core/rules/describe';
import { exportRules, importRules, RuleImportError } from '../core/rules/transfer';
import { parseExtractorInput, type Extractor, type ExtractorChoice } from '../core/extract';
import {
  ruleStatus,
  type HeaderDirection,
  type Rule,
  type RuleStatus,
  type StorageArea,
} from '../core/rules/types';
import {
  parseHeaderRuleDraft,
  parseRuleDraft,
  parseStorageRuleDraft,
  type RuleDraft,
} from '../core/rules/validate';
import { requestSiteAccess } from '../platform/cookies';
import { requestCaptureNow, requestDiscard } from '../platform/extension';
import { saveKillSwitch, saveRules, type StoredState } from '../platform/storage';
import { h, icon, renderKeepingFocus } from '../ui/dom';
import { downloadText } from '../ui/download';

const STATUS_BADGE: Record<RuleStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'badge ok' },
  paused: { label: 'Paused', className: 'badge warn' },
  disabled: { label: 'Off', className: 'badge plain' },
  'needs-approval': { label: 'Needs approval', className: 'badge warn' },
};

/** What the new-rule form can capture: cookies, headers of requests or responses, or page storage. */
type CaptureChoice = 'cookie' | HeaderDirection | StorageArea;

const CAPTURE_LABELS: Record<CaptureChoice, string> = {
  cookie: 'Cookies',
  request: 'Request headers (sent by the browser)',
  response: 'Response headers (received by the browser)',
  local: 'Page storage (localStorage)',
  session: 'Page storage (sessionStorage)',
};

const NAMES_TEXT = {
  cookie: {
    label: 'Cookie names',
    hint: 'Separate names with commas or spaces.',
    example: 'sid, theme',
  },
  header: {
    label: 'Header names',
    hint: 'Separate names with commas or spaces. Only the headers you name are read.',
    example: 'authorization, x-api-key',
  },
  storage: {
    label: 'Storage keys',
    hint: 'Separate keys with commas or spaces. Keys are case sensitive. They are read when a page finishes loading, and when you press Capture now.',
    example: 'token, user',
  },
} as const;

const EXTRACT_LABELS: Record<ExtractorChoice, string> = {
  none: 'The whole value',
  regex: 'Only what a pattern matches',
  jsonpath: 'Only one field of JSON',
};

const EXTRACT_TEXT = {
  regex: {
    label: 'Pattern',
    hint: 'A regular expression, for example id=(\\d+). If it has a group in brackets, only the first group is kept.',
    example: 'id=(\\d+)',
  },
  jsonpath: {
    label: 'Path',
    hint: 'Where the field is, for example $.user.token or $.items[0].id.',
    example: '$.user.token',
  },
} as const;

interface FormValues {
  site: string;
  names: string;
  capture: CaptureChoice;
  extractType: ExtractorChoice;
  extractText: string;
}

interface FormErrors {
  site?: string;
  names?: string;
  extract?: string;
}

type DraftBase = RuleDraft &
  (
    | { kind: 'cookie' }
    | { kind: 'header'; direction: HeaderDirection }
    | { kind: 'storage'; area: StorageArea }
  );

type ReviewDraft = DraftBase & { extract?: Extractor };

type FormResult = { ok: true; draft: DraftBase } | { ok: false; errors: FormErrors };

/** Checks what was typed for the chosen kind of rule. */
function readForm(typed: FormValues): FormResult {
  const choice = typed.capture;
  if (choice === 'cookie') {
    const result = parseRuleDraft(typed);
    return result.ok ? { ok: true, draft: { ...result.draft, kind: 'cookie' } } : result;
  }
  if (choice === 'request' || choice === 'response') {
    const result = parseHeaderRuleDraft({ ...typed, direction: choice });
    return result.ok
      ? { ok: true, draft: { ...result.draft, kind: 'header', direction: choice } }
      : result;
  }
  const result = parseStorageRuleDraft({ ...typed, area: choice });
  return result.ok
    ? { ok: true, draft: { ...result.draft, kind: 'storage', area: choice } }
    : result;
}

/** The kind of rule a choice in the form makes. */
function kindOf(choice: CaptureChoice): 'cookie' | 'header' | 'storage' {
  if (choice === 'cookie') return 'cookie';
  return choice === 'request' || choice === 'response' ? 'header' : 'storage';
}

/** What the browser's access prompt is for, in the approval panel's words. */
function accessNoun(kind: Rule['kind']): 'cookies' | 'headers' | 'page storage' {
  if (kind === 'header') return 'headers';
  return kind === 'storage' ? 'page storage' : 'cookies';
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export interface RulesView {
  render(state: StoredState): void;
}

/** The rules section: toolbar, new-rule form, kill-switch notice and the list of rules (US-004, US-005, US-007). */
export function mountRules(root: HTMLElement): RulesView {
  let current: StoredState = {
    rules: [],
    killSwitch: false,
    log: [],
    sinks: [],
    queue: [],
    deliveries: [],
  };

  /** The rule as one sentence, naming the app it sends to. */
  const sentence = (rule: Rule): string =>
    describeRule(
      rule,
      rule.destination.kind === 'sink'
        ? current.sinks.find(
            (sink) => rule.destination.kind === 'sink' && sink.id === rule.destination.sinkId,
          )
        : undefined,
    );
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
    showForm({ site: '', names: '', capture: 'cookie', extractType: 'none', extractText: '' }, {});
  });
  importButton.addEventListener('click', () => {
    fileInput.click();
  });
  exportButton.addEventListener('click', () => {
    const { text, skipped } = exportRules(current.rules);
    const exported = current.rules.length - skipped;
    downloadText('conduit-rules.json', text, 'application/json');
    status.textContent =
      `Exported ${String(exported)} ${exported === 1 ? 'rule' : 'rules'}. The file does not include approvals.` +
      (skipped === 0
        ? ''
        : ` ${String(skipped)} ${skipped === 1 ? 'rule that sends' : 'rules that send'} to an app ${skipped === 1 ? 'was' : 'were'} left out: an app is set up from its own request.`);
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
    noun: 'cookies' | 'headers' | 'page storage';
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
            `Your browser will ask whether Conduit may read ${options.site} ${options.noun}. Nothing is captured until you approve.`,
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

  function showForm(values: FormValues, errors: FormErrors): void {
    const capture = h(
      'select',
      { class: 'input', attrs: { id: 'rule-capture' } },
      ...(Object.entries(CAPTURE_LABELS) as [CaptureChoice, string][]).map(([value, label]) =>
        h('option', { attrs: { value } }, label),
      ),
    );
    capture.value = values.capture;
    const namesLabel = h('label', { class: 'label', attrs: { for: 'rule-names' } });
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
    const namesHint = h('span', { class: 'hint', attrs: { id: 'rule-names-hint' } });
    const describeNames = (): void => {
      const text = NAMES_TEXT[kindOf(capture.value as CaptureChoice)];
      namesLabel.textContent = text.label;
      namesHint.textContent = text.hint;
      names.placeholder = text.example;
    };
    describeNames();
    capture.addEventListener('change', describeNames);

    const extractType = h(
      'select',
      { class: 'input', attrs: { id: 'rule-extract-type' } },
      ...(Object.entries(EXTRACT_LABELS) as [ExtractorChoice, string][]).map(([value, label]) =>
        h('option', { attrs: { value } }, label),
      ),
    );
    extractType.value = values.extractType;
    const extractText = h('input', {
      class: 'input',
      attrs: {
        id: 'rule-extract',
        type: 'text',
        autocomplete: 'off',
        spellcheck: 'false',
        'aria-describedby': 'rule-extract-hint rule-extract-error',
      },
    });
    extractText.value = values.extractText;
    const extractLabel = h('label', { class: 'label', attrs: { for: 'rule-extract' } });
    const extractHint = h('span', { class: 'hint', attrs: { id: 'rule-extract-hint' } });
    const extractError = h('p', {
      class: 'field-error',
      attrs: { id: 'rule-extract-error', role: 'alert' },
    });
    const extractField = h(
      'div',
      { class: 'field' },
      extractLabel,
      extractText,
      extractHint,
      extractError,
    );
    const describeExtract = (): void => {
      const choice = extractType.value as ExtractorChoice;
      extractField.hidden = choice === 'none';
      if (choice === 'none') return;
      const text = EXTRACT_TEXT[choice];
      extractLabel.textContent = text.label;
      extractHint.textContent = text.hint;
      extractText.placeholder = text.example;
    };
    describeExtract();
    extractType.addEventListener('change', describeExtract);
    if (errors.extract) {
      extractError.replaceChildren(icon('error'), errors.extract);
      extractText.setAttribute('aria-invalid', 'true');
    }
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
          h('label', { class: 'label', attrs: { for: 'rule-capture' } }, 'What to capture'),
          capture,
        ),
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
        h('div', { class: 'field' }, namesLabel, names, namesHint, namesError),
        h(
          'div',
          { class: 'field' },
          h('label', { class: 'label', attrs: { for: 'rule-extract-type' } }, 'Keep'),
          extractType,
        ),
        extractField,
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
      const choice = capture.value as CaptureChoice;
      const typed: FormValues = {
        site: site.value,
        names: names.value,
        capture: choice,
        extractType: extractType.value as ExtractorChoice,
        extractText: extractText.value,
      };
      const result = readForm(typed);
      const extract = parseExtractorInput(typed.extractType, typed.extractText);
      if (!result.ok || !extract.ok) {
        showForm(typed, {
          ...(result.ok ? {} : result.errors),
          ...(extract.ok ? {} : { extract: extract.error }),
        });
        return;
      }
      showReview({
        ...result.draft,
        ...(extract.extractor === undefined ? {} : { extract: extract.extractor }),
      });
    });
    formRegion.replaceChildren(form);
    const first = errors.site ? site : errors.names ? names : errors.extract ? extractText : site;
    first.focus();
  }

  function showReview(draft: ReviewDraft): void {
    const text = describeRule({ ...draft, destination: { kind: 'log' } });
    const panel = approvalPanel({
      text,
      site: draft.site,
      noun: accessNoun(draft.kind),
      confirm: 'Approve and save',
      onApprove: async () => {
        const now = new Date().toISOString();
        const rule: Rule = {
          id: crypto.randomUUID(),
          kind: draft.kind,
          ...(draft.kind === 'header' ? { direction: draft.direction } : {}),
          ...(draft.kind === 'storage' ? { area: draft.area } : {}),
          ...(draft.extract === undefined ? {} : { extract: draft.extract }),
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
        showForm(
          {
            site: draft.site,
            names: draft.names.join(', '),
            capture:
              draft.kind === 'header'
                ? draft.direction
                : draft.kind === 'storage'
                  ? draft.area
                  : 'cookie',
            extractType: draft.extract?.type ?? 'none',
            extractText:
              draft.extract === undefined
                ? ''
                : draft.extract.type === 'regex'
                  ? draft.extract.pattern
                  : draft.extract.path,
          },
          {},
        );
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
    if (state === 'active' && rule.kind !== 'header') {
      actions.append(
        h(
          'button',
          {
            class: 'btn sm',
            attrs: { type: 'button', ...key('capture') },
            on: {
              click: () => {
                status.textContent = 'Capturing…';
                const sends = rule.destination.kind === 'sink';
                void requestCaptureNow(rule.id).then(
                  (reply) => {
                    if (!reply.ok) {
                      status.textContent = reply.reason;
                    } else if (reply.count === 0) {
                      status.textContent = sends
                        ? 'Nothing to send: the rule found no matching values.'
                        : 'Nothing new to capture: the values have not changed.';
                    } else {
                      const noun = reply.count === 1 ? 'value' : 'values';
                      status.textContent = sends
                        ? `Sent ${String(reply.count)} ${noun}. See the delivery log for the result.`
                        : `Captured ${String(reply.count)} new ${noun}.`;
                    }
                  },
                  (error: unknown) => {
                    status.textContent = message(error, 'Capture failed.');
                  },
                );
              },
            },
          },
          rule.destination.kind === 'sink' ? 'Send now' : 'Capture now',
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
                void saveRules(current.rules.filter((item) => item.id !== rule.id))
                  .then(() => requestDiscard({ ruleId: rule.id }))
                  .then(() => {
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
      h('p', { class: 'rule-text' }, sentence(rule)),
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
            text: sentence(rule),
            site: rule.site,
            noun: accessNoun(rule.kind),
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
