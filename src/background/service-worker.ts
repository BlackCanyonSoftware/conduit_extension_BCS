import {
  appendCapture,
  capturesFor,
  capturesForObserved,
  observedCookies,
  type Observed,
} from '../core/capture';
import { matchRuleHeaders, type HeaderObservation } from '../core/headers';
import { ruleStatus, type Rule } from '../core/rules/types';
import {
  afterFailure,
  appendDelivery,
  dueDeliveries,
  nextWake,
  planSinkDeliveriesFor,
  trimQueue,
  type DeliveryEntry,
  type PendingDelivery,
  type SeenDigests,
} from '../core/sinks/delivery';
import { sinkTarget, type Sink } from '../core/sinks/types';
import { onDeliveryWake, setDeliveryWake } from '../platform/alarms';
import { fromChromeCookie, getSiteCookies } from '../platform/cookies';
import { onHeaders } from '../platform/headers';
import { SinkError, postDelivery } from '../platform/sinks';
import {
  loadRulesAndSwitch,
  loadSeen,
  loadState,
  onStateChanged,
  saveDeliveries,
  saveLog,
  saveQueue,
  saveSeen,
  type StoredState,
} from '../platform/storage';
import { isWorkerRequest, type WorkerResponse } from './messages';

// The worker is stopped when idle and restarted for each event, so nothing is kept in
// memory between events: everything is read from and written to storage straight away,
// and retries are scheduled with an alarm, which outlives the worker.

let pending: Promise<unknown> = Promise.resolve();

/** Runs tasks one at a time, so two events in quick succession cannot overwrite each other's work. */
function inOrder<T>(task: () => Promise<T>): Promise<T> {
  const run = pending.then(task, task);
  pending = run.catch(() => undefined);
  return run;
}

function context(): { now: number; newId: () => string } {
  return { now: Date.now(), newId: () => crypto.randomUUID() };
}

function logContext(): { now: string; newId: () => string } {
  return { now: new Date().toISOString(), newId: () => crypto.randomUUID() };
}

/** The toolbar badge: OFF while paused, ! while a delivery has failed, otherwise empty. */
async function updateBadge(state: StoredState): Promise<void> {
  const failing = state.queue.some((item) => item.lastError !== undefined);
  await chrome.action.setBadgeText({ text: state.killSwitch ? 'OFF' : failing ? '!' : '' });
}

function refreshBadge(): void {
  void loadState().then(updateBadge);
}

function isCapturing(rule: Rule, killSwitch: boolean): boolean {
  return ruleStatus(rule, killSwitch) === 'active';
}

/** Keeps digests only for rules that still exist. */
function pruneSeen(seen: SeenDigests, rules: readonly Rule[]): SeenDigests {
  const ids = new Set(rules.map((rule) => rule.id));
  return Object.fromEntries(Object.entries(seen).filter(([id]) => ids.has(id)));
}

async function wakeAt(queue: readonly PendingDelivery[]): Promise<void> {
  const wake = nextWake(queue);
  await setDeliveryWake(wake === undefined ? undefined : Math.max(wake, Date.now() + 1000));
}

/** A full queue pushes out its oldest values; say so in the delivery log instead of losing them silently. */
async function recordDropped(
  state: StoredState,
  dropped: readonly PendingDelivery[],
): Promise<void> {
  let deliveries = (await loadState()).deliveries;
  for (const item of dropped) {
    const sink = state.sinks.find((candidate) => candidate.id === item.sinkId);
    if (!sink) continue;
    deliveries = appendDelivery(
      deliveries,
      entryFor(item, sink, 'failed', 'The waiting list was full, so this value was dropped.'),
    );
  }
  await saveDeliveries(deliveries);
}

/** Queues what the rules that send to an app want sent for these cookies, then tries to send. */
async function queueForSinks(
  state: StoredState,
  observe: (rule: Rule) => Observed[],
  options: { force: boolean; onlyRule?: string },
): Promise<number> {
  let seen = await loadSeen();
  const created: PendingDelivery[] = [];
  for (const rule of state.rules) {
    if (rule.destination.kind !== 'sink' || !isCapturing(rule, state.killSwitch)) continue;
    if (options.onlyRule !== undefined && rule.id !== options.onlyRule) continue;
    const observed = observe(rule);
    if (observed.length === 0) continue;
    const { sinkId } = rule.destination;
    const sink = state.sinks.find((candidate) => candidate.id === sinkId);
    if (!sink) continue;
    const plan = await planSinkDeliveriesFor(rule, sink, observed, seen, context(), {
      force: options.force,
    });
    created.push(...plan.pending);
    seen = plan.seen;
  }
  if (created.length > 0) {
    const { kept, dropped } = trimQueue([...state.queue, ...created]);
    await saveQueue(kept);
    await saveSeen(pruneSeen(seen, state.rules));
    if (dropped.length > 0) await recordDropped(state, dropped);
  }
  return created.length;
}

/** A cookie was set or changed: save it or send it for every active rule that names it. */
async function handleCookieChange(cookie: chrome.cookies.Cookie): Promise<void> {
  const state = await loadState();
  const changed = fromChromeCookie(cookie);

  let log = state.log;
  let logged = false;
  for (const rule of state.rules) {
    if (rule.destination.kind !== 'log' || !isCapturing(rule, state.killSwitch)) continue;
    const created = capturesFor(rule, [changed], log, logContext());
    if (created.length === 0) continue;
    log = appendCapture(log, created);
    logged = true;
  }
  if (logged) await saveLog(log);

  const queued = await queueForSinks(state, (rule) => observedCookies(rule, [changed]), {
    force: false,
  });
  if (queued > 0) await processDue();
}

// Header rules look at every request to a site the person has allowed, so the cheap part runs
// first: the rules are read from storage once and kept until they change.
let headerRules: Promise<Rule[]> | undefined;

function activeHeaderRules(): Promise<Rule[]> {
  headerRules ??= loadRulesAndSwitch().then(({ rules, killSwitch }) =>
    rules.filter((rule) => rule.kind === 'header' && isCapturing(rule, killSwitch)),
  );
  return headerRules;
}

/** Headers were sent or received: save or send the ones an active header rule names. */
async function handleHeaders(observation: HeaderObservation): Promise<void> {
  const rules = (await activeHeaderRules()).filter(
    (rule) => matchRuleHeaders(rule, observation).length > 0,
  );
  if (rules.length === 0) return;

  const state = await loadState();
  let log = state.log;
  let logged = false;
  for (const rule of rules) {
    const current = state.rules.find((candidate) => candidate.id === rule.id);
    if (current?.destination.kind !== 'log' || !isCapturing(current, state.killSwitch)) continue;
    const created = capturesForObserved(
      current,
      matchRuleHeaders(current, observation),
      log,
      logContext(),
    );
    if (created.length === 0) continue;
    log = appendCapture(log, created);
    logged = true;
  }
  if (logged) await saveLog(log);

  const queued = await queueForSinks(state, (rule) => matchRuleHeaders(rule, observation), {
    force: false,
  });
  if (queued > 0) await processDue();
}

/** The outcome of one try: the queue and delivery log after it. */
interface Attempt {
  queue: PendingDelivery[];
  deliveries: DeliveryEntry[];
}

function entryFor(
  item: PendingDelivery,
  sink: Sink,
  result: DeliveryEntry['result'],
  detail?: string,
): DeliveryEntry {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ruleId: item.ruleId,
    ruleText: item.ruleText,
    sinkName: sink.name,
    target: sinkTarget(sink),
    bytes: item.bytes,
    result,
    ...(detail === undefined ? {} : { detail }),
  };
}

async function tryOnce(item: PendingDelivery, sink: Sink, state: Attempt): Promise<Attempt> {
  try {
    await postDelivery(sink.url, sink.route, item);
    return {
      queue: state.queue.filter((candidate) => candidate.id !== item.id),
      deliveries: appendDelivery(state.deliveries, entryFor(item, sink, 'delivered')),
    };
  } catch (error) {
    const reason = error instanceof SinkError ? error.message : 'The delivery failed.';
    const updated = afterFailure(item, Date.now(), reason);
    const detail = updated.gaveUp ? `${reason} Conduit has stopped trying.` : reason;
    return {
      queue: state.queue.map((candidate) => (candidate.id === item.id ? updated : candidate)),
      deliveries: appendDelivery(
        state.deliveries,
        entryFor(updated, sink, updated.gaveUp ? 'failed' : 'retrying', detail),
      ),
    };
  }
}

/**
 * Sends every delivery that is due. While capture is paused nothing is sent and nothing is
 * dropped. A delivery whose rule has been switched off or deleted, or whose app has been
 * removed, is dropped instead of sent.
 */
async function processDue(): Promise<void> {
  const state = await loadState();
  if (state.killSwitch) return;
  let attempt: Attempt = { queue: state.queue, deliveries: state.deliveries };
  for (const item of dueDeliveries(state.queue, Date.now())) {
    const rule = state.rules.find((candidate) => candidate.id === item.ruleId);
    const sink = state.sinks.find((candidate) => candidate.id === item.sinkId);
    if (!rule || !sink || !isCapturing(rule, false)) {
      attempt = {
        ...attempt,
        queue: attempt.queue.filter((candidate) => candidate.id !== item.id),
      };
    } else {
      attempt = await tryOnce(item, sink, attempt);
    }
    await saveQueue(attempt.queue);
    await saveDeliveries(attempt.deliveries);
  }
  await wakeAt(attempt.queue);
}

/** "Capture now" for a log rule, "Send now" for a rule that sends to an app. */
async function captureNow(ruleId: string): Promise<WorkerResponse> {
  const state = await loadState();
  const rule = state.rules.find((candidate) => candidate.id === ruleId);
  if (!rule) return { ok: false, reason: 'That rule no longer exists.' };
  const status = ruleStatus(rule, state.killSwitch);
  if (status !== 'active') {
    return { ok: false, reason: `The rule is not capturing right now (${status}).` };
  }
  if (rule.kind === 'header') {
    return {
      ok: false,
      reason: 'A header rule captures while pages load, so there is nothing to run now.',
    };
  }
  const cookies = await getSiteCookies(rule.site);
  if (rule.destination.kind === 'sink') {
    const count = await queueForSinks(state, (item) => observedCookies(item, cookies), {
      force: true,
      onlyRule: rule.id,
    });
    if (count > 0) await processDue();
    return { ok: true, count };
  }
  const created = capturesFor(rule, cookies, state.log, logContext());
  if (created.length > 0) await saveLog(appendCapture(state.log, created));
  return { ok: true, count: created.length };
}

/** Make waiting or given-up deliveries due again, then try them. */
async function retryDeliveries(pendingId: string | undefined): Promise<WorkerResponse> {
  const state = await loadState();
  if (state.killSwitch) return { ok: false, reason: 'Capture is paused. Resume it to send.' };
  let count = 0;
  const queue = state.queue.map((item) => {
    if (pendingId !== undefined && item.id !== pendingId) return item;
    if (item.lastError === undefined) return item;
    count += 1;
    const reset: PendingDelivery = { ...item, attempts: 0, gaveUp: false };
    delete reset.nextAttemptAt;
    return reset;
  });
  if (count > 0) {
    await saveQueue(queue);
    await processDue();
  }
  return { ok: true, count };
}

/** Drop queued deliveries that match the filter; with no filter, every one that has failed. */
async function discardDeliveries(filter: {
  pendingId?: string;
  ruleId?: string;
  sinkId?: string;
}): Promise<WorkerResponse> {
  const state = await loadState();
  const { pendingId, ruleId, sinkId } = filter;
  const hasFilter = pendingId !== undefined || ruleId !== undefined || sinkId !== undefined;
  const drops = (item: PendingDelivery): boolean =>
    hasFilter
      ? item.id === pendingId || item.ruleId === ruleId || item.sinkId === sinkId
      : item.lastError !== undefined;
  const queue = state.queue.filter((item) => !drops(item));
  const count = state.queue.length - queue.length;
  if (count > 0) {
    await saveQueue(queue);
    await wakeAt(queue);
  }
  return { ok: true, count };
}

chrome.cookies.onChanged.addListener(({ cookie, removed }) => {
  if (removed) return;
  inOrder(() => handleCookieChange(cookie)).catch((error: unknown) => {
    console.error('Could not handle a cookie change', error);
  });
});

onHeaders((observation) => {
  inOrder(() => handleHeaders(observation)).catch((error: unknown) => {
    console.error('Could not handle headers', error);
  });
});

onDeliveryWake(() => {
  inOrder(processDue).catch((error: unknown) => {
    console.error('Could not process deliveries', error);
  });
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !isWorkerRequest(message)) return false;
  const run = (): Promise<WorkerResponse> => {
    switch (message.type) {
      case 'capture-now':
        return captureNow(message.ruleId);
      case 'retry-deliveries':
        return retryDeliveries(message.pendingId);
      case 'discard-deliveries':
        return discardDeliveries({
          ...(message.pendingId === undefined ? {} : { pendingId: message.pendingId }),
          ...(message.ruleId === undefined ? {} : { ruleId: message.ruleId }),
          ...(message.sinkId === undefined ? {} : { sinkId: message.sinkId }),
        });
    }
  };
  inOrder(run).then(sendResponse, (error: unknown) => {
    sendResponse({
      ok: false,
      reason: error instanceof Error ? error.message : 'That did not work.',
    } satisfies WorkerResponse);
  });
  return true;
});

onStateChanged((changed) => {
  if (changed.includes('rules') || changed.includes('killSwitch')) headerRules = undefined;
  if (changed.includes('killSwitch') || changed.includes('queue')) refreshBadge();
  if (changed.includes('killSwitch')) {
    // Resuming sends what is due; pausing needs nothing, because processDue checks the switch.
    inOrder(processDue).catch((error: unknown) => {
      console.error('Could not process deliveries', error);
    });
  }
});

function start(): void {
  refreshBadge();
  inOrder(processDue).catch((error: unknown) => {
    console.error('Could not process deliveries', error);
  });
}
chrome.runtime.onInstalled.addListener(start);
chrome.runtime.onStartup.addListener(start);
