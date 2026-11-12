# Manual checks

The automated tests run in a hidden browser that has been told in advance it may read `localhost`.
A test cannot click a real browser permission box, so these are the things only you can see: the
permission boxes, a real site, the real toolbar, and Firefox's own pages.

Conduit is **not in any extension store**, so you install it yourself from the folder on this
computer. Part A does that. After that, each check says where to click and what you should see.

If something does not match what is written, tell me which step and what you saw instead
(a screenshot helps).

---

## Part A. Get Conduit into your browser

You do this once per browser. Conduit stays installed until you remove it (Firefox: until you close it).

### A1. Build the extension folder (PowerShell)

1. Open the Start menu, type `PowerShell`, and press Enter.
2. In the PowerShell window, type this and press Enter:

   ```powershell
   cd C:\Users\Kpier\Documents\Conduit_extension_BCS
   ```

3. Type this and press Enter. It takes a few seconds and ends with a line starting `Built extension to`:

   ```powershell
   npm run build
   ```

   That makes the folder `C:\Users\Kpier\Documents\Conduit_extension_BCS\dist`. This is the folder you
   load into Chrome and Edge.

4. For Firefox, also run this. It makes `C:\Users\Kpier\Documents\Conduit_extension_BCS\dist-firefox`:

   ```powershell
   npm run build:firefox
   ```

Run the same commands again after any change to the code, then reload Conduit (A2 step 6).

Which folder goes where: **`dist` is for Chrome, Edge, Brave and every other Chrome-based browser. `dist-firefox` is for Firefox only.**

### A2. Chrome

1. Open Chrome. Click in the address bar at the top, type `chrome://extensions`, and press Enter.
2. At the top right of that page, switch **Developer mode** on (a toggle).
3. Three buttons appear at the top left. Click **Load unpacked**.
4. A folder picker opens. Go to `C:\Users\Kpier\Documents\Conduit_extension_BCS`, click the folder
   `dist` once so it is selected, and click **Select Folder**. (Pick the folder itself, not a file inside it.)
5. A card called **Conduit** appears on the page. It should say version **0.1.0** and have no red **Errors** button.
6. To pick up a rebuilt version later, click the circular arrow on Conduit's card.
   Chrome keeps an extension's old errors after a reload, so an **Errors** button from an earlier version stays on the card.
   To tell an old error from a new one: click **Errors**, click **Clear all** at the top right, press the arrow at the top left
   to go back, click the circular reload arrow on Conduit's card again, then open any website in another tab and come back.
   If the **Errors** button has not returned, there are no new errors.
7. To find Conduit's button: click the puzzle-piece icon at the top right of Chrome, next to the address bar.
   A list opens. Click the pin icon beside **Conduit** so its icon (a purple cube) stays in the toolbar.

### A3. Edge

1. Open Edge. In the address bar type `edge://extensions` and press Enter.
2. In the panel on the left, switch **Developer mode** on (a toggle near the bottom left).
3. Click **Load unpacked** (near the top right).
4. Pick `C:\Users\Kpier\Documents\Conduit_extension_BCS\dist` as in A2, step 4.
5. Edge may say the extension is not from the store; that is expected. Keep it on.
6. Click the puzzle-piece icon in Edge's toolbar and pin **Conduit**, as in A2, step 7.

### A3b. Brave, Opera, Vivaldi and other Chrome-based browsers

These work like Chrome and use the **same folder, `dist`**.

1. In the browser's address bar type its extensions address and press Enter: `brave://extensions` (Brave),
   `opera://extensions` (Opera), `vivaldi://extensions` (Vivaldi).
2. Switch **Developer mode** on, click **Load unpacked**, and pick `C:\Users\Kpier\Documents\Conduit_extension_BCS\dist`, exactly as in A2.
3. **Do not use `dist-firefox` in any of these.** That folder is for Firefox only. A Chrome-based browser shows the error
   `'background.scripts' requires manifest version of 2 or lower` and Conduit's background part never starts.
   If you see that error, click **Remove** on Conduit's card and load `dist` instead.

### A4. Firefox (version 140 or newer)

Firefox only keeps add-ons that Mozilla has signed, and Conduit's is not signed yet, so it loads for
this session only and disappears when you close Firefox.

1. Open Firefox. In the address bar type `about:debugging#/runtime/this-firefox` and press Enter.
2. Under **Temporary Extensions**, click **Load Temporary Add-on...**.
3. A file picker opens. Go to `C:\Users\Kpier\Documents\Conduit_extension_BCS\dist-firefox` and
   choose the file `manifest.json`, then click **Open**.
4. **Conduit** appears in the list with the version `0.1.0`.
5. To find its button, click the puzzle-piece icon at the top right of Firefox. If **Conduit** is listed,
   click the gear beside it and choose **Pin to Toolbar**.

### A5. What you also need

- A website you are signed in to. These steps use `https://github.com`. Any site you use works if you swap in its name.
- For check 6: the Python program (`python --version` in PowerShell should print a number).
- A PowerShell window for check 6. Its commands start with the `cd` line from A1, so any window works.

---

## Check 1. Conduit reads no website until you allow it

1. In your browser, go to `https://github.com` (sign in if it asks).
2. Click Conduit's purple cube in the toolbar. A small window opens.
3. **You should see:** the heading **Cookies for this site**, the text **Allow Conduit to read github.com cookies?**,
   and a button **Allow access to github.com**. No cookies are listed yet.
4. Close the window by clicking anywhere on the page.
5. Go to `chrome://extensions` (Edge: `edge://extensions`) and look at Conduit's card. **You should see no red Errors button.**
   (If you see one, click it and send me the text.)

Fails if: cookies are already listed before you clicked anything.

## Check 2. Allowing a site, and exporting its cookies

1. Still on `https://github.com`, click Conduit's cube again and click **Allow access to github.com**.
2. **You should see:** your browser's own confirmation box (not Conduit's) naming **github.com**. Click **Allow**
   (in Firefox it appears under the address bar as a small panel; click **Allow**).
3. **You should see:** the popup now lists the site's cookies, each with a hidden value like `abcd…wxyz` and a **Show** button.
   Some have a small **HttpOnly** or **Secure** tag. A line above them says `github.com and its subdomains: N cookies`.
4. Tick two cookies (the checkboxes on the left). Under **Export format** click **cookies.txt**, then click **Copy**.
   **You should see:** `Copied 2 cookies as cookies.txt.`
5. Open Notepad (Start menu, type `Notepad`, Enter) and paste with Ctrl+V.
   **You should see:** lines that look like `.github.com  TRUE  /  ...`. A cookie marked HttpOnly starts with `#HttpOnly_`.
6. Back in the popup click **Download**. **You should see:** `Saved cookies-github.com.txt.` and that file in your Downloads folder.

## Check 3. A shared domain is its own site

1. In your browser go to `https://octocat.github.io/` (a page may say 404; that is fine, any page works).
2. Click Conduit's cube.
3. **You should see:** **Allow Conduit to read octocat.github.io cookies?** and **Allow access to octocat.github.io**.
   It must say `octocat.github.io`, **not** `github.io`.
4. Click **Allow access to octocat.github.io**. The browser's confirmation box should also name `octocat.github.io`.
   You can click **Allow** or **Block**; either is fine for this check.

## Check 4. A rule, its confirmation box, and a capture

You need the cookie's name. Find one:

1. On the `https://github.com` tab press **F12**. Developer tools open.
2. Click the **Application** tab (if you do not see it, click the `>>` at the right of the tab row).
   (Firefox: the tab is called **Storage**.)
3. In the left list open **Cookies** and click `https://github.com`. The **Name** column lists the cookies.
   `logged_in` is there when you are signed in. Close developer tools with **F12**.

Now make the rule:

1. Click Conduit's cube, then click the small gear button in the popup (hover text: **Manage rules**).
   A new tab opens with the page titled **Rules**.
2. Click **New rule**. A form opens.
3. **What to capture:** leave it on **Cookies**.
4. **Site:** type `github.com`
5. **Cookie names:** type `logged_in`
6. Click **Review rule**. **You should see** this exact sentence:
   `Save the cookie logged_in from github.com to Conduit's local log.`
7. Click **Approve and save**. If your browser shows a confirmation box about github.com, click **Allow**.
   **You should see:** `Rule saved and switched on.` and the rule in the list with a green **Active** tag.
8. Click **Capture now** on the rule. **You should see:** `Captured 1 new value.`
9. Scroll to **Capture log** at the bottom. **You should see:** a row with the rule's sentence and a hidden value. A short value
   shows as dots (`••••••••`); a long one shows its first and last four characters with `…` between. Click **Show** in that row to
   reveal the value; **Hide** hides it again.
10. Click **Capture now** again. **You should see:** `Nothing new to capture: the values have not changed.`

## Check 5. Headers and page storage

Keep the `https://github.com` tab open in this window. Do these on the **Rules** tab.

**A response header**

1. Click **New rule**. **What to capture:** choose **Response headers (received by the browser)**.
2. **Site:** `github.com`. **Header names:** `content-type`. Click **Review rule**.
   **You should see:** `Save the response header content-type from github.com to Conduit's local log.`
3. Click **Approve and save** (allow if asked).
4. Switch to the `https://github.com` tab and press F5 to reload it.
5. Switch back to the **Rules** tab. In **Capture log** there should be new rows for the header, with values like
   `text/html; charset=utf-8` (click **Show** to read one). You will probably see several rows: every file the page loads
   (the page, its stylesheets, its scripts) has its own `content-type`, and Conduit records each time the value changes.

**A localStorage value**

1. On the `https://github.com` tab press F12, click **Application** (Firefox: **Storage**), open **Local Storage**,
   click `https://github.com`. Pick any **Key** in the list and note it exactly (it is case sensitive). Close developer tools.
   If the list is empty, skip to the end of this check.
2. On the **Rules** tab click **New rule**. **What to capture:** **Page storage (localStorage)**. **Site:** `github.com`.
   **Storage keys:** the key you noted. Click **Review rule**, then **Approve and save**.
3. Click **Capture now** on that rule (keep the github.com tab open). **You should see:** `Captured 1 new value.`

**Keeping only part of a value (optional)**

1. If one of the keys holds JSON (text starting with `{`), make another rule for it and set **Keep** to
   **Only one field of JSON**. In the **Path** box type `$.` followed by a field name that is in the JSON, for example `$.id`.
2. After **Capture now**, the log should hold only that field's value.

## Check 6. An app that receives values

1. In PowerShell type these two lines, pressing Enter after each. The second stays running; leave the window open.

   ```powershell
   cd C:\Users\Kpier\Documents\Conduit_extension_BCS
   python examples/reference_sink.py --site github.com --names logged_in
   ```

   **You should see:** `listening on http://127.0.0.1:` followed by a number from 8778 to 8787. **Write that number down; it is `PORT` below.**
   If other programs on your computer already use 8778 and 8779 (Docker does on some machines), the app prints a line
   `port 8778 is not free ... another program is using it.` for each one it skips and uses the next free port, for example 8780.
   That is expected.

2. On the **Rules** tab, scroll to **Local apps**. Click **Look on this computer**.
3. The browser shows a confirmation box about `127.0.0.1`. Click **Allow**.
4. **You should see:** `Reference app at http://127.0.0.1:PORT` (your number) with an **Add** button. Click **Add**.
5. **You should see:** a box headed **Reference app**, marked **On this computer**, with a tick-box whose text is
   `Send the cookie logged_in from github.com to 127.0.0.1:PORT (Reference app).`
   Under it: `The app says: This example app shows what it receives, so you can see how Conduit works.`
6. Tick the box. Click **Add app and approve 1 request**. Click **Allow** in the next confirmation box.
   **You should see:** `Added Reference app. 1 request approved.`
7. In **Rules**, find the new rule (it starts `Send the cookie logged_in…`). Click **Send now**.
   **You should see:** `Sent 1 value. See the delivery log for the result.`
8. Look at the PowerShell window. **You should see:** a line like `received session from https://github.com: logged_in (NN bytes)`,
   where NN is some number. It prints the cookie's name and the size, never the value itself.
9. On the Rules tab, **Delivery log**: a row with **Delivered**. The value is not shown there.

**When the app is down**

10. In PowerShell press **Ctrl+C** to stop the app.
11. On the Rules tab click **Send now** again.
12. **You should see all of these:** a red box on the Rules tab, `1 delivery has not gone through`, with **Retry now** and **Discard**;
    the toolbar icon with a small `!` on it; and in the popup the line `... A delivery has not gone through.`
13. In PowerShell press the Up arrow, then Enter, to start the app again. Click **Retry now** on the Rules tab.
    **You should see:** the red box goes away, the PowerShell window prints a `received` line, and the Delivery log shows **Delivered**.
14. Stop the app again with Ctrl+C when you are done.

## Check 7. Pausing everything

1. Click Conduit's cube, then **Pause all capture**.
2. **You should see:** the toolbar icon shows `OFF`, the popup says `Capture is paused.`, and the Rules tab shows
   **Capture is paused** with a **Resume capture** button.
3. Click **Resume capture** (in the popup or on the Rules tab). The `OFF` goes away.

## Check 8. The background part waking up again (Chrome and Edge)

Conduit's background part is stopped by the browser when idle and started again when needed. This checks a
waiting retry survives that.

1. Make sure the app is stopped (it is, if you pressed Ctrl+C at the end of check 6).
2. On the Rules tab click **Send now**. It fails (the red `1 delivery has not gone through` box appears) and Conduit will retry
   by itself in 30 seconds.
3. Start the app again in PowerShell right away: press the Up arrow until you see the `python examples/reference_sink.py ...` line, then add ` --port PORT` (your number from check 6) to the end and press Enter, so it comes back on the same port Conduit has saved.
4. Within the 30 seconds, open a new tab and go to `chrome://serviceworker-internals` (Edge: `edge://serviceworker-internals`).
   Find the entry whose **Scope** is `chrome-extension://` followed by Conduit's ID, and click **Stop** beside it.
   Conduit's ID is on its card at `chrome://extensions` (Developer mode on), under the name, as `ID: ...`.
   If that page does not look like this, skip this check and tell me what you saw.
5. Wait one minute. **You should see:** the Delivery log shows **Delivered** for the retry, and the PowerShell window printed a `received` line.

(Firefox handles its background page differently and the automated Firefox tests already cover this.)

## Check 9. Look and feel

1. In the toolbar popup or at the top right of the Rules tab, click the round button with a sun or a moon on it.
   The colours switch between light and dark. Reload the page: your choice stays.
2. On the Rules tab, drag the window narrower until it is about phone width. **You should see:** text wrapping; nothing sideways except
   inside the log tables.
3. On the Rules tab press Tab repeatedly. **You should see:** a visible outline moving across each button and switch, in order.

---

## Firefox: what to repeat

After A4, run checks 1 to 7 and 9 in Firefox. Differences: its confirmation boxes look different (a panel under the
address bar), developer tools say **Storage** instead of **Application**, and check 8 is skipped. Pay attention to the popup's size and
scrolling, and the Rules page in light and dark.

## What to tell me

For each check: pass, or the step number and what you saw. I will fix what fails and record the results under
"Verification so far" in `docs/HANDOFF.md`.
