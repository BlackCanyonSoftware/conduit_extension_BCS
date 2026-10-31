import { mountCookiePanel } from './cookie-panel';
import { mountRulesBar } from './rules-bar';
import { initInfoToggles } from '../ui/info-toggle';
import { syncThemeButton } from '../ui/theme-state';

syncThemeButton();
initInfoToggles();

const bar = document.getElementById('rules-bar');
if (!bar) throw new Error('The popup page has no #rules-bar element');
mountRulesBar(bar);

const panel = document.getElementById('cookie-panel');
if (!panel) throw new Error('The popup page has no #cookie-panel element');
void mountCookiePanel(panel);
