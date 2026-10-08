# DiscordLight ⚡️

A native, ultra-lightweight macOS client for Discord tailored for AI developer agent workflows. Built with Objective-C Cocoa and WKWebView — **0% idle CPU, < 80 MB RAM**, and zero Electron bloat.

English | [中文说明](./README_CN.md) | [Handover Doc](./HANDOVER.md)

---

## ✨ Features

- **🚀 Ultra Lightweight & Native**
  - Consumes **< 80 MB RAM** (vs 1.5 GB+ on the official Electron client).
  - Stays at **0% CPU** during idle, saving battery on MacBook Pro / Air.
  - Native macOS dark UI (Graphite Console): monochrome stroke icons, agent-first approval cards.

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
├── Makefile                 # One-command build and install targets
├── build.sh                 # Shell build script
├── src/
│   ├── main.m               # Cocoa host, WKWebView bridge & NSTouchBar controller
│   └── Info.plist           # macOS bundle metadata
├── web/
│   ├── index.html           # Lightweight modern web DOM
│   ├── style.css            # Graphite Console theme (native macOS dark)
│   └── app.js               # Client logic, interactions & autocomplete
└── assets/
    ├── AppIcon.icns         # High-resolution squircle app icon
    └── touchbar_icon.png    # Monochrome Touch Bar glyph
```

---

## 📄 License

MIT License. See [LICENSE](./LICENSE) for details.
