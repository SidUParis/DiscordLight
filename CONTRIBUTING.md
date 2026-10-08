# Contributing to DiscordLight

Thanks for helping. DiscordLight is small on purpose: a Cocoa host in one Objective-C file, a plain HTML / CSS / JS front end, and no build step. Contributions that keep it that way are the easiest to merge.

The full technical handover, in Chinese, is [HANDOVER.md](./HANDOVER.md): architecture (§3), security rules (§4), build and debugging (§5), roadmap (§6). Please skim the section that matches your change before you start.

## Build and run

Requirements: macOS 10.15 or later and the Xcode Command Line Tools (`xcode-select --install`). Full Xcode is not needed.

```bash
make build     # builds ./DiscordLight.app (clang -fobjc-arc ... -Wall, then an ad-hoc codesign)
make install   # builds and copies the app to /Applications
make clean
```

`scripts/build-and-run.command` does `make build && make install` and relaunches the app (log in `scripts/last-build.log`). `scripts/run-debug.command` runs the installed app for 90 s, samples RSS / CPU and collects crash reports (`scripts/last-run.log`).

Changes in `web/` can be reloaded in the running app: right-click, Inspect Element, then ⌘R in the Web Inspector. Changes in `src/main.m` need `make install` and a relaunch.

To skip the Keychain prompt that appears after every rebuild, quit the app and start it with `DISCORD_TOKEN="…" open /Applications/DiscordLight.app`. Never put a token in a script, a shell profile or any file in the repo.

## Tests

The smoke tests open `web/index.html` in headless Chromium with a mocked native bridge. They need no token and never contact Discord. Node 18 or later:

```bash
(cd tests && npm install && npx playwright install chromium)   # once
make test                                                        # 8 suites, prints one summary line per suite
```

Run `make test` before every pull request that touches `web/`; CI runs the same suites. If one of the polling suites fails on a busy machine, run it again once (they contain timing assertions). Native behaviour (Keychain, notifications, Dock badge, Touch Bar) is not covered: test it with `make install` and the installed app. How to add a test case: [tests/README.md](./tests/README.md).

## Rules for the code

- **Front end: vanilla JavaScript only.** No frameworks, no bundler, no npm dependency in `web/`. `tests/` is the only place with an npm dependency, and it never ships in the app.
- **`src/main.m` is compiled with ARC (`-fobjc-arc`).** Keep it that way: no `retain` / `release` / `autorelease`, use `__bridge` / `CFRelease` for Core Foundation objects, keep `self.window.releasedWhenClosed = NO`. `make build` should stay at zero warnings.
- **No emoji in the UI.** Icons are monochrome stroke SVGs from the `ICONS` table in `app.js`; colours, radii and fonts come from the CSS variables at the top of `style.css`.
- **Escape before you render.** Every external string that goes into `innerHTML` goes through `escapeHTML`; Markdown rules work on the escaped text; no inline `onclick` built from data (use `data-act` and the delegated listeners); every generated `href` / `src` must be http(s). See HANDOVER §4.3.
- **The token never reaches the web layer.** `getConfig` does not return it; only `main.m` puts it in request headers.
- **Keep it light.** Measure with `scripts/run-debug.command` after changes to `main.m` or to polling, and mention the numbers in the pull request if they moved.
- **Bridge contracts are shared with `main.m`.** Renaming a `window.*` function that the native side calls, or a field of a bridge payload, breaks the app silently. HANDOVER §3.1 lists them.

## Before you open a pull request

1. `make build` passes without warnings.
2. `make test` passes (for any change in `web/`).
3. No secrets in the diff: `git diff | grep -iE 'token|secret|password|bearer|mfa'` shows nothing that is a real credential.
4. User-visible changes are reflected in `README.md` and `README_CN.md`; behaviour changes in `HANDOVER.md` (a short Chinese note is fine, the maintainer can polish it).
5. UI changes come with a before / after screenshot.

## Commit style

- One logical change per commit, subject line in the imperative, about 72 characters at most: `Keep approval cards resolved after a resync`.
- An optional area prefix helps: `web:`, `native:`, `tests:`, `docs:`, `ci:`.
- Explain the why in the body when it is not obvious from the diff.

## Reporting bugs and security issues

Bugs and feature ideas: open an issue with the templates. Security problems: please do not open a public issue; see [SECURITY.md](./SECURITY.md).
