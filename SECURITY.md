# Security policy

DiscordLight holds a Discord user token and renders messages written by other people, so security reports are very welcome.

## Supported versions

Only the latest release (and `main`) gets fixes.

## Reporting a vulnerability

Please report privately, not in a public issue:

1. **GitHub private vulnerability reporting** (preferred): on the repository page, open the **Security** tab and choose **Report a vulnerability**.
2. **Email** the maintainer: [see GitHub profile].

Please include the DiscordLight version, your macOS version, the steps or the message content that triggers the problem, and what an attacker could do with it.

**Never include your Discord token** (or anyone else's) in a report, a screenshot or a log. If you think a token has leaked, change your Discord password: that invalidates the token.

This is a small, independently maintained project. Reports are handled on a best-effort basis; you will get an answer, and a fix if the issue is confirmed, as soon as possible. Credit in the release notes is offered unless you prefer otherwise.

## In scope

- Anything that lets message content, an embed, an attachment, a username or a bot component run script in the WebView, change the page outside its intended rendering, or reach the native bridge.
- Leaks of the token: to the web layer, to disk outside the macOS Keychain, to logs, or to any host other than Discord.
- Bypasses of the navigation policy (the bridge WebView must only show local files; http(s) links go to the system browser).
- The debug entry points described in HANDOVER.md §4.3 being reachable in a normal launch.

## Out of scope

- The account risk of using a user token with a third-party client. That is a Terms of Service matter with Discord, explained in the README, not a vulnerability.
- Problems in Discord's own API or services.
- Attacks that require an attacker who already controls your Mac or your user account.

## What the app does to stay safe

- The token is stored in the macOS Keychain and is only added to request headers by the native host; the web layer never receives it.
- No telemetry, no analytics, no third-party servers: requests go from your Mac to Discord.
- Message content is HTML-escaped before Markdown is applied; no inline event handlers are built from data; links and images must be http(s).
- A navigation policy keeps the bridge WebView on local files and hands http(s) links to the system browser.

Details: [HANDOVER.md](./HANDOVER.md) §3.10 (Keychain) and §4 (security rules, in Chinese).
