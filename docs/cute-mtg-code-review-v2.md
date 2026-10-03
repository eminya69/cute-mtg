# cute-mtg-lan — Code Review, Revision 2 (re-audit)

**Reviewed:** `cute-mtg-src.zip` — `main.js` (server), `src/App.jsx` (3,359 lines, was 3,242), `src/DeckParser.js`, `src/main.jsx`, `electron/main.js`, `electron/launcher.html`, `electron/package.json`, `package.json`, `vite.config.js`, `index.html`, `README.md`, `update-mtg-server.sh`, `upload-octgn-images.ps1`, `build-cards-db.js` (skimmed only).
**Compared against:** the first audit (`cute-mtg-code-review.md`, IDs A1–B14, C, D). IDs are kept so status can be tracked.
**Method:** static read plus a line-by-line diff against the previous `App.jsx`, `DeckParser.js` and server `main.js`. Nothing was executed, so "Fixed" means "the code now does the right thing when read", not "verified in a running game". Line numbers refer to the new files.
**Constraints (unchanged):** max 2 players, LAN only. Security items from round 1 stay out of scope.
**Companion document:** `cute-mtg-electron-focus-review.md` covers the Electron keyboard/focus problem in depth. This file only cross-references it.

## Summary

- Of the 25 numbered issues in the first audit (A1–A11, B1–B14), **15 are fixed, 8 are partly fixed, and 2 are still open** (B8, B9). Section C/D items are tracked separately below.
- Almost every HIGH item was addressed correctly. The mulligan/deal rewrite (A3), reset unification (A4), hover-by-id (A8), `??` fixes (A1/A2), and the `{id, name}` deck-import fix (A11) are all solid.
- **The fixes introduced a new class of problem:** several of them added `window.confirm()` / `alert()` calls (hotkey `M`, `/restart`, deck load, deck-load errors). Native JS dialogs are the best-known cause of lost keyboard focus in Electron on Windows. See N1 and the companion focus review. This is very likely related to the issue you are seeing.
- 11 new issues (N1–N11) are listed below. The most important besides N1: a matching bug in the new server not-found retry (N2), and companions now being treated as commanders (N3).

Legend: **FIXED** = resolved; **PARTIAL** = improved but a residual remains; **OPEN** = unchanged; **NEW** = introduced or discovered in this revision.

---

## 1. Status of the first audit's issues

### A. High priority

| ID | Issue | Status | Notes |
|---|---|---|---|
| A1 | `life \|\| 20` resets 0 to 20 | **FIXED** | Hotkeys and `updateCommanderDamage` use `??`. Remaining `\|\| 0` expressions are on values that can't be negative or where 0 is harmless. |
| A2 | Commander-damage "−" gave free life | **FIXED** | `applied = next - current`; returns early when 0; life and log use `applied` (`App.jsx:654`). |
| A3 | Mulligan / opening hand drew from stale state | **FIXED** | `startLondonMulligan` (`:665`) and `dealOpeningHand` (`:1220`) now compute the new library and hand synchronously and emit once. No `setTimeout`. |
| A4 | Three reset implementations disagreed | **MOSTLY FIXED** | Server `reset-round` (`main.js:587`) now deletes tokens, honours `originalZone`, resets `commanderTax`/`commanderDamage`, uses `startingLife ?? 20`. Client `restartGame` uses `startingLife`. The mulligan no longer touches the battlefield. **Residual:** client `restartGame` and server `reset-round` are still two separate implementations of the same thing, and `reset-round` resets *every* card whose `ownerId` is the player, including cards stolen from the opponent. |
| A5 | `M` mulligans mid-game, too destructive | **PARTIAL** | Scope is now hand → library only, and the hotkey asks for confirmation. **Residual:** the on-screen "Mulligan" button and the Electron menu item still run with no confirm and are not restricted to the opening hand. The confirm is a native dialog (see N1). |
| A6 | Transform on multi-select copied one card's face to all | **FIXED** (transform) | `transformCard` (`:499`) now uses a per-card updater. **Residual:** `attachCard`/`detachCard` still pass fixed objects and apply them to every selected card. **Minor regression:** the "transformed X into Y" log line was dropped (N7). |
| A7 | Hotkey handler: modifiers, repeat, destructive fallthroughs | **MOSTLY FIXED** | Modifier guard (after Ctrl+Z/Y), `e.repeat` guard with an allow-list, `X`-with-nothing-hovered discard removed, `Backspace` no longer deletes, hover now takes precedence over selection (`:235–`). **Residual:** (a) Enter on a focused button still fires the button *and* passes the turn (see focus review F-5); (b) with nothing hovered, `selectedCards[0]` is still the target, so a stale selection can receive `T`/`F`/`Delete`; (c) the help modal still documents `X → Discard Random Card` (`:2409`) and the Discard button title says "(X)" (`:3219`), but the key no longer does that. |
| A8 | Stuck hover target | **FIXED** | `hoveredCardId` + derived `hoveredCard` via `useMemo` (`:152–165`). A removed card resolves to `null`. |
| A9 | Undo global / shallow / could delete a player | **MOSTLY FIXED** | Server undo snapshots now hold only `cards`, `activePlayerId`, `monarch`, `dayNight`, `stormCount` (`main.js:473`), so players can no longer vanish; depth is 25; `update-player` no longer consumes undo slots; mill/exile batch into one `moveCards`. **Residual:** undo is still shared between both players; face-down exile still emits one `modifyCard` per card (N undo steps, `:~757`); `reset-turn`, arrows and `send-log` still don't snapshot. |
| A10 | Ghost players / `pass-turn` | **PARTIAL** | `pass-turn` now uses the socket's own id and prefers *connected* players over registered ones (`main.js:722–728`), which fixes the worst case. **Residual:** players are still never pruned, so the client's `oppData` (first other registered id) can still show a ghost as the opponent while the turn passes to the connected one. No max-2 enforcement. `take-turn` still accepts an arbitrary id. Note `hard-reset` no longer rebuilds players from connected sockets (it now just keeps all existing players), so it is no longer a cleanup tool for ghosts. |
| A11 | Deck-import identifiers / DFC lookups | **FIXED** | Sends `{id, name}`, indexes by `frontName`, strips `// …` for lookup, reports unresolved cards in the log. Server retries Scryfall `not_found` by exact name. (But see N2 and N3 for new defects in this code.) |

### B. Medium priority

| ID | Issue | Status | Notes |
|---|---|---|---|
| B1 | Modal behaviour | **PARTIAL** | Escape now works (handled before the `modal !== null` return, `:236`); backdrop click goes through `closeModal()` and is blocked for `london_mulligan` and `prompt_server_ip` (`:202–215`); `exploreSearch` is reset. **Residual:** the London mulligan modal's own **×** (`:~2169`) and **Cancel** buttons still call `setModal(null)` directly, so you can still dismiss it without bottoming cards (N5). The "Mulligan Again (M)" label promises a hotkey that is blocked while any modal is open. |
| B2 | Bottom-of-library ordering tie | **FIXED** | `order = min(0, ...libraryOrders) - 1 - idx` in `moveCards`. |
| B3 | Companions/partners dead | **PARTIAL** | `isCompanion` is now detected from a "companion" section name. **But** the parser also sets `isCommander = true` for companions, which causes N3. `isPartner` is still never set. |
| B4 | Two commander-damage fields | **FIXED** | `cmdDmg` removed everywhere; the player-panel counter shows the max of `commanderDamage` and has an "Edit" button that opens the modal. |
| B5 | Two different server URLs | **FIXED** | `App` imports `getServerUrl()` from `DeckParser.js`; Vite proxies `/api` and `/socket.io`. The `file:` branch (`needsServerUrl`) is now dead code with the launcher approach but harmless. |
| B6 | Card-back path | **FIXED** | Server checks `data/`, `dist/`, `public/`; `public/card-back.jpg` is now in the project and Vite copies it into `dist/`. |
| B7 | `/restart` and log Clear | **PARTIAL** | `/restart` now confirms (native dialog — N1) and log lines use `whitespace-pre-wrap`. **Residual:** the log **Clear** button (`:3295`) still only does `setLogs([])`, and the next `sync` restores everything. |
| B8 | State mutation / stale closures in `moveCards` | **OPEN** | `moveCards` still mutates the card objects held in React state, and `exileTopCards(faceDown)` still depends on that mutation. Improved indirectly by batching mill/exile into one `moveCards` call. |
| B9 | Targeting arrows | **OPEN** | Still computed during render from the DOM, still sent as a whole array. |
| B10 | `startScry` not sorting | **FIXED** | |
| B11 | Ownership model | **PARTIAL** | `deleteCard` and `duplicateCard` now refuse non-owned cards, but they check `c.controllerId`, which is **never assigned anywhere** (dead branch). `modifyCard` (tap/flip/counters/transform via hotkeys on a hovered opponent card) still has no ownership check. `moveCards` still overwrites `ownerId` when taking control. |
| B12 | Deck loading UX / parser robustness | **MOSTLY FIXED** | Confirm before replacing cards; try/catch around parse and file read; missing `<deck>`/`<section>`/name handled; `parseTagValue: false`. **Residual:** the confirm and the error `alert()`s are native dialogs (N1); `qty="0"` is now treated as 1 (N4). |
| B13 | Storm count heuristic | **IMPROVED** | Now counts non-land hand→battlefield and instant/sorcery hand→graveyard using `typeLine`. Still an approximation (e.g. unresolved cards with empty `typeLine` count as spells). |
| B14 | Handlers trust payload shape | **FIXED** | `safe()` wrapper around every socket handler, shape checks, `parseInt` on storm count, identifier filter in `/api/cards/batch`, Express error middleware. **Note:** that middleware does not catch rejected promises from async routes in Express 4, but the async routes are now guarded well enough that this is low risk. |

### C. Low priority / polish

| Item | Status |
|---|---|
| Full state broadcast on every log line | OPEN |
| `setMousePos` re-renders all of `App` on every mouse move while targeting | OPEN |
| Repeated `cards.filter(...).pop()` per render (`useMemo` is imported but only used for `hoveredCard`) | OPEN |
| Log `ref` callback calling `scrollIntoView` every render | **FIXED** (effect on `logs.length`) |
| `SolitaireAnimation` restarting on every sync / loading every card | **FIXED** (`[]` deps, max 30 visible cards, card-back fallback) |
| `AudioContext` created per headpat and never closed | OPEN |
| Module-level `io()` / `localStorage` reads (HMR leaves sockets behind) | OPEN |
| No connection-status UI / error boundary | OPEN |
| `<img>` without `onError` / `alt` | OPEN |
| Preview button labelled "(Q)" but `Q` transforms the card | OPEN |
| Magic position constants differ per side; box-select ignores render clamp | OPEN |
| `Date.now()` for `order` across two clients | OPEN |
| Static `no-store` for hashed assets | **FIXED** (`/assets/` is `immutable`) |
| Dead code: `takeMulligan` (`:1148`, still contains a `window.confirm`), `rollDice`, `parseDeckFile`, `isPartner` | OPEN |
| Duplicated "clear board" logic and ~10 copies of the Electron focus boilerplate (19 `set-ignore-menu-shortcuts` call sites) | OPEN — central to the focus problem |
| 3,359-line single component; no tests | OPEN |

### D. Build, dependencies, Electron

| Item | Status |
|---|---|
| `start` ran `electron .` against the server file | **FIXED** — `start` is `node main.js`, `electron` is `electron ./electron`, and a real Electron main process now exists in `electron/`. |
| Electron/Vite/React plugin in `dependencies` | **FIXED** — moved to `devDependencies`. |
| `engines` field for `node:sqlite` | **FIXED** — `>=22.5.0`. |
| Missing `vite.config`, `index.html`, `src/` | **FIXED** — all present; `.gitignore` added. |
| Tailwind play CDN (`cdn.tailwindcss.com`) | **OPEN** — still in `index.html`. Needs internet, and in the Electron window it runs with Node access (see focus review §6). |
| `-webkit-app-region: drag` on `body` | **FIXED in source** (not present in `index.html` or any source file). **Verify the deployed `dist/`** — see focus review F-1. |
| `nodeIntegration: true`, `contextIsolation: false` | **OPEN** — still the case in `electron/main.js:10–13`. |
| Hardcoded `C:\Users\Emily\…` | **PARTIAL** — a `LOCALAPPDATA`-based candidate was added to `main.js`, but the hardcoded path remains in `main.js`, `build-cards-db.js` and `upload-octgn-images.ps1`. |
| Zip backslash entry names | **FIXED** — new archive uses forward slashes. |

---

## 2. New issues in this revision

### N1. [HIGH] New `window.confirm()` / `alert()` call sites — likely cause of the Electron focus problem
The fixes for A5, B7 and B12 added native dialogs on top of the existing ones. In Electron on Windows, a native JS dialog closing very often leaves the web contents without keyboard focus until the window is blurred and refocused. Full analysis, evidence and fix in `cute-mtg-electron-focus-review.md`. Call sites in `App.jsx`:

| Line | Trigger | New? |
|---|---|---|
| 337 | `M` hotkey → "Start London Mulligan?" | **new** |
| 792 | `/restart` chat command | **new** |
| 849 | Loading a deck when you already have cards (runs *right after* the native file-open dialog from the Electron menu) | **new** |
| 901, 930 | `alert()` on deck parse / file read failure | **new** |
| 946 | Taking control of an opponent's card (inside a drop handler) | existing |
| 1313 | `restartGame` (menu: Restart My Deck) | existing |
| 1632, 2384 | Clear board (menu and settings modal) | existing |
| 1148 | `takeMulligan` (dead code) | existing |

Plus `alert()` in `electron/main.js:164` (`did-fail-load`).

**Fix:** replace with an in-app async confirm modal (`const ok = await askConfirm('…')`) rendered by React. Do not use `window.confirm`/`alert` anywhere in the renderer.

### N2. [MED] Server not-found retry matches the wrong entry — `main.js:354`
```js
const original = missing.find(m => m.id === nf.id);
```
For name-only identifiers Scryfall returns `{name: …}` with no `id`, so `nf.id` is `undefined` and `m.id === undefined` matches the **first** name-only entry in `missing`, not the one that failed. Additional problems in the same block:
- `else if (original && original.name)` repeats the condition of the `if` above it, so it can never run; an id-only miss with no name is never reported.
- Each retry is a sequential `cards/named?exact=` request with no delay (Scryfall asks for ~50–100 ms between requests).
- The client collects `data.notFound` into `serverNotFound` (`DeckParser.js:74, 91`) but never uses it; the user-visible warning comes only from the client-side `_unresolvedCards` check.

**Fix:** match on `nf.id ?? nf.name` (e.g. `missing.find(m => (nf.id ? m.id === nf.id : m.name === nf.name))`), delete the dead branch, throttle, and have the client use `data.notFound` (or drop it).

### N3. [MED] Companions are treated as commanders — `DeckParser.js:162`, `App.jsx` (`loadDeckFromXml`)
`const isCommander = zLow.includes('command') || isCompanion;` → every companion gets `isCommander: true`. Consequences:
- The Commander Damage modal lists the companion as a commander (it filters on `c.isCommander || zone === 'command_zone'`).
- When the companion reaches the battlefield it shows the **Commander** shield badge.
- Anything that keys off `isCommander` (tax, restart) now includes it.

**Fix:** keep `isCompanion` separate. Place companions in the command zone (or a dedicated zone) without setting `isCommander`.

### N4. [LOW] `qty="0"` becomes 1 card — `DeckParser.js:40`
`parseInt(card['@_qty'], 10) || 1` turns a quantity of 0 into 1. Use `Number.isNaN(q) ? 1 : q` and skip zero.

### N5. [MED] London mulligan modal can still be dismissed — `App.jsx:~2169`
`isModalDismissible()` blocks backdrop-click and Escape, but the modal's own **×** and **Cancel** buttons call `setModal(null)` directly. Route them through a different handler (or hide them) so the player must bottom the required cards. Also the "Mulligan Again (M)" button label advertises a hotkey that is disabled while a modal is open.

### N6. [LOW] Counter hotkey and counter buttons disagree — `App.jsx` hotkey `-` vs hover buttons
The `-` hotkey now clamps counters at 0 (`Math.max(0, …)`), but the on-card "−" button (`c.counters - 1`) and the display code still support negative counters. Pick one behaviour.

### N7. [LOW] Transform no longer logs
`transformCard` (`:499`) lost its `logAction`. Add one inside the updater's caller (not inside the updater itself — see B8).

### N8. [LOW] Documentation drift
- `README.md` keybinds do not match the code: it says `Hover + ] / [` = loyalty counter (actually temp P/T buff), `Hover + P` = attach (actually `E`; `P` is poison), `Hover + D` = draw (global `D`), `Hover + X` = targeting only.
- README chat commands: `/roll`, `/rules`, `/clear` are listed; `handleChat` implements `/rule`, `/d6`, `/planar`, `/mill`, `/flip`/`/coin`, `/mulligan`, `/solitaire`, `/fliptable`, `/unflip`, `/gay`, `/headpats`, `/restart`. There is no `/roll` and no `/clear`.
- README mentions `temp_pack/`, which is not in the archive.
- Help modal still lists `X → Discard Random Card` (`:2409`).

### N9. [MED] Two different Electron versions — `package.json` vs `electron/package.json`
Root `devDependencies.electron` is `^44.4.5` (used by `npm run electron`); `electron/package.json` pins `^29.1.0` (used when you build the Windows client with `electron-builder`). So the **packaged exe you ship runs Electron 29, while development runs 44**. Focus/dialog behaviour differs between those versions, so a focus fix verified in dev may not hold in the packaged client (and vice versa). Test the packaged build. Electron 29 is also long out of support.

### N10. [LOW] Deploy script leaves stale files and trusts the zip's `dist/` — `update-mtg-server.sh`
- `unzip -o` overwrites but never deletes, so old `dist/assets/index-*.js` files accumulate.
- `dist/` and `*.zip` are in `.gitignore`; nothing guarantees the `cute-mtg-web.zip` you upload was built from the current source. A stale `dist/` is how the old `-webkit-app-region: drag` CSS could still be served to Electron clients. Add a build step or a version stamp, and check the served HTML after deploy (`curl -s http://HOST:3000/ | grep -c app-region` should print `0`).
- `npm install --omit=dev` is fine (Vite is not needed at runtime), but it runs as root with `User=root` for the service.

### N11. [LOW] `_unresolvedCards` is a property attached to an array — `DeckParser.js:191`
Works, but is fragile (lost on `.map`/spread). Return `{ cards, unresolved }`.

---

## 3. Recommended next steps

1. **Electron focus (N1, N9, focus review):** replace every `window.confirm`/`alert` with an in-app modal, remove the `alert()` from `did-fail-load`, and test the *packaged* client. Verify that the host serves a freshly built `dist/`.
2. **Quick correctness fixes:** N2 (not-found matching), N3 (companion ≠ commander), N5 (London modal buttons), N4.
3. **Remaining open items from round 1:** B8 (immutability in `moveCards`), B9 (arrows), B11 (ownership check in `modifyCard`; remove or implement `controllerId`), B7 (log Clear).
4. **Docs:** fix the README keybinds/commands and the help modal (N8).
5. **Housekeeping:** C-list items, starting with extracting the Electron focus boilerplate into one hook (this will also make the focus fix much smaller).

## 4. Regression checks for this revision

- Press `M` mid-game, confirm, then type in the chat box: typing must work immediately (focus).
- Load a deck while you already have cards: confirm → type in chat → still works.
- Companion in the deck: appears in the command zone, is **not** listed in Commander Damage, no "Commander" badge on the battlefield.
- Import a deck containing two unknown names: both are reported, not just the first.
- Import `qty="0"`: the card is skipped.
- London mulligan: × and Cancel cannot close the modal before bottoming.
- Escape closes the explorer, settings, help and dice modals; it does not close the mulligan modal.
- Join as P2, act as P1, undo twice: P2 stays in the game.
- Hover an opponent's card and press `T`: nothing should change (once B11 is finished).
- `curl -s http://HOST:3000/ | grep app-region` prints nothing.
