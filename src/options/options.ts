import { loadState, onStateChanged, type StateKey } from '../platform/storage';
import { initInfoToggles } from '../ui/info-toggle';
import { syncThemeButton } from '../ui/theme-state';
import { mountLog } from './log-view';
import { mountRules } from './rules-view';

function required(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`The options page has no #${id} element`);
  return element;
}

syncThemeButton();
initInfoToggles();

const rules = mountRules(required('rules-root'));
const log = mountLog(required('log-root'));

async function refresh(changed?: StateKey[]): Promise<void> {
  const state = await loadState();
  if (!changed || changed.includes('rules') || changed.includes('killSwitch')) rules.render(state);
  if (!changed || changed.includes('log')) log.render(state);
}

onStateChanged((changed) => {
  void refresh(changed);
});
void refresh();
