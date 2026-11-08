# Checks that need a person in a visible browser

The automated tests run in headless Chromium and pre-grant `localhost` and `127.0.0.1`, because a
test cannot click the browser's own permission prompt. These are the things only a person can see.
Do them in Chrome, then Edge, after loading a release build (see the README's Install steps, or
`npm run build` and **Load unpacked** on the `dist` folder).

Mark anything that does not match what is written here as a bug.

## 1. A fresh install can read nothing

1. Open `chrome://extensions`, find **Conduit**, click **Details**.
2. Under **Site access** it should say the extension can read no sites (or "On click"), not "On all sites".
3. Click the Conduit toolbar icon on any website. The popup should say **Allow Conduit to read <site> cookies?** and list no cookies until you allow it.

## 2. Cookie export and the site prompt

1. Open a site you are signed in to, for example `https://github.com`.
2. Click the Conduit icon, then the button **Allow access to <site>** (for example **Allow access to github.com**).
3. Chrome shows its own prompt naming **github.com** (and its subdomains). Click **Allow**.
4. The popup lists the site's cookies, values hidden as `abcd…wxyz`. Tick two, click **cookies.txt**, then **Copy**, and paste into a text editor. HttpOnly cookies start with `#HttpOnly_`.

## 3. A shared suffix is its own site

1. Open a page like `https://<anyone>.github.io` (any GitHub Pages site).
2. Click the Conduit icon. The popup should say the site is `<anyone>.github.io`, not `github.io`.
3. The Chrome prompt after you allow it should name `<anyone>.github.io`, not `github.io`.

## 4. A rule, its prompt, and capture

1. Click the Conduit icon, then the gear button. The rules page opens in a tab.
2. Click **New rule**. Leave **What to capture** as **Cookies**. Site: the site from step 2. Cookie names: one cookie name from the list, for example `logged_in`.
3. Click **Review rule**. Read the sentence: "Save the cookie logged_in from github.com to Conduit's local log."
4. Click **Approve and save**. If Chrome asks for site access again, click **Allow**.
5. Sign out and in on the site (or wait for the cookie to change). A row appears under **Capture log**, value hidden until you click **Show**.

## 5. Headers and page storage

1. New rule, **What to capture**: **Response headers**. Site: the same site. Header names: `etag` (or `content-type`). **Review rule**, **Approve and save**. Reload a page on the site. A capture appears.
2. New rule, **What to capture**: **Page storage (localStorage)**. Site: the same site. Storage keys: a key you can see in DevTools under **Application** > **Local Storage** for that site. **Review rule**, **Approve and save**. Reload the page. A capture appears; **Capture now** on the rule works with the page open.
3. Edit nothing else. In a new rule set **Keep** to **Only one field of JSON** and Path `$.a` on a key you know is JSON, and check only that field is captured.

## 6. An app

1. In PowerShell, from the Conduit folder: `python examples/reference_sink.py --site github.com --names logged_in`
2. On the rules page, under **Local apps**, click **Look on this computer**. Chrome asks for access to `127.0.0.1`. Click **Allow**.
3. Click **Add** next to **Reference app**. Read its reason. Tick the request, click **Add app and approve 1 request**, **Allow** the next prompt.
4. Click **Send now** on the new rule. The PowerShell window prints a `received session ...` line; the **Delivery log** says **Delivered**.
5. Stop the example app (Ctrl+C), click **Send now** again. The page, the popup and the toolbar icon all show the failure (`!`). Start the app again and click **Retry now**.

## 7. The service worker waking

1. With a rule active and an app waiting for retries (step 6.5), go to `chrome://serviceworker-internals` (or `chrome://extensions` > Conduit > **Service worker**) and stop the Conduit worker.
2. Within a minute the automatic retry should still go out and the **Delivery log** should update.

## 8. Look and feel

1. Click the sun/moon button in the header. The theme switches and stays switched after reloading.
2. Resize the rules page to phone width. Nothing scrolls sideways except inside a table.
3. Tab through the rules page with the keyboard: every button and switch can be reached and shows a focus ring.

When you are done, tell the assistant what did not match, and note it under "Verification so far" in
`docs/HANDOFF.md`.

## 9. Firefox

Firefox 140 or newer. The automated Firefox tests cover capture, headers, page storage and delivery in
the background, but cannot open the popup or the rules page, so look at those yourself.

1. Download `conduit-<version>-firefox.zip` from the release (or run `node scripts/package-release.mjs --target firefox`).
2. Open `about:debugging`, click **This Firefox**, then **Load Temporary Add-on...**, and pick the zip.
3. Firefox shows the add-on's permissions. Click the puzzle-piece icon in the toolbar, pin **Conduit**, and click it. The popup opens and asks before it reads a site, like Chrome.
4. Repeat steps 2 to 8 above (site prompt, a rule, headers and page storage, an app, the look and feel). Where Chrome's prompt says "Allow", Firefox asks in its own words; the sentence in Conduit's rule is the same.
5. Pay attention to: the popup's size and scrolling, the rules page in light and dark, the sun/moon button, and that **Capture now** on a page-storage rule works with the page open.

The add-on is removed when Firefox restarts (temporary add-ons only), so repeat step 2 next time.
