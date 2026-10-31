# Design

## Audience and tone

Developers and power users who want to see exactly what a tool is doing. The
interface is calm, plain and precise: short labels, no marketing language, and
one sentence per rule that says what will be shared, from where and to whom.

## Visual direction

Conduit uses the **Conduit** brand from the Black Canyon Software brand kit: its
generated theme, fonts, icons and component styles, bundled into
`src/theme/` with `brandkit bundle`. No colours or type are defined outside it.

Brand status: the Conduit brand is being built; this file is completed when
`dist/conduit` exists (see [HANDOFF.md](HANDOFF.md)).

## Project conventions

- **Light/dark toggle** on every screen, using a sun/moon icon; the choice is remembered (US-015).
- **Info (i) buttons** hide explanatory text so screens stay uncluttered; the text opens on demand and is reachable by keyboard (US-016).
- Tokens come from the brand template; spacing on a 4/8 px scale; touch targets at least 24 px, aiming for 44.

## Screens

| Screen | Purpose |
|---|---|
| Popup: Cookies | Site cookie list, selection, format picker, copy/download |
| Popup: Status | Kill switch, active rules count, last deliveries |
| Options: Rules | Create, approve, disable, import/export rules |
| Options: Sinks | Add sinks, see what each asks for, loopback marker |
| Options: Log | Delivery and capture log, download |

## States

Every screen designs for: loading, empty (with a next step), error (what happened
and how to fix it), success, disabled/pending, long content and partial data.
Warnings and errors differ by shape as well as colour.

## Writing guidelines

- Say what will happen in one sentence: "Send `X-Example-Token` from `example.com` to `127.0.0.1:8778` (My Local App)."
- Previews show first and last four characters until revealed.
- Errors name the cause and the fix.
