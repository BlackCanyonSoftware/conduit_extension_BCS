import { appendCapture, capturesFor } from '../core/capture';
import { ruleStatus } from '../core/rules/types';
import { fromChromeCookie, getSiteCookies } from '../platform/cookies';
import { loadState, onStateChanged, saveLog } from '../platform/storage';
import { isCaptureNowRequest, type CaptureNowResponse } from './messages';

// The worker is stopped when idle and restarted for each event, so nothing is kept in
// memory between events: every capture is read from and written to storage straight away.

let pending: Promise<unknown> = Promise.resolve();

/** Runs tasks one at a time, so two events in quick succession cannot overwrite each other's log entries. */
function inOrder<T>(task: () => Promise<T>): Promise<T> {
  const run = pending.then(task, task);
  pending = run.catch(() => undefined);
  return run;
}

function context(): { now: string; newId: () => string } {
  return { now: new Date().toISOString(), newId: () => crypto.randomUUID() };
}

function updateBadge(killSwitch: boolean): Promise<void> {
  return chrome.action.setBadgeText({ text: killSwitch ? 'OFF' : '' });
}

/** A cookie was set or changed: save it for every active rule that names it. */
async function captureChange(cookie: chrome.cookies.Cookie): Promise<void> {
  const { rules, killSwitch, log } = await loadState();
  const changed = fromChromeCookie(cookie);
  let next = log;
  let added = false;
  for (const rule of rules) {
    if (ruleStatus(rule, killSwitch) !== 'active') continue;
    const created = capturesFor(rule, [changed], next, context());
    if (created.length === 0) continue;
    next = appendCapture(next, created);
    added = true;
  }
  if (added) await saveLog(next);
}

/** "Capture now": read the rule's cookies from the browser and save any that changed. */
async function captureNow(ruleId: string): Promise<CaptureNowResponse> {
  const { rules, killSwitch, log } = await loadState();
  const rule = rules.find((candidate) => candidate.id === ruleId);
  if (!rule) return { ok: false, reason: 'That rule no longer exists.' };
  const status = ruleStatus(rule, killSwitch);
  if (status !== 'active') {
    return { ok: false, reason: `The rule is not capturing right now (${status}).` };
  }
  const created = capturesFor(rule, await getSiteCookies(rule.site), log, context());
  if (created.length > 0) await saveLog(appendCapture(log, created));
  return { ok: true, captured: created.length };
}

chrome.cookies.onChanged.addListener(({ cookie, removed }) => {
  if (removed) return;
  inOrder(() => captureChange(cookie)).catch((error: unknown) => {
    console.error('Could not capture a cookie change', error);
  });
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !isCaptureNowRequest(message)) return false;
  inOrder(() => captureNow(message.ruleId)).then(sendResponse, (error: unknown) => {
    sendResponse({
      ok: false,
      reason: error instanceof Error ? error.message : 'Capture failed.',
    } satisfies CaptureNowResponse);
  });
  return true;
});

function refreshBadge(): void {
  void loadState().then(({ killSwitch }) => updateBadge(killSwitch));
}

onStateChanged((changed) => {
  if (changed.includes('killSwitch')) refreshBadge();
});
chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.runtime.onStartup.addListener(refreshBadge);
