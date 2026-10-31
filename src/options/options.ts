import { loadState, onStateChanged, type StateKey } from '../platform/storage';
import { initInfoToggles } from '../ui/info-toggle';
import { syncThemeButton } from '../ui/theme-state';
import { mountDeliveries } from './delivery-view';
import { mountLog } from './log-view';
import { mountRules } from './rules-view';
import { mountSinks } from './sinks-view';

function required(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`The options page has no #${id} element`);
  return element;
}

syncThemeButton();
initInfoToggles();

const rules = mountRules(required('rules-root'));
const sinks = mountSinks(required('apps-root'));
const deliveries = mountDeliveries(required('deliveries-root'));
const log = mountLog(required('log-root'));

async function refresh(changed?: StateKey[]): Promise<void> {
  const state = await loadState();
  const touched = (...keys: StateKey[]): boolean =>
    !changed || keys.some((key) => changed.includes(key));
  if (touched('rules', 'killSwitch', 'sinks')) rules.render(state);
  if (touched('rules', 'sinks', 'queue')) sinks.render(state);
  if (touched('deliveries')) deliveries.render(state);
  if (touched('log')) log.render(state);
}

onStateChanged((changed) => {
  void refresh(changed);
});
void refresh();
