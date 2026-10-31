const DELIVERY_ALARM = 'conduit-delivery';

/** Sets (or clears, when `when` is undefined) the one alarm that wakes the worker to retry deliveries. */
export async function setDeliveryWake(when: number | undefined): Promise<void> {
  if (when === undefined) {
    await chrome.alarms.clear(DELIVERY_ALARM);
    return;
  }
  await chrome.alarms.create(DELIVERY_ALARM, { when });
}

/** Calls `listener` when the delivery alarm goes off. Alarms survive the worker being stopped. */
export function onDeliveryWake(listener: () => void): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === DELIVERY_ALARM) listener();
  });
}
