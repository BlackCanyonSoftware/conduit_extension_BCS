import { mountCookiePanel } from './cookie-panel';
import { initInfoToggles } from './info-toggle';
import { syncThemeButton } from './theme-state';

syncThemeButton();
initInfoToggles();

const panel = document.getElementById('cookie-panel');
if (!panel) throw new Error('The popup page has no #cookie-panel element');
void mountCookiePanel(panel);
