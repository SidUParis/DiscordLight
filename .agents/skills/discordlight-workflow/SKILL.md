---
name: discordlight-workflow
description: >-
  Project-specific skill and runbook for developing, building, and maintaining DiscordLight.
  Enforces Cocoa + WebKit native architecture, NSTouchBar popover patterns, Discord interaction
  payloads, and strict zero-credential-leak security protocols.
---

# DiscordLight Project Skill & Runbook

This skill defines the development workflows, build procedures, and architecture rules for **DiscordLight** (`/Users/xu/Developer/projects/DiscordLight`), inheriting from the global `/Users/xu/Developer` specification (`AGENTS.md` and `developer-workflow`).

---

## 1. Project Overview & Architecture Principles

- **Location**: `/Users/xu/Developer/projects/DiscordLight` (Layer 1: Projects).
- **Architecture**:
  - **Host Layer (`src/main.m`)**: Pure Objective-C Cocoa (`NSApplication`, `NSWindow`, `WKWebView`, `NSTouchBar`).
  - **Frontend UI (`web/`)**: Vanilla HTML5, modern Obsidian dark theme CSS, responsive vanilla JS (`app.js`).
  - **Target Metrics**: Idle CPU 0%, Memory < 80MB, cold start < 1s.
- **Zero-Dependency Core**: Compiles directly with system `clang` and Cocoa/WebKit frameworks. Never introduce Electron or heavy node runtimes into production.

---

## 2. Build, Test & Install SOPs

### Quick Commands:
```bash
# 1. Compile native binary & package app bundle:
make build

# 2. Deploy directly to /Applications:
make install

# 3. Clean local build artifacts:
make clean

# 4. Launch app:
open /Applications/DiscordLight.app
```

### Frontend Hot Reloading & Debugging:
- The Cocoa host enables `developerExtrasEnabled = YES`.
- Right-click anywhere in the app to open Safari Web Inspector (DOM, Console, Network).
- Press `Cmd + R` inside Web Inspector to hot-reload frontend changes without recompiling Objective-C.

---

## 3. NSTouchBar Development Rules

1. **IME Keyboard Collision Prevention**:
   - Always use `NSPopoverTouchBarItem` (`@ 智能体` and `# 频道`) for mention and channel switchers.
   - Never place raw text-inserting buttons directly on the root bar where Pinyin/IME candidate bars will push them off-screen.
2. **Context-Aware Dynamic Synchronization**:
   - When switching channels or receiving messages from new bots/members, JS triggers `syncTouchBarState`.
   - The native layer dynamically refreshes secondary touch bar items to match the active channel context.

---

## 4. Discord Interaction Components SOP

When implementing or modifying bot interactions (e.g. `Allow Session`, `Allow Once`, `Deny`):
- Never emit fake plain-text messages to chat.
- Always intercept `type: 2` button clicks and send a valid Discord `type: 3` Component Interaction Payload via the native bridge (`sendInteraction`).
- Include `message_id`, `channel_id`, `custom_id`, and `application_id`.

---

## 5. Security & Credential Hygiene

- **Strict Zero-Leak Rule**:
  - Never hardcode Discord tokens, user snowflakes, or private secrets in source files or git history.
  - Token discovery sequence:
    1. `DISCORD_TOKEN` environment variable
    2. Local file `~/.config/discordlight/config.json` (outside git)
    3. UI Onboarding modal on first run
- **Pre-Commit Check**:
  ```bash
  git diff | grep -iE 'token|secret|password|bearer|mfa'
  ```
