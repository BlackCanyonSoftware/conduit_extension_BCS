import { expect, test } from './fixtures';

// US-017: Conduit's own pages in Firefox: the rules page and the popup, driven the way a person
// uses them (click a button, fill a field by its label, read what the page says). They run in the
// Firefox installed on this computer, with no site access given beforehand.

const RULE_SENTENCE = "Save the cookie sid from localhost to Conduit's local log.";

test.describe('the rules page in Firefox', () => {
  test('opens with nothing captured and no rules', async ({ ui }) => {
    await ui.open('options/options.html');

    await ui.seen('Rules');
    await ui.seen('No rules yet. Conduit captures nothing until you create one and approve it.');
    await ui.seen('Nothing captured yet.');
    await ui.seen('Local apps');
  });

  test('the sun and moon button switches the theme and it stays after a reload', async ({ ui }) => {
    await ui.open('options/options.html');
    await ui.seen('Rules');
    const labelBefore = await ui.attributeOf('bk-theme', 'aria-label');

    await ui.clickId('bk-theme');
    const theme = await ui.htmlAttribute('data-theme');
    expect(['light', 'dark']).toContain(theme);
    const labelAfter = await ui.attributeOf('bk-theme', 'aria-label');
    expect(labelAfter).not.toBe(labelBefore);

    await ui.marionette.navigate(await ui.marionette.url());
    await ui.seen('Rules');
    expect(await ui.htmlAttribute('data-theme')).toBe(theme);
    expect(await ui.attributeOf('bk-theme', 'aria-label')).toBe(labelAfter);
  });

  test('shows a rule as one sentence, saves it once approved, and captures a cookie', async ({
    ui,
    site,
  }) => {
    const rules = await ui.open('options/options.html');
    await ui.click('New rule');
    await ui.fill('Site', 'localhost');
    await ui.fill('Cookie names', 'sid');
    await ui.click('Review rule');
    await ui.seen(RULE_SENTENCE);
    await ui.seen('No rules yet.');

    await ui.click('Approve and save');
    await ui.seen('Rule saved and switched on.');
    await ui.seen('Active');

    await ui.visit(`${site.url}?sid=firefox-ui-cookie-0001`);
    await ui.switchTo(rules);
    await ui.seen(RULE_SENTENCE);
    await ui.seen('Conduit log');
    await ui.notSeen('firefox-ui-cookie-0001');
    await ui.clickStartingWith('Show captured value of sid');
    await ui.seen('firefox-ui-cookie-0001');
  });

  test('explains what is wrong with a rule that has no site or names', async ({ ui }) => {
    await ui.open('options/options.html');
    await ui.click('New rule');
    await ui.click('Review rule');

    await ui.seen('Enter a site, for example example.com.');
    await ui.seen('Enter at least one cookie name.');
  });

  test('makes a response-header rule and records the header', async ({ ui, site }) => {
    const rules = await ui.open('options/options.html');
    await ui.click('New rule');
    await ui.choose('What to capture', 'Response headers (received by the browser)');
    await ui.fill('Site', 'localhost');
    await ui.fill('Header names', 'x-conduit-resp');
    await ui.click('Review rule');
    await ui.seen("Save the response header x-conduit-resp from localhost to Conduit's local log.");
    await ui.click('Approve and save');
    await ui.seen('Rule saved and switched on.');

    await ui.visit(`${site.url}?resp=firefox-ui-header-0001`);
    await ui.switchTo(rules);
    await ui.seen('Save the response header x-conduit-resp from localhost');
    await ui.clickStartingWith('Show captured value of x-conduit-resp');
    await ui.seen('firefox-ui-header-0001');
  });

  test('makes a page-storage rule that keeps one JSON field, and refuses a bad path', async ({
    ui,
    site,
  }) => {
    const rules = await ui.open('options/options.html');
    await ui.click('New rule');
    await ui.choose('What to capture', 'Page storage (localStorage)');
    await ui.fill('Site', 'localhost');
    await ui.fill('Storage keys', 'conduit-json');
    await ui.choose('Keep', 'Only one field of JSON');
    await ui.fill('Path', 'token');
    await ui.click('Review rule');
    await ui.seen('A path must start with $');

    await ui.fill('Path', '$.token');
    await ui.click('Review rule');
    await ui.seen(
      "Save the localStorage key conduit-json from localhost, keeping only the field $.token, to Conduit's local log.",
    );
    await ui.click('Approve and save');
    await ui.seen('Rule saved and switched on.');

    await ui.visit(`${site.url}?tok=firefox-ui-field-0001`);
    await ui.switchTo(rules);
    await ui.seen('keeping only the field $.token');
    await ui.clickStartingWith('Show captured value of conduit-json');
    await ui.seen('firefox-ui-field-0001');
    await ui.notSeen('visits');
  });

  test('connects an app, shows what it asks for, and delivers to it', async ({
    ui,
    site,
    testSink,
  }) => {
    const rules = await ui.open('options/options.html');
    await ui.click('Add app');
    await ui.fill('Address of the app', testSink.url);
    await ui.click('Connect');

    await ui.seen('Test App');
    await ui.seen('On this computer');
    await ui.seen('The test app wants the sid cookie to check delivery.');
    await ui.tick('the cookie sid from localhost');
    await ui.click('Add app and approve 1 request');
    await ui.seen('Added Test App. 1 request approved.');
    await ui.seen(
      `Send the cookie sid from localhost to 127.0.0.1:${String(testSink.port)} (Test App).`,
    );

    await ui.visit(`${site.url}?sid=firefox-ui-sent-0001`);
    await expect.poll(() => testSink.received.length, { timeout: 15_000 }).toBe(1);
    expect(testSink.received[0]).toMatchObject({
      status: 204,
      body: { data: { sid: 'firefox-ui-sent-0001' } },
    });
    await ui.switchTo(rules);
    await ui.seen('Delivered');
    await ui.notSeen('firefox-ui-sent-0001');
  });

  test('says when an app cannot be reached', async ({ ui }) => {
    await ui.open('options/options.html');
    await ui.click('Add app');
    await ui.fill('Address of the app', 'http://127.0.0.1:9');
    await ui.click('Connect');

    await ui.seen('Could not reach the app', 15_000);
  });
});

test.describe('the popup in Firefox', () => {
  test('asks for a website when it is not opened from one, and pauses capture', async ({
    ui,
    site,
  }) => {
    const rules = await ui.open('options/options.html');
    await ui.click('New rule');
    await ui.fill('Site', 'localhost');
    await ui.fill('Cookie names', 'sid');
    await ui.click('Review rule');
    await ui.click('Approve and save');
    await ui.seen('Rule saved and switched on.');

    await ui.open('popup/popup.html');
    await ui.seen('Cookies for this site');
    await ui.seen('Open a website first');
    await ui.seen('1 of 1 rule is capturing.');

    await ui.click('Pause all capture');
    await ui.seen('Capture is paused.');
    await ui.visit(`${site.url}?sid=firefox-ui-paused-0001`);
    await ui.switchTo(rules);
    await ui.seen('Capture is paused');
    await ui.notSeen('firefox-ui-paused-0001');

    await ui.click('Resume capture');
    await ui.seen('Active');
  });
});
