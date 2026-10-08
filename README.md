# DiscordLight ⚡️

A native, ultra-lightweight macOS client for Discord tailored for AI developer agent workflows. Built with Objective-C Cocoa and WKWebView — **0% idle CPU, < 80 MB RAM**, and zero Electron bloat.

English | [中文说明](./README_CN.md) | [Handover Doc](./HANDOVER.md)

---

## ✨ Features

- **🚀 Ultra Lightweight & Native**
  - Consumes **< 80 MB RAM** (vs 1.5 GB+ on the official Electron client).
  - Stays at **0% CPU** during idle, saving battery on MacBook Pro / Air.
  - Native macOS dark UI (Graphite Console): monochrome stroke icons, agent-first approval cards.
  - Incremental polling with background throttling: each poll asks only for messages newer than the newest one shown (an idle poll returns nothing and touches no DOM), and the interval drops from 2.5 s to 15 s while the window is hidden or covered.

- **🎛 Advanced Touch Bar Integration**
  - **Persistent `@ Agents` Popover**: Resolves the classic Touch Bar conflict where system IME candidate bars push away mention shortcuts. Tap `@ Agents` at any time during typing to insert a bot mention without losing cursor focus.
  - **Dynamic Multi-Channel Detection**: Touch Bar dynamically updates its bot shortcuts and channel switchers as you navigate between different channels.
  - **Pinned Channels Popover**: Instant switching between your designated workspace channels.

- **🤖 True Discord Component Interactions**
  - Full support for interactive buttons (`type: 3` Discord message components) sent by AI agents like Hermes, AutoGPT, Claude, or custom bots (e.g. `Allow Once`, `Allow Session`, `Deny`).
  - Sends authentic API interaction payloads with nonce and session IDs — no fake chat messages.

- **🧵 Threads & Agent Workflows**
  - Automatic thread cards with real-time reply counters and one-click thread navigation.
  - Terminal-style code block rendering with 1-click clipboard copying.
  - Keyboard-driven `@` autocomplete popover supporting bot aliases, IDs, and usernames.

- **🔒 100% Local & Privacy-Preserving**
  - Direct HTTPS communication between your local machine and Discord API v10.
  - No middleman servers, no tracking, no analytics.
  - Tokens and configuration are stored exclusively in your local `~/.config/discordlight/config.json`.

---

## 🛠 Prerequisites

- macOS 10.15 (Catalina) or newer (Apple Silicon M1/M2/M3/M4 & Intel fully supported).
- Xcode Command Line Tools (`xcode-select --install`).

---

## 🚀 Quick Start

### 1. Build from Source

```bash
git clone git@github.com:SidUParis/DiscordLight.git
cd DiscordLight
make build
```

To install directly to `/Applications`:

```bash
make install
```

Or double-click `scripts/build-and-run.command` in Finder: it builds, installs and relaunches the app (log in `scripts/last-build.log`).

Run the smoke tests (dev only, Node ≥ 18; first time: `cd tests && npm install && npx playwright install chromium`): `make test`. They mock the native bridge and never contact Discord; see [tests/README.md](./tests/README.md).

### 2. Configure Token

DiscordLight supports two secure configuration methods:

1. **In-App Onboarding**: On first launch, DiscordLight will show a clean setup modal prompting you to enter your Discord token. It will be safely written to `~/.config/discordlight/config.json`.
2. **Environment Variable**:
   ```bash
   export DISCORD_TOKEN="your_token_here"
   open DiscordLight.app
   ```

> **Note**: Your token is stored only on your local machine and is never transmitted anywhere other than the official `discord.com/api` endpoints.

---

## 📁 Project Architecture

```
DiscordLight/
├── Makefile                 # build / install / clean / test targets
├── build.sh                 # Shell build script
├── scripts/
│   ├── build-and-run.command  # Double-click: build, install and relaunch
│   └── run-debug.command      # 90 s foreground run sampling RSS/CPU, captures crash reports
├── src/
│   ├── main.m               # Cocoa host, WKWebView bridge & NSTouchBar controller
│   └── Info.plist           # macOS bundle metadata
├── web/
│   ├── index.html           # Lightweight modern web DOM
│   ├── style.css            # Graphite Console theme (native macOS dark)
│   └── app.js               # Client logic, polling, interactions & autocomplete
├── assets/
│   ├── AppIcon.icns         # App icon (original graphite tile + amber bolt)
│   ├── AppIcon.png          # 1024 px icon master
│   ├── touchbar_icon.png    # Touch Bar glyph
│   └── make_icon.py         # Regenerates the icon files (Pillow + numpy)
└── tests/                   # Dev-only headless smoke tests (never shipped in the app)
    ├── package.json         # playwright as the only devDependency
    ├── README.md
    └── smoke/               # run-all.cjs + suites, shared mock bridge
```

---

## 📄 License

MIT License. See [LICENSE](./LICENSE) for details.
