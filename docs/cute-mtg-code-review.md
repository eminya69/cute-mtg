# cute-mtg-lan — Code Review

**Reviewed:** `main.js` (server), `package.json`, `dist/index.html` (from `cute-mtg-web.zip`), plus `App.jsx` (3,242 lines), `DeckParser.js`, `main.jsx`.
**Method:** static read-through only. Nothing was executed, so every item below is "found by reading", not "reproduced". Line numbers refer to the files as uploaded (CRLF line endings do not change numbering).
**Project constraints (from the owner):** maximum **2 players**, **LAN only**, never intended to leave the local network.

Because of those constraints, the following were deliberately **left out** of this report: CORS `*`, spoofable `playerId`, path traversal in `/api/card-image`, hidden-information leakage (the full game state, including the opponent's hand and library order, is broadcast to every client), and 3+ player turn order. Fix them only if the scope ever changes.

## How to read this

- **[HIGH]** produces wrong game state, loses player data, or breaks a core flow.
- **[MED]** wrong or surprising behaviour in a less common flow, or a latent hazard.
- **[LOW]** polish, performance, hygiene.
- IDs (A1, B3, …) are stable so you can reference them in commits and replies.
- `App.jsx:330` means line 330 of `App.jsx`; `server:503` means line 503 of the server's `main.js`.

## Not reviewed (not provided)

- The Electron main process (IPC channels such as `select-deck-file`, `open-external`, `set-ignore-menu-shortcuts`, `refocus-window` are called from the client but no handler was provided).
- `vite.config.*`, root `index.html`, `src/` files other than the three above, any Tailwind config, and the runtime contents of `data/` and `images/`.
- Any runtime or integration testing.

---

## A. High priority

### A1. Life total of 0 resets to 20 — `App.jsx:330, 333, 623`
`(myData.life || 20)` treats `0` as falsy. At 0 life, pressing `L` sets life to 19 and `G` to 21. `updateCommanderDamage` has the same expression.

**Fix:** use `??` everywhere a numeric default is wanted (`myData.life ?? 20`). Also audit `poison`, `energy`, `experience`, `startingLife` (the `|| 20` on `startingLife` is fine because it can't be 0, but use `??` for consistency).

### A2. Commander-damage "−" at 0 gives free life — `App.jsx:619–626`
`next = Math.max(0, current + delta)` clamps the damage, but life is adjusted by the raw `delta`: `newLife = life - delta`. At 0 damage, clicking "−" leaves damage at 0 and adds 1 life. The log also claims "took -1 commander damage".

**Fix:**
```js
const current = myData.commanderDamage?.[commId] ?? 0;
const next = Math.max(0, current + delta);
const applied = next - current;
if (applied === 0) return;
updatePlayer({
  commanderDamage: { ...(myData.commanderDamage || {}), [commId]: next },
  life: (myData.life ?? 20) - applied,
});
```
and log `applied` instead of `delta`.

### A3. Mulligan and opening hand draw from stale state — `App.jsx:628–662, 1085–1111, 1124–1131`
`startLondonMulligan` returns the hand/board to the library, then calls `drawCard(7)` inside `setTimeout(…, 250)`. `dealOpeningHand` does `shuffleLibrary()` then `setTimeout(() => drawCard(7), 150)`. `drawCard` is the function from the render in which the timeout was scheduled, so it closes over the *old* `cards`:
- After a mulligan, the old hand is still `zone: 'hand'` in that snapshot, so it is not in the library the draw picks from. The new 7 come from the old library and the old hand is never actually reshuffled into the draw.
- After `dealOpeningHand`, the draw ignores the shuffle that was just applied.

**Fix:** do it in one synchronous step. Build the new library locally (return cards, assign random `order`, sort), take the top N from that array, and emit once. Or keep a `cardsRef` updated on every state change and read from it in `drawCard`. Avoid `setTimeout` as a way to wait for state.

### A4. Three reset implementations that disagree — `server:503`, `App.jsx:664, 628, 1196`
| Path | Life reset | Tokens | Commander cast to battlefield | Commander tax |
|---|---|---|---|---|
| Server `reset-round` (`resetRound()` / "Game 2/3 Reset") | `startingLife` ✔ | **moved to library** ✘ | **moved to library** (ignores `originalZone`) ✘ | **kept** ✘ |
| Client `restartGame` (`App.jsx:1196`) | hardcoded **20** ✘ | deleted ✔ | back to `originalZone` ✔ | reset ✔ |
| `startLondonMulligan` | n/a | **moved to library** ✘ | untouched | untouched |

`restartGame` also hardcodes `life: 20` even though the 40 starting-life button may be active (compare `electron-clear`, which correctly uses `myData.startingLife || 20`).

**Fix:** one authoritative implementation (preferably server-side, since the server owns state) that: deletes `isToken` cards, returns each non-token card to `originalZone ?? 'library'`, resets `commanderTax`, `isTransformed`, `imageUrl`/`name` from the front face, `tempPower/tempToughness`, `attachedTo`, counters, and sets life to `startingLife`. The mulligan should only touch hand → library (the London mulligan rules do not move the battlefield or graveyard at all; see A5/C).

### A5. `M` mulligans mid-game with no confirmation, and moves far too much — `App.jsx:301–306, 628–650`
`startLondonMulligan` moves **hand, battlefield, graveyard and exile** to the library. A stray `M` mid-game wipes your board (tokens included) with no confirm. It also leaves `isTransformed`, temp P/T, `attachedTo` and the swapped `imageUrl` in place.

**Fix:** restrict to hand → library (a mulligan only applies to the opening hand), gate behind `isOpeningDeal`/"no turn taken yet" or a confirm, and reuse the reset helper from A4 for cleanup.

### A6. Transform (and attach/detach) apply the first card's values to every selected card — `App.jsx:462–478, 974–1010`
`modifyCard(id, …)` applies the update to **all selected cards** (`selectedCards.includes(id) ? selectedCards : [id]`). `transformCard` passes a *fixed object* (`{ isTransformed, imageUrl, name }`) computed from one card, so every selected card gets that card's image and name. `attachCard` and `detachCard` do the same with fixed objects.

**Fix:** make `transformCard` pass an updater function (`c => …`) that computes per card, skipping cards without `backImageUrl`. For attach/detach, decide whether multi-attach is intended and, if so, handle it explicitly.

### A7. Hotkey handler: modifiers, key repeat, and destructive defaults — `App.jsx:209–340`
- **No modifier guard.** After handling Ctrl+Z / Ctrl+Y, other combos fall through: Ctrl+R reloads *and* rolls a d20, Ctrl+F flips the hovered card face down, Ctrl+C duplicates it, Ctrl+D draws, Ctrl+A etc.
- **No `e.repeat` guard.** Holding Enter/Space re-emits `pass-turn` before the first sync arrives (`activePlayerId` is still `savedId` on the client), so the opponent auto-draws more than once (`server:646`). Holding `D` or `M` repeats too.
- **Destructive fallthroughs.** `X` over a card starts targeting, but `X` with *no* card hovered/selected reaches `discardRandomCard()` (`App.jsx:309`). `Backspace` and `Delete` delete the hovered card immediately, with no ownership check (see B11).
- `selectedCards[0]` takes precedence over the hovered card, so with a stale selection `T`/`F`/`+` act on the selected card, not the one under the cursor.

**Fix:**
```js
if (e.ctrlKey || e.metaKey || e.altKey) return;           // after Ctrl+Z/Y handling
const repeatSafe = new Set(['+','-',']','[','l','g','p']); // keys where repeat is OK
if (e.repeat && !repeatSafe.has(e.key.toLowerCase())) return;
```
Consider requiring a hovered card for `X`, removing `Backspace` as a delete key (keep `Delete`), and adding a confirm (or relying on undo) for deletes.

### A8. Stuck hover target — `App.jsx:159–164` and all `onMouseEnter/Leave` sites
`hoveredCard` stores a snapshot object. When the hovered element unmounts (moved to another zone, deleted), React does not fire `onMouseLeave`, so `hoveredCard` stays set. Subsequent hotkeys use `hoveredCard.id` and act on a card that is no longer under the cursor (e.g. you drag a card to the graveyard, then press `T` and the graveyard card is tapped). The preview image also never refreshes when the card changes (flip, transform) because it is a stale snapshot.

**Fix:** store `hoveredId`, derive `const hoveredCard = cards.find(c => c.id === hoveredId)`. A removed card then resolves to `undefined` automatically, and the preview always reflects current state.

### A9. Undo is global, shallow, and can delete a player — `server:419–470`, `App.jsx` (every multi-card action)
- **Can remove a player.** Players are added on connect, but undo restores an older whole-state snapshot. If P2 joined after the snapshot, undoing past that point deletes P2 from `gameState.players`; their `update-player` calls then do nothing until they reconnect.
- **Global.** Ctrl+Z undoes the *other* player's last action too.
- **10 snapshots, one per emit.** Milling, exiling, or bottoming N cards loops `moveCard` N times (N emits, N snapshots), so a 10-card mill erases the entire undo history.
- **Inconsistent coverage.** `reset-turn`, `set-target-arrows`, `clear-target-arrows`, `set-storm-count`, `send-log`, `trigger-animation` do not save state; `update-player` does (so every life click consumes an undo slot).

**Fix:** keep `players` out of the undo snapshot (or merge current players back in after restoring); batch multi-card moves into a single `update-cards` emit; consider per-player undo (only snapshot/restore the acting player's cards and fields) or raise the limit.

### A10. Ghost players and the 2-player assumption — `server:430–447, 646`, `App.jsx:50–52`
`playerId` lives in `localStorage`, so a private window, another browser, or cleared storage creates a third entry in `gameState.players`. Players are **never removed** on disconnect. `pass-turn` hands the turn to "the first id that isn't the caller", so it can go to a ghost; `oppData` is just `otherIds[0]`. Two tabs in the same browser share one `playerId` (so they are the same player).

**Fix:** enforce max 2 (reject or spectate a third connection) and/or prune players whose sockets are gone. Note that `hard-reset` (`server:560`) already rebuilds `players` from *currently connected* sockets, so it works as a manual cleanup.
Also make `pass-turn`/`take-turn` use the socket's own `playerId` rather than a client-sent argument.

### A11. Deck import: identifier handling and DFC lookups — `DeckParser.js:43–46, 61, 101`
- Identifiers are sent as **either** `{id}` **or** `{name}`, never both. The server's name fallback (`server:306`) therefore never fires for id requests. If an OCTGN id is not a Scryfall id (or not in the local DB), the card is dropped and rendered as a card back.
- Results are indexed by `c.id` and the **full** name (`A // B`), but `deckCard.name` is typically the **front** face name, so double-faced cards miss the name lookup.
- The server returns only the cards it found. Nothing reports what was not found, so a bad import is silent.

**Fix:**
```js
// DeckParser: send both so the server can fall back
return { id: c.scryfallId, name: c.name };
// index by front name too
if (c.frontName) cardData[c.frontName.toLowerCase()] ??= c;
```
On the server, forward `name` as a fallback for entries listed in Scryfall's `not_found`, and return a `notFound` array so the client can warn ("3 cards could not be resolved: …").

---

## B. Medium priority

### B1. Modal behaviour — `App.jsx:210, 1545, 2026+, 2401`
- **Escape never closes a modal.** `if (modal !== null) return;` at line 210 runs before the Escape branch, so `if (modal) { setModal(null) }` is unreachable.
- **Backdrop click closes everything** (line 1545), including the London mulligan modal; closing it (backdrop, Cancel, ×) leaves 7 cards in hand with nothing bottomed.
- **`prompt_server_ip`** (the `file://` flow) is closeable by backdrop click; the socket has `autoConnect: false` in that mode, so the app then sits disconnected with nothing to reopen the prompt.
- `exploreSearch` is cleared only by the × button, not on backdrop close, so the next explorer opens pre-filtered.

**Fix:** handle Escape before the `modal !== null` return; make a `dismissible` flag per modal type and set it false for `london_mulligan` and `prompt_server_ip`; reset `exploreSearch` in one `closeModal()` helper used everywhere.

### B2. Bottom-of-library ordering is a tie — `App.jsx:913`
`card.order = toBottom ? -1 - idx : …`. Every separate call to "bottom" (each scry-to-bottom click, and the mulligan's per-card `moveCard(cid, 'library', 0, 0, true)`) gets `-1`, so later bottomed cards are not below earlier ones and the "To Bottom #n" numbering in the mulligan UI means nothing.

**Fix:** compute `Math.min(0, ...libraryOrders) - 1 - idx`, or keep an explicit integer position per library card.

### B3. Companions and partners can never work — `App.jsx:815, 1411, 1427`
`isCompanion` is set to `false` for every imported card and never set to `true` anywhere; `isPartner` is read but never set. Any section that isn't "command" or "sideboard" becomes library, so a Companion section goes into the deck. The "Pay 3 to Hand" button is unreachable.

**Fix:** detect companion/partner sections in `loadDeckFromXml` (or add a "mark as companion" action) and place them in the command zone with the flag set.

### B4. Two parallel commander-damage fields — `App.jsx:2733–2739` vs `619–626`
The shield counter on the player panel shows `max(cmdDmg, …commanderDamage)`, but its +/− buttons edit the legacy `cmdDmg` and do **not** touch life; the modal edits `commanderDamage` and **does** change life. They can show contradictory numbers. `cmdDmg` also appears in three reset payloads (`App.jsx:1222, 1517, 2269`).

**Fix:** pick one model (`commanderDamage` keyed by commander id), delete `cmdDmg`, and make the panel button just open the modal.

### B5. The server URL is computed in two places that disagree — `App.jsx:16–25` vs `DeckParser.js:3–11`
`App` uses `http://${location.hostname}:3000` (hardcoded port) and never imports the helper. `DeckParser.getServerUrl()` uses `location.origin`. Consequences:
- In dev (`vite --host`) the deck batch call goes to Vite, which returns HTML for unknown paths, so JSON parsing fails and it falls back to direct Scryfall, and the card-back URL is wrong.
- Setting `PORT` breaks the socket connection.

**Fix:** one exported `getServerUrl()` used by both, with a Vite dev proxy for `/api` and `/socket.io`.

### B6. Card-back fallback points at a file that isn't shipped — `server:267, 278`
The server reads `data/card-back.jpg`, but the archive only has `dist/card-back.jpg` and no `data/` directory. `/api/card-back` and the missing-image fallback return 404 unless that file exists on the host. The client uses `/api/card-back` for every face-down card.

**Fix:** serve it from `dist/` (`path.join(__dirname, 'dist', 'card-back.jpg')`) or document/ship `data/card-back.jpg`.

### B7. Destructive chat/log actions — `App.jsx:740, 3178`
- Typing `/restart` immediately runs `hard-reset` (wipes state and undo history for both players) with no confirmation.
- The log's "Clear" button only calls `setLogs([])`; the next `sync` restores the logs, so it appears broken. Multi-line log entries (`\n`) collapse because the log div lacks `whitespace-pre-wrap`.

### B8. Direct state mutation and stale closures in `moveCards` — `App.jsx:859–972`
`const targetCards = [...cards]` is a *shallow* copy, so `card.ownerId = …`, `card.zone = …`, `card.x = …` mutate the objects held in React state. Several features only work *because* of this accidental mutation:
- `exileTopCards` calls `moveCard` then `modifyCard` on the same card.
- `onDropBoard` re-reads `cards` for attachments after `moveCards`.
- Loops such as `millCards` and `exileTopCards` call `moveCard` N times, each of which rebuilds from the same stale `cards`, sends its own emit, and writes its own log line.

**Fix:** treat state as immutable (`cards.map(c => ids.has(c.id) ? {...c, …} : c)`), compute the whole batch once, and emit one `update-cards` and one log line.

### B9. Targeting arrows — `App.jsx:2472–2520`, `server:611`
- Arrows are computed *during render* from `document.getElementById` and `getBoundingClientRect`, so they lag one render behind card movement and never recompute on window resize.
- `set-target-arrows` replaces the whole array with the sender's local copy, so two arrows created close together overwrite each other.
- Arrows referencing deleted cards stay in state and keep being re-sent (they are just not drawn).

**Fix:** compute positions in a layout effect (or `ResizeObserver`), and send add/remove operations instead of the whole array.

### B10. `startScry` doesn't sort — `App.jsx:1229–1236`
`drawCard`, `millCards` and `exileTopCards` sort by `order` before taking the top; `startScry` does not. Optimistic local updates (e.g. `drawCard` → `setCards(newCards)`) don't re-sort, so right after a draw, scry can show the wrong cards until the next sync.

### B11. Ownership model is inconsistent — `App.jsx:859–880, 974–1017`
`moveCards` asks `window.confirm("Take control…")` for opponent cards and then overwrites `ownerId`, which conflates *owner* with *controller* (a stolen card then dies into the thief's graveyard; `originalOwnerId` is stored but never used). `modifyCard`, `deleteCard`, `duplicateCard` and all hotkeys have no ownership check at all, so the opponent's permanents can be tapped, flipped or deleted by hover + key.

**Fix:** separate `ownerId` from `controllerId`; apply a single permission check (or prompt) in one place used by every mutation.

### B12. Deck loading UX and parser robustness — `App.jsx:793–849, 851–857`, `DeckParser.js:17–22`
- Loading a deck deletes **all** of your cards (battlefield, hand, tokens) with no confirmation.
- `handleFileUpload` has no `try/catch`; a parse error is an unhandled rejection with no UI feedback. The "loaded and shuffled" log fires *before* parsing succeeds.
- The parser assumes a perfect shape: `result.deck.section` may be `undefined`; `section['@_name']` may be missing (`c.zone.toLowerCase()` then throws); purely numeric card names are converted to numbers by `fast-xml-parser` (`.toLowerCase()` then throws; set `parseTagValue: false`); a bad `qty` silently skips the card.

### B13. Storm count counts the wrong thing — `App.jsx:924`
Every hand → battlefield or hand → graveyard move increments storm, so land drops and discards count as spells cast.

### B14. Server handlers trust payload shape — `server:476–500` and the other `socket.on` handlers; `server:288`
One malformed emit (for example `update-cards` with a non-array or a `null` entry, `set-storm-count` with a non-number, or a `null` entry in `/api/cards/batch` identifiers) throws an uncaught exception, which crashes the Node process (Socket.IO does not catch handler errors; Express 4 does not catch async handler errors). Low likelihood with a trusted client, but it takes the whole game down.

**Fix:** a small `safe(handler)` wrapper with try/catch and basic shape checks; `app.use((err, req, res, next) => …)` for Express.

---

## C. Low priority / polish / performance

- **Every log line triggers a full state broadcast** (`server:596`), and each action emits several logs, so a multi-card drag causes many full syncs that overwrite optimistic local state. Let log-only events send just the new log entries.
- **`setMousePos` on every mouse move while targeting** re-renders the entire 3,000-line `App`. Track the cursor in a ref and update only the preview path.
- **Repeated `cards.filter(...).pop()`** (several per zone per render, `App.jsx` ~3090–3140). Compute zone lists once with `useMemo`.
- **The log's inline `ref` callback** calls `scrollIntoView` on every render (`App.jsx` ~3184); scroll only when the length changes.
- **`SolitaireAnimation`** depends on `[cards]` (`App.jsx:143`), so it restarts on every sync, and it loads an image for every card (including the opponent's library). Pass a snapshot of the battlefield once.
- **A new `AudioContext` per headpat** (`App.jsx:430`) is never closed.
- **Module-level `io(...)` and `localStorage` reads** (`App.jsx:5–32`) run on import, so each Vite HMR reload leaves another socket behind. Create the socket in an effect or a singleton module with HMR dispose.
- **No connection-status UI and no error boundary.** If the socket drops, the player keeps editing local optimistic state that silently diverges.
- **`<img>` tags have no `onError` fallback and no `alt`.**
- **The preview button is labelled "(Q)"** (`App.jsx` ~2455) but `Q` transforms the card; only the button flips the preview.
- **Magic position constants differ per side**: opponent rows use `150/350`, yours use `210/320`, and box-select hit-testing ignores the render-time clamp (`calc(100% - 100px)`), so selection is off when the window is smaller than where a card was placed.
- **`Date.now()` is used for `order`** on the client; clocks on the two machines can differ. This only matters if two clients ever order the same library.
- **Static caching:** the server sends `no-store` for everything, including hashed JS and the card back (`server:391`). Hashed `assets/*` can be `immutable`.
- **Dead code:** `takeMulligan` (`App.jsx:1051`), `rollDice` (`1237`), `parseDeckFile`, the unused `getServerUrl`, `isPartner`.
- **Duplicated code:** the "clear my board" logic exists in three places (`App.jsx:1517, 2269`, plus the confirm text); the Electron focus-handler boilerplate (`window.require('electron')…set-ignore-menu-shortcuts`) is copy-pasted roughly ten times.
- **`App` is a single 3,242-line component** with 30+ `useState` hooks. Splitting into zone components, a `useGameActions` hook, and a modal registry would remove most of the stale-closure risk in A3/B8.
- **No tests.** The game rules (zone moves, mulligan, reset, commander damage, turn passing) are pure functions waiting to be extracted and unit-tested.

---

## D. Build, dependencies, Electron

- **`start` runs `electron .`, but `main` is the Express server.** `main.js` has no `BrowserWindow`, so no window opens. The client calls IPC channels (`select-deck-file`, `open-external`, `set-ignore-menu-shortcuts`, `refocus-window`), so a real Electron main process exists somewhere that wasn't provided.
- **`window.require('electron')` in the renderer** implies `nodeIntegration: true`; the page also loads a third-party script (`cdn.tailwindcss.com`) with Node access. Use a preload + `contextBridge` instead.
- **`cdn.tailwindcss.com` is the Tailwind play CDN**: it needs internet access (the UI is unstyled on an offline LAN), blocks rendering, and isn't meant for production. Compile Tailwind at build time.
- **`-webkit-app-region: drag` on `body`** (`dist/index.html`) makes the whole page draggable in a frameless Electron window; only the intended title bar should be a drag region.
- **`vite`, `@vitejs/plugin-react` and `electron` are in `dependencies`**, so a server install downloads Electron. Move build and Electron packages to `devDependencies`.
- **`node:sqlite` needs Node 22.5+** (and may print an experimental warning); there is no `engines` field.
- **`npm run deploy` can't work from this archive**: `vite build` needs the root `index.html`, `src/`, and the Vite config, none of which were included.
- **Hardcoded `C:\Users\Emily\…` path** in `CANDIDATE_IMAGE_DIRS` (`server:20`). Move it to the `IMAGES_DIR` environment variable. Note the cache directory is created inside whichever candidate directory is found first.
- **The zip uses backslash entry names** (`dist\index.html`). Info-ZIP `unzip` normalizes them; other extractors on Linux create files literally named `dist\index.html`, and then `express.static` finds nothing.

---

## E. Suggested fix order

1. **Quick wins (minutes each):** A1, A2, A7 (modifier and repeat guard, `X` fallthrough, `Backspace`), B7 (`/restart` confirm), B1 Escape ordering.
2. **Core rules correctness:** A3 + A5 (mulligan/opening hand), A6 (transform on multi-select), A4 (single reset implementation, including `duplicateCard`/`isToken`), B2 (bottom ordering).
3. **Deck import:** A11, B3, B12 (send `{id, name}`, index by front name, report not-found cards, error handling, companion detection).
4. **State and undo:** A8 (hover by id), A9 + A10 (undo with players, ghost players), B8 (immutability and batching).
5. **Plumbing:** B5 (single `getServerUrl` + Vite proxy), B6 (card-back path), D (Tailwind build, Electron entry and preload, dependency placement).
6. **Cleanup:** section C, starting with extracting pure game-logic functions so they can be tested.

## F. Quick regression checks to run after fixing

- Set life to 0, then press `L` and `G`: life should go −1 and +1, never 19/21.
- Commander damage "−" at 0: damage stays 0 and life is unchanged.
- Mulligan: after the 7 are drawn, none of the previous hand's cards were excluded from the shuffle; hold `M` and confirm only one mulligan happens.
- Hover a card, drag it to the graveyard, press `T`: nothing should happen to the graveyard card.
- Select two cards (one a double-faced card) and press `Q`: only the DFC transforms.
- Duplicate a non-token card, then Restart: the deck size must not grow.
- Join with P2, perform one action as P1, then undo twice: P2 must still exist.
- Import a deck with a double-faced card and an unknown card: the DFC shows its art; a warning lists the unknown one.
- Press `X` with nothing hovered: no card is discarded.
- Press Ctrl+R, Ctrl+F, Ctrl+C on the board: no game action fires.
