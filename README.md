# DiscordLight ⚡

**A native macOS Discord client for people who talk to AI agents all day. About 120 MB of memory, no Electron.**

[![CI](https://github.com/SidUParis/DiscordLight/actions/workflows/ci.yml/badge.svg)](https://github.com/SidUParis/DiscordLight/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/SidUParis/DiscordLight?sort=semver)](https://github.com/SidUParis/DiscordLight/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Platform: macOS 10.15+](https://img.shields.io/badge/platform-macOS%2010.15%2B-lightgrey)

English | [中文说明](./README_CN.md) | [Handover (中文)](./HANDOVER.md)

![DiscordLight: a channel with an agent's summary, a thread, an image and a pending approval card](./docs/screenshot-main.png)

| **≈ 120 MB** | **0.1–1.2 % CPU** | **2.5 s → 15 s** |
| :---: | :---: | :---: |
| memory, app + WebKit helper processes | window visible, polling | poll interval, visible → hidden |

<sub>Measured with <code>scripts/run-debug.command</code> on an Intel MacBook Pro (15,4), macOS 15.8.1, DiscordLight 1.2.0, signed in to a real account and polling: host process 58 MB after 90 s (about 80 MB peak in the first seconds), WebKit WebContent / Networking / GPU processes about 60 MB more.</sub>

## Why

- **An older Intel MacBook and loud fans.** The official client is an Electron app, a whole Chromium of its own; DiscordLight is one Objective-C file on top of the WebKit that macOS already has.
- **Agents are the workflow.** Most of the day goes to talking with AI agents and answering their "may I run this?" prompts. Those deserve a real UI, not a row of small buttons.
- **Nothing to build but the app.** Plain HTML, CSS and JavaScript, compiled with `clang` from the Command Line Tools.

## Read this first

> [!WARNING]
> **Use at your own risk.** DiscordLight signs in with your Discord **user token** and talks to the official Discord API directly. Third-party clients and the use of user tokens are against Discord's Terms of Service, and accounts have been actioned for it. DiscordLight does nothing automated on your behalf (messages and button clicks are sent only when you send or click them), but the risk is yours. A bot-token mode is on the roadmap.
>
> DiscordLight is an independent open-source project and is not affiliated with or endorsed by Discord Inc.

## Features

### Agent workflow

- **Approval cards.** Tool-permission prompts from agents (Allow once / Allow session / Deny) render as one card with the request inside, including commands and embeds. A click sends a real Discord component interaction, and the card switches to its resolved state.
- **Touch Bar.** `@ Agents`, `@ Members` and `# Channels` popovers that stay usable while the input method's candidate bar is showing.
- **Mentions.** `@` autocomplete, plus one-click agent chips under the composer; in group DMs the human members are listed separately.
- **Threads** as cards with reply counts, one click to open.
- **Rich messages.** Markdown, code blocks with a copy button, embeds, image and file attachments, scroll-back history.
- **Notifications.** macOS notifications and a Dock badge for mentions, DMs and approval requests while the window is not focused.

<img src="./docs/screenshot-approval.png" width="560" alt="A pending approval card: the agent asks to run a bash command, with Allow Once, Allow Session and Deny buttons">

### Native and light

- Native macOS dark UI ("Graphite Console"): monochrome stroke icons, hidden title bar.
- Sidebar with ⌘K search across group DMs, DMs, members and channels, and collapsible sections (pinned / group DMs and DMs / servers).
- Incremental polling: each poll asks only for messages newer than the newest one shown, and an empty answer touches no DOM. Every 2.5 s while the window is visible, every 15 s while it is hidden.

### Privacy and security

- Token stored in the macOS Keychain, moved there automatically from the old `config.json` on first launch. The web layer never sees it.
- No telemetry, no analytics, no third-party servers: requests go from your Mac to Discord.
- XSS-hardened renderer: message content is escaped before Markdown, no inline event handlers, http(s)-only links and images.
- A navigation policy keeps the app's WebView on local files; http(s) links open in your browser.

## Install

Requires macOS 10.15 or later, Apple Silicon or Intel.

### Download a release

1. Download `DiscordLight-vX.Y.Z-macOS.dmg` (or the `.zip`) from [Releases](https://github.com/SidUParis/DiscordLight/releases). To check it, compare `shasum -a 256 <file>` with the line in `SHA256SUMS.txt`.
2. Drag DiscordLight to Applications.
3. The app is ad-hoc signed and **not notarized** by Apple, so macOS blocks the first launch:
   - macOS 14 or earlier: right-click (Control-click) the app, choose **Open**, then **Open** again.
   - macOS 15 or later: try to open it once, then go to System Settings > Privacy & Security and click **Open Anyway**.
   - Or, on any version: `xattr -d com.apple.quarantine /Applications/DiscordLight.app`

### Build from source

Needs the Xcode Command Line Tools (`xcode-select --install`), not full Xcode.

```bash
git clone https://github.com/SidUParis/DiscordLight.git
cd DiscordLight
make install    # builds DiscordLight.app and copies it to /Applications
```

`make build` alone builds `./DiscordLight.app` without installing it.

### Double-click

`scripts/build-and-run.command` in Finder builds, installs and relaunches the app. The log goes to `scripts/last-build.log`.

### First launch

1. **Keychain.** When macOS asks whether DiscordLight may use its Keychain item, click **Always Allow**. The app is ad-hoc signed, so every new build looks like a different app to the Keychain: after each rebuild from source (and after updating to a new release) it asks once more.
2. **Notifications.** Allow them if you want banners for mentions, DMs and approval requests.
3. **Token.** The setup window asks for your Discord token. To find it:
   1. Open Discord in Chrome or Safari and sign in.
   2. Press ⌥⌘I to open the developer tools and switch to the Network tab.
   3. Click any request (for example `/messages`) and copy the `Authorization` value from the Request Headers.

   Treat the token like a password: anyone who has it can act as you.

Or skip the setup window and the Keychain: quit the app completely, then start it from a terminal with the token in the environment.

```bash
DISCORD_TOKEN="your_token_here" open /Applications/DiscordLight.app
```

Do not put the token in a shell profile, a script or any file you might commit.

## Keyboard and Touch Bar

| Keys | Where | What it does |
| :--- | :--- | :--- |
| ⌘K or ⌘F | anywhere | Focus the sidebar search (Command only: Ctrl+K and Ctrl+F stay text-editing keys) |
| Enter | search | Open the first result |
| Esc | search | Clear the search; press again to go back to the composer |
| Enter | composer | Send |
| Shift+Enter | composer | New line |
| ↑ ↓, then Enter or Tab | @ popup | Pick and insert a mention; Esc closes it |

| Touch Bar item | What it does |
| :--- | :--- |
| `@ 智能体 (n)` (Agents) | The agents in the current channel; tap one to insert `@name`. The first agent also gets its own button. |
| `@ 成员 (n)` (Members) | Group DMs only: the human members, same behaviour |
| `# 频道` (Channels) | Your pinned channels, tap to switch (shown when more than one is pinned) |
| `刷新` (Refresh) | Reload the current channel |
| Logo | Jump to the newest message and focus the composer |

All of these stay reachable while the input method's candidate bar is on the Touch Bar.

## Not yet

- **No Gateway (WebSocket) connection yet.** So no typing indicators, no presence and no unread badges for other channels; only the open channel is polled, so notifications cover that channel only. Edits made by others show up within about 30 s (about 3 min while the window is hidden).
- No light mode.
- Select menus in bot messages are shown but not clickable.
- No voice.
- Masked links (`[text](url)`) in embeds are not parsed yet: the brackets show as text, the URL is still a link.
- Scroll-back stops at 400 messages.
- Builds are not signed with a Developer ID or notarized (see Install).

## Roadmap

1. **Bot-token mode**, so DiscordLight can run without a user token.
2. **Gateway WebSocket**: live messages and edits, notifications and unread markers for every channel, polling only as a fallback.
3. Developer ID signing and notarization.
4. Clickable select menus and modals.
5. Light mode that follows the system appearance.
6. Masked links.

Planned, not scheduled. Ideas and pull requests are welcome.

## How it compares

| Client | Memory (all processes) | CPU, window visible | How it was measured |
| :--- | :--- | :--- | :--- |
| DiscordLight 1.2.0 | ≈ 120 MB | 0.1–1.2 % | `scripts/run-debug.command`, Intel MacBook Pro 15,4, macOS 15.8.1, real account, polling every 2.5 s |
| Official Discord app | ? | ? | Not measured yet |

Measured either client on your Mac? Open a pull request that adds a row with your machine, macOS version, versions and method.

## Development

```
DiscordLight/
├── .github/
│   ├── workflows/ci.yml          # smoke tests (Ubuntu) and make build (macOS) on push / PR to main
│   ├── workflows/release.yml     # on a v* tag: build, package, publish a GitHub Release
│   ├── ISSUE_TEMPLATE/           # bug report, feature request
│   └── PULL_REQUEST_TEMPLATE.md
├── src/
│   ├── main.m                    # Cocoa host: window, WebKit bridge, navigation policy, Touch Bar, Keychain, notifications
│   └── Info.plist
├── web/                          # the UI, vanilla HTML / CSS / JS, no build step
│   ├── index.html
│   ├── style.css                 # Graphite Console theme
│   └── app.js                    # API calls through the bridge, polling, rendering, approvals, search
├── assets/                       # app icon (AppIcon.icns / .png), Touch Bar glyph, make_icon.py
├── scripts/
│   ├── build-and-run.command     # double-click: build, install, relaunch
│   ├── run-debug.command         # 90 s run sampling RSS / CPU, collects crash reports
│   └── package.sh                # release packaging: universal build, .zip, .dmg, SHA256SUMS.txt
├── tests/                        # dev-only Playwright smoke tests with a mocked bridge (never in the app)
├── docs/                         # README screenshots and make-screenshots.cjs
├── Makefile                      # build / install / clean / test
├── build.sh
├── HANDOVER.md                   # full technical handover (Chinese)
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE
```

Smoke tests (Node 18 or later; 8 suites, 239 assertions, mocked native bridge, never contact Discord):

```bash
(cd tests && npm install && npx playwright install chromium)   # once
make test
```

Details in [tests/README.md](./tests/README.md) (Chinese). The screenshots above come from the real `web/` front end with fictional data: `node docs/make-screenshots.cjs`.

The architecture, the bridge contract, the security rules and the build details are in [HANDOVER.md](./HANDOVER.md) (Chinese). How to contribute: [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security

The token lives in the macOS Keychain, nothing is sent anywhere but Discord, and message content is escaped before it is rendered. To report a vulnerability privately, see [SECURITY.md](./SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
