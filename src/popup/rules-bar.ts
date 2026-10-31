import { ruleStatus } from '../core/rules/types';
import { openOptionsPage } from '../platform/extension';
import { loadState, onStateChanged, saveKillSwitch, type StoredState } from '../platform/storage';
import { h, icon } from '../ui/dom';

function summary(state: StoredState): string {
  if (state.rules.length === 0) return 'No rules yet, so nothing is being captured.';
  if (state.killSwitch) return 'Capture is paused.';
  const active = state.rules.filter((rule) => ruleStatus(rule, false) === 'active').length;
  if (active === 0) return 'No rule is capturing.';
  return `${String(active)} of ${String(state.rules.length)} ${state.rules.length === 1 ? 'rule is' : 'rules are'} capturing.`;
}

/** The strip above the cookie list: how many rules are capturing, the kill switch, and a link to the rules page (US-005). */
export function mountRulesBar(root: HTMLElement): void {
  let paused = false;
  const text = h('span', { class: 'small', attrs: { role: 'status' } });
  const toggle = h('button', { class: 'btn sm', attrs: { type: 'button' } });
  const manage = h(
    'button',
    {
      class: 'btn sm ghost',
      attrs: { type: 'button', 'aria-label': 'Manage rules', title: 'Manage rules' },
    },
    icon('settings'),
  );

  toggle.addEventListener('click', () => {
    void saveKillSwitch(!paused);
  });
  manage.addEventListener('click', () => {
    void openOptionsPage();
  });

  function render(state: StoredState): void {
    paused = state.killSwitch;
    text.textContent = summary(state);
    toggle.hidden = state.rules.length === 0;
    toggle.textContent = paused ? 'Resume capture' : 'Pause all capture';
  }

  root.replaceChildren(text, h('div', { class: 'rules-bar-actions' }, toggle, manage));
  const refresh = (): void => {
    void loadState().then(render);
  };
  refresh();
  onStateChanged(refresh);
}
