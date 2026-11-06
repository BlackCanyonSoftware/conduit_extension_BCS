# Design

## Audience and tone

Developers and power users who want to see exactly what a tool is doing. The
interface is calm, plain and precise: short labels, no marketing language, and
one sentence per rule that says what will be shared, from where and to whom.

## Visual direction

Conduit uses the **Conduit** brand from the Black Canyon Software brand kit: its
generated theme, fonts, icons and component styles, bundled into
`src/theme/` with `brandkit bundle`. No colours or type are defined outside it.

Key facts about the brand (the full reference is `src/theme/BRAND.md`):

- **Design standard:** **IBM Carbon**, and nothing else (brandkit 1.56.1, from the design-standards rollout, kit 1.56.0). Conduit is a public product, so it never takes Apple's patterns. Carbon means square corners, depth by background tone (`.card` layers, no resting shadows), 40 px controls, filled fields with a bottom rule, the productive type scale in regular weight, and an inline notification as a tint with a 3 px stripe. The rules are in `src/theme/BRAND.md` (_The design standard_) and the library's `docs/standards/carbon.md`; the regenerated `tokens.css`, `components.css` and `layout.css` supply them, and our own CSS uses those tokens and classes rather than retyping a radius, size, weight or shadow.
- **Type:** named in Sora, read in Public Sans, loaded through `template/fonts.css` (`--font-display` is Sora, `--font` is Public Sans); never named in our own CSS. Carbon was drawn around IBM Plex Sans; reading in Public Sans is allowed by the brand.
- **Colour:** a violet brand colour (`#a450b6`) with a cool-blue second hue, light and dark palettes, all measured for contrast. Colours are tokens (`var(--accent)`, `var(--card)` and so on); no hex values in our code.
- **Sheets, in order:** `theme/theme.css`, then `template/` `tokens.css`, `fonts.css`, `base.css`, `components.css`, `layout.css`; our own `popup.css` last and for layout only.
- **Icons:** the brand sprite, `theme/ui/icons.svg` (for example `#i-info`, `#i-sun`, `#i-moon`), drawn on the `.icon` class.
- **Refreshing:** the bundle is generated. Re-run `brandkit bundle conduit src/theme` (and `--set readme` into `docs/brand`) when the brand changes; never edit those files by hand. `brandkit check` reports drift. `src/theme/` and `docs/brand/` are excluded from Prettier and ESLint for that reason.

Carbon in our own pages: boxes are the brand's `.card` (the popup's cookie list and rules bar, the log tables inside `.table-wrap`), tables use the brand's `table` rules, the (i) panel is a Carbon inline notification (`.info-panel`: tint plus a 3 px stripe), field errors are 12 px helper text, and nothing of ours sets a font weight. Only layout widths are ours (the 380 px popup, the 820 px rules page). The three contrast overrides in `src/ui/shared.css` are kept (see the roadmap's tech debt).

Known quirk: the brand's `theme-switch.js` only updates the toggle's label and `aria-pressed` after a click, so `src/popup/theme-state.ts` aligns them on load.

## Project conventions

- **Light/dark toggle** on every screen, using a sun/moon icon; the choice is remembered (US-015).
- **Info (i) buttons** hide explanatory text so screens stay uncluttered; the text opens on demand and is reachable by keyboard (US-016).
- Tokens come from the brand template; spacing on a 4/8 px scale; touch targets at least 24 px, aiming for 44.

## Screens

| Screen         | Purpose                                                   |
| -------------- | --------------------------------------------------------- |
| Popup: Cookies | Site cookie list, selection, format picker, copy/download |
| Popup: Status  | Kill switch, active rules count, last deliveries          |
| Options: Rules | Create, approve, disable, import/export rules             |
| Options: Sinks | Add sinks, see what each asks for, loopback marker        |
| Options: Log   | Delivery and capture log, download                        |

## States

Every screen designs for: loading, empty (with a next step), error (what happened
and how to fix it), success, disabled/pending, long content and partial data.
Warnings and errors differ by shape as well as colour.

## Writing guidelines

- Say what will happen in one sentence: "Send `X-Example-Token` from `example.com` to `127.0.0.1:8778` (My Local App)."
- Previews show first and last four characters until revealed.
- Errors name the cause and the fix.
