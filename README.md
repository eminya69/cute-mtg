# Cute MTG LAN (Wifey: The Headpattening)

A fast, lightweight, and offline-capable Magic: The Gathering client and server built for 2-player local LAN and tabletop play. Features OCTGN decklist import (`.o8d`), real-time state synchronization via WebSockets, local SQLite card resolution with Scryfall fallback, dynamic dual-board tabletop perspective, customizable playmats and sleeves, MTG rules automation (London mulligan, cleanup buffs, commander tax, stun counters, untap step), creature soundtrack triggers (`/funnymode`), and a standalone desktop Electron app.

---

## Table of Contents
- [Architecture Overview](#architecture-overview)
- [System Requirements](#system-requirements)
- [Deploying from Source (Quick Start)](#deploying-from-source-quick-start)
- [How to Manually Assemble the Electron Desktop App](#how-to-manually-assemble-the-electron-desktop-app)
- [Server Deployment (Linux / Proxmox LXC / Headless)](#server-deployment-linux--proxmox-lxc--headless)
  - [Automated LXC Deployment (`update-mtg-server.sh`)](#automated-lxc-deployment-update-mtg-serversh)
  - [Manual Systemd Service Configuration](#manual-systemd-service-configuration)
- [Cards Database & OCTGN Image Management](#cards-database--octgn-image-management)
- [Funny Mode (`/funnymode`) & Creature Audio](#funny-mode-funnymode--creature-audio)
- [Controls, Hotkeys & Slash Commands](#controls-hotkeys--slash-commands)
- [Deck Format Compatibility](#deck-format-compatibility)
- [License](#license)

---

## Architecture Overview

```
                      +---------------------------------------+
                      |         Electron Desktop Client       |
                      |          (or Any Web Browser)         |
                      |        React 19 + Tailwind + Vite     |
                      +-------------------+-------------------+
                                          |
                              HTTP / REST | WebSocket (Socket.IO)
                                          v
                      +---------------------------------------+
                      |          Node.js Game Server          |
                      |          (Express + main.js)          |
                      +-------------------+-------------------+
                                          |
                    +---------------------+---------------------+
                    |                                           |
                    v                                           v
         +--------------------+                      +--------------------+
         |   SQLite Cards DB  |                      |   OCTGN Local /    |
         |    (node:sqlite)   |                      |  Scryfall Web Cache|
         |  100,000+ Cards    |                      |    (/images/)      |
         +--------------------+                      +--------------------+
```

### Core Architecture Components

1. **Frontend Client (`src/`)**:
   - `App.jsx`: Complete battlefield rendering, interactive dragging, player hands, library, graveyard, exile, command zone, token creator, scry modal, London mulligan modal, targeting crosshairs/arrows, card attachments (Auras/Equipment), audio engines, and dual-board perspective inversion.
   - `DeckParser.js`: Multi-format deck parser supporting OCTGN XML (`.o8d`) and plain-text exports (Arena, MTGO, Moxfield), with batch card resolution and fallback caches.
   - `main.jsx`: React root mounting point.

2. **Backend Engine (`main.js`)**:
   - REST API endpoints (`/api/cards/batch`, `/api/card-image/:id`, `/api/tokens/search`, `/api/card-back`, `/api/custom-asset/:filename`).
   - Socket.IO coordinator managing turn order, untap step automation, draw step, life/counters, commander damage, funny mode audio triggers, and 30-step undo/redo history.
   - Built-in `node:sqlite` connection to `data/cards.db` for instant local card resolution.

3. **Desktop Wrapper (`electron/` & `cute-mtg-electron-simple/`)**:
   - Standalone native wrapper running Chromium and Node integration.
   - Native Windows file picker dialog for `.o8d` decks (`select-deck-file`).
   - OS application menus (Undo, Redo, Life presets, Dark mode, Mulligan, Appearance).
   - Dedicated connection launcher (`launcher.html`) with `config.cfg` support.

---

## System Requirements

- **Node.js**: `v22.5.0` or higher (mandatory for native `node:sqlite` support without external native binary build tools like node-gyp or Python).
- **Package Manager**: `npm` (v10+ recommended).
- **Supported Operating Systems**: Windows 10/11, macOS, Linux (Debian, Ubuntu, Alpine with glibc, Proxmox LXC).

---

## Deploying from Source (Quick Start)

To run both client and server locally on your development machine:

### 1. Clone & Install Dependencies

```bash
git clone <repository-url>
cd cute-mtg-lan
npm install
```

### 2. Build the Cards Database (If not already present)

If `data/cards.db` is missing, compile it from OCTGN sets or Scryfall dumps:

```bash
node build-cards-db.js
```

### 3. Build the Frontend Assets

Compile the React JSX codebase into high-performance production static assets:

```bash
npm run build
```
This generates optimized HTML, JS, and CSS files inside the `dist/` directory.

### 4. Start the LAN Game Server

```bash
npm start
```
* Or run directly: `node main.js`
* The server will boot on port `3000` (listening on `0.0.0.0:3000`).
* Open your browser and navigate to `http://localhost:3000`.

### 5. Launch the Electron Desktop Client

In a separate terminal (while the server is running):

```bash
npm run electron
```

---

## How to Manually Assemble the Electron Desktop App

The Electron app (`cute-mtg-client.exe`) is designed as a portable desktop client. It connects to the game server over LAN or localhost and dynamically renders the latest web bundle.

### Directory Structure of the Electron Wrapper

```
cute-mtg-electron-simple/
├── main.js             # Electron main process (Window lifecycle, menus, IPC file dialogs)
├── launcher.html       # Connection screen with IP address input & error fallback
├── package.json        # Electron package configuration
├── pack.js             # Automated electron-packager build script
└── config.cfg          # Default configuration (Server URL & Autoconnect setting)
```

### How `config.cfg` Works

Place `config.cfg` in the same directory as the resulting `.exe`:

```ini
# cute-mtg-client configuration
Server = http://192.168.1.100:3000
Autoconnect = true
```

* **`Server`**: The default IP/URL of the game server (defaults to `http://localhost:3000`).
* **`Autoconnect`**: When `true`, skips the `launcher.html` screen and connects directly to the server on startup. If `false`, opens the launcher prompt.

---

### Step-by-Step Manual Assembly into a Windows Release

#### Method 1: Using `electron-packager` (Automated)

1. Navigate to the Electron package directory:
   ```bash
   cd cute-mtg-electron-simple
   npm install
   ```

2. Run the packaging script:
   ```bash
   node pack.js
   ```
   *Under the hood, `pack.js` executes:*
   ```javascript
   const packager = require('electron-packager');
   packager({
     dir: '.',
     name: 'cute-mtg-client',
     platform: 'win32',
     arch: 'x64',
     out: 'dist_packager',
     overwrite: true,
     asar: true
   });
   ```

3. Copy `config.cfg` next to `dist_packager/cute-mtg-client-win32-x64/cute-mtg-client.exe`.

---

#### Method 2: Manual Assembly using `asar` and Prebuilt Electron

If you want to manually construct the bundle without build tools:

1. **Extract or Locate Prebuilt Electron**:
   Use the binaries located at `node_modules/electron/dist/` (or download an official release of Electron `v44.x` / `v34.x` for `win32-x64`).

2. **Create the Application Archive (`app.asar`)**:
   Pack `cute-mtg-electron-simple` (containing `main.js`, `launcher.html`, `package.json`):
   ```bash
   npx asar pack cute-mtg-electron-simple app.asar
   ```

3. **Assemble the Application Directory**:
   ```
   cute-mtg-client-win32-x64/
   ├── cute-mtg-client.exe      # (Renamed from electron.exe)
   ├── config.cfg               # Server config
   ├── resources/
   │   └── app.asar             # Your packed asar archive
   ├── locales/
   ├── chrome_100_percent.pak
   ├── ffmpeg.dll
   ├── icudtl.dat
   └── ...                      # Other Electron runtime DLLs
   ```

4. **Compress into Portable ZIP**:
   ```powershell
   Compress-Archive -Path cute-mtg-client-win32-x64\* -DestinationPath cute-mtg-client-windows-exe.zip -Force
   ```

---

## Server Deployment (Linux / Proxmox LXC / Headless)

You can run the dedicated server on any Linux machine, VPS, Raspberry Pi, or Proxmox LXC container (e.g. Debian 12).

### The Web Server Update Package (`cute-mtg-web.zip`)

`cute-mtg-web.zip` contains everything required to run the dedicated server:
- `main.js` (Server application)
- `dist/` (Compiled production frontend)
- `package.json` & `package-lock.json`
- `card-back.jpg`

---

### Automated LXC Deployment (`update-mtg-server.sh`)

If deploying to a Proxmox LXC Container (default: Container `117` at `10.42.69.67`):

1. Copy `cute-mtg-web.zip` and `update-mtg-server.sh` to the Proxmox host.
2. Run the update script:
   ```bash
   chmod +x update-mtg-server.sh
   ./update-mtg-server.sh
   ```

The script automatically:
* Verifies container status and checks rootfs storage size (resizing to 60GB if needed).
* Stops the running `cute-mtg` systemd service.
* Upgrades Node.js to Node 22 LTS inside the container if required.
* Unzips the new web bundle into `/opt/cute-mtg/`.
* Runs `npm install --omit=dev`.
* Preserves your existing `cards.db` and OCTGN image library.
* Restarts the `cute-mtg` service.

---

### Manual Systemd Service Configuration

To manually configure a Linux server from scratch:

1. **Install Node.js 22 LTS**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
   apt-get install -y nodejs unzip tar
   ```

2. **Setup Server Directory**:
   ```bash
   mkdir -p /opt/cute-mtg
   cd /opt/cute-mtg
   unzip -o /path/to/cute-mtg-web.zip -d /opt/cute-mtg/
   npm install --omit=dev
   ```

3. **Create Systemd Service (`/etc/systemd/system/cute-mtg.service`)**:
   ```ini
   [Unit]
   Description=Cute MTG LAN Game Server (Wifey: The Headpattening)
   After=network.target

   [Service]
   Type=simple
   User=root
   WorkingDirectory=/opt/cute-mtg
   ExecStart=/usr/bin/node /opt/cute-mtg/main.js
   Restart=always
   RestartSec=5
   Environment=NODE_ENV=production
   Environment=PORT=3000
   Environment=DB_PATH=/opt/cute-mtg/data/cards.db
   Environment=IMAGES_DIR=/opt/cute-mtg/images

   [Install]
   WantedBy=multi-user.target
   ```

4. **Enable & Start**:
   ```bash
   systemctl daemon-reload
   systemctl enable --now cute-mtg
   systemctl status cute-mtg
   ```

---

## Cards Database & OCTGN Image Management

The server uses a local SQLite database (`cards.db`) containing card records mapped to OCTGN set IDs and card IDs.

### Environment Variables

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP & WebSocket port |
| `DB_PATH` | `./data/cards.db` | Path to the SQLite card database |
| `IMAGES_DIR` | `./images` or OCTGN AppData | Directory containing cached/downloaded card art |

### Local Image Ingestion (`upload-octgn-images.ps1`)

If you have OCTGN card image packs installed on a Windows machine:
1. Open PowerShell and run:
   ```powershell
   .\upload-octgn-images.ps1
   ```
2. This archives `AppData\Local\Programs\OCTGN\Data\ImageDatabase\` into `octgn-images.tar` and transfers it to your server via `scp`.
3. The server extracts images to `/opt/cute-mtg/images/Sets/<SetId>/Cards/<CardId>.jpg`.
4. Any card art missing locally is automatically downloaded and cached from Scryfall on demand.

---

## Funny Mode (`/funnymode`) & Creature Audio

Cute MTG features a creature soundtrack engine that plays audio clips across **both connected machines** when creatures enter the battlefield.

* **Activation**:
  * Type **`/funnymode`** (or **`/funny`**) in the chat box, OR
  * Check the **`Funny Mode (/funnymode)`** box in the left player controls panel.
* **Audio Routing**:
  * When a creature card or token enters the battlefield from any zone (hand, library, graveyard, exile, command zone), its creature subtypes are detected.
  * The game attempts to stream and play audio from:
    `http://emily9121.free.fr/ogg/<creaturetypewithoutspace>.ogg`
    *(Example: Dinosaur $\rightarrow$ `http://emily9121.free.fr/ogg/dinosaur.ogg`)*.
* **Silent Failure**:
  * If the file returns a 404, the server is unreachable, or the player is offline, the feature fails 100% silently with no interruption to gameplay.
* **Reference Documentation**:
  * [`creature_types_ogg.md`](file:///c:/Users/Emily/Downloads/octgnclone/cute-mtg-lan/creature_types_ogg.md) — Reference table of all 394 creature types and their sound URLs.
  * [`creature_types_ogg.json`](file:///c:/Users/Emily/Downloads/octgnclone/cute-mtg-lan/creature_types_ogg.json) — JSON dictionary mapping creature types to OGG files.

---

## Controls, Hotkeys & Slash Commands

### Tabletop Perspective & Privacy
- **Reversed Opponent Perspective**: The top board is vertically flipped so that when your opponent drops cards on the front row of their battlefield, they meet yours right across the center dividing line.
- **Hidden Zone Privacy**: Moving cards from the library to the hand (via search, drag, or draw) is completely confidential—the chat log never reveals the card name.

### Global Hotkeys
| Key | Action |
| :---: | :--- |
| **D** | Draw 1 card |
| **S** | Scry 1 card (Right-click button for Scry X) |
| **U** | Untap all battlefield permanents (skips Stun counters and `🔒 No-Untap`) |
| **M** | London Mulligan / Deal opening 7 |
| **Enter / Space** | Pass Turn / Take Turn |
| **H** | Reveal / hide entire hand |
| **B** | Open sideboard explorer |
| **L / G** | Lose / gain 1 life |
| **P / E** | Add 1 poison / energy counter |
| **K** | Flip a coin |
| **6** | Roll a 6-sided die |
| **Y** | Roll the Planar die |
| **R** | Roll a 20-sided die |
| **Ctrl+Z / Ctrl+Y** | Undo / redo action |

### Card Hover Hotkeys
| Key | Action |
| :---: | :--- |
| **T** | Tap / untap permanent (or double-click card) |
| **N** | Toggle `🔒 No-Untap` restriction (card will not untap automatically) |
| **Q** | Transform double-faced card (DFC) / Flip preview face |
| **F** | Flip card face down / face up |
| **+ / -** | Add / remove +1/+1 counters |
| **] / [** | Temporary +1/+1 or -1/-1 buff (wears off at turn cleanup step) |
| **A** | Target card or opponent with attack arrow |
| **X** | Target with generic spell/ability arrow |
| **E** | Attach / equip to another permanent |
| **C** | Duplicate / clone card token |
| **V** | Reveal single card from hand to opponent |
| **? or /** | Instant Google rule search for the hovered card |
| **Delete** | Delete token / card |
| **Right-Click** | Add custom counters (Loyalty, Charge, Stun, +1/+1, etc.) |

### Chat Slash Commands
| Command | Action |
| :--- | :--- |
| `/funnymode` or `/funny` | Toggle Funny Mode creature entry soundtrack on both machines |
| `/rule <card name>` | Search MTG rules on Google for a specific card |
| `/roll <sides>` | Roll custom die (e.g. `/roll 20`, `/roll 100`) |
| `/d6` | Roll a d6 |
| `/planar` | Roll the MTG Planar Die |
| `/flip` or `/coin` | Flip a coin |
| `/mill <count>` | Mill top cards from library to graveyard |
| `/mulligan` | Start London Mulligan |
| `/restart` | Restart deck and reset life total with confirmation |
| `/clear` | Clear game log window |
| `/solitaire` | Trigger winning cards cascade animation |
| `/fliptable` / `/unflip` | Flip / unflip the table: `(╯°□°）╯︵ ┻━┻` |
| `/gay` | Rainbow pride celebration: `🏳️‍🌈` |
| `/headpats` | Send interactive headpats with sound effect |

---

## Deck Format Compatibility

You can load decks via **File > Load Deck (.o8d)** or drag-and-drop:

1. **OCTGN Deck Files (`.o8d`)**:
   Standard XML format exported by OCTGN. Automatically resolves commanders, companions, and sideboards based on section tags.
2. **Plain Text Decklists**:
   Standard line-by-line decklists copied from MTG Arena, MTGO, Moxfield, Archidekt, or Scryfall:
   ```
   1 Sol Ring
   1 Arcane Signet
   // Commander
   1 Ghalta, Primal Hunger
   // Sideboard
   1 Heroic Intervention
   ```

---

## License

This project is licensed under the ISC License. Magic: The Gathering is a trademark of Wizards of the Coast LLC. This fan project is not affiliated with or endorsed by Wizards of the Coast.
