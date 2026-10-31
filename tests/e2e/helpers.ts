import type { BrowserContext, Page } from '@playwright/test';
import { expect } from './fixtures';

/** Opens a page on the test site, which makes the browser set (or change) its cookies. */
export async function visit(context: BrowserContext, url: string): Promise<void> {
  const page = await context.newPage();
  await page.goto(url);
  await page.close();
}

/** Fills in and approves a rule through the page, as a person would. */
export async function createRule(options: Page, site: string, names: string): Promise<void> {
  await options.getByRole('button', { name: 'New rule' }).click();
  await options.getByLabel('Site', { exact: true }).fill(site);
  await options.getByLabel('Cookie names').fill(names);
  await options.getByRole('button', { name: 'Review rule' }).click();
  await options.getByRole('button', { name: 'Approve and save' }).click();
  await expect(options.getByText('Rule saved and switched on.')).toBeVisible();
}

/** Types an app's address into the add form and presses Connect. */
export async function connectApp(
  options: Page,
  address: string,
  deliveryPath?: string,
): Promise<void> {
  await options.getByRole('button', { name: 'Add app' }).click();
  await options.getByLabel('Address of the app').fill(address);
  if (deliveryPath !== undefined) {
    await options.getByLabel('This app has its own delivery path').check();
    await options.getByLabel('Delivery path', { exact: true }).fill(deliveryPath);
  }
  await options.getByRole('button', { name: 'Connect' }).click();
}

/** Adds an app and approves the requests whose ids' sentences mention the given cookie names. */
export async function addAppApproving(
  options: Page,
  address: string,
  cookieNames: string[],
  deliveryPath?: string,
): Promise<void> {
  await connectApp(options, address, deliveryPath);
  for (const name of cookieNames) {
    await options.getByRole('checkbox', { name: new RegExp(`the cookie ${name} from`) }).check();
  }
  await options
    .getByRole('button', { name: /^(Add app and approve|Approve) \d+ requests?$/ })
    .click();
  await expect(options.getByText(/requests? approved\./)).toBeVisible();
}

export const logRows = (page: Page) =>
  page.getByRole('table', { name: 'Capture log' }).getByRole('row');

export const deliveryRows = (page: Page) =>
  page.getByRole('table', { name: 'Delivery log' }).getByRole('row');
