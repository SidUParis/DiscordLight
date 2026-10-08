# DiscordLight Agent Specification (AGENTS.md)

> **Parent Specification**: Inherits from [`/Users/xu/Developer/AGENTS.md`](../../AGENTS.md) and [`developer-workflow`](../../.agents/skills/developer-workflow/SKILL.md).  
> **Project Scope**: `/Users/xu/Developer/projects/DiscordLight`  
> **Project Skill**: [`.agents/skills/discordlight-workflow/SKILL.md`](.agents/skills/discordlight-workflow/SKILL.md)  

---

## 1. Project Identity & Standard Operating Procedures

DiscordLight is a native macOS Discord client tailored for AI developer agent workflows.

- **Layer**: Layer 1 (`projects/` - Production Deliverable) in the Developer Workspace.
- **Remote Repo**: [https://github.com/SidUParis/DiscordLight](https://github.com/SidUParis/DiscordLight).
- **Installed App**: `/Applications/DiscordLight.app`.
- **System Config**: `~/.config/discordlight/config.json`.

---

## 2. Agent Execution Checklist

Before making changes to this project, any AI agent must:
1. Verify that changes keep the measured footprint (about 120 MB total incl. WebKit helpers, ~0.1–1 % CPU while polling); re-run `scripts/run-debug.command` after native or polling changes.
2. Ensure Touch Bar actions preserve `NSPopoverTouchBarItem` architecture to prevent IME keyboard candidate collision.
3. Keep frontend code in clean, vanilla ES6+ (no heavy npm build steps or frameworks).
4. Run pre-commit security audits to guarantee zero token or credential leaks.
5. Rebuild and install using `make build && make install` to verify packaging.
6. `src/main.m` is compiled with `-fobjc-arc` (see Makefile). Keep it that way: no manual `retain`/`release`/`autorelease`, use `__bridge`/`CFRelease` for Core Foundation objects, and keep `self.window.releasedWhenClosed = NO`. See HANDOVER.md §3.7.
7. After any front-end change (`web/`), run `make test` (headless smoke tests in `tests/`, mocked native bridge) and make sure every suite passes. `tests/` is dev-only (its npm dependency never reaches the app bundle).
8. Keychain/notification code paths need an app bundle; test with `make install` + the installed app, not the bare binary. See HANDOVER.md §3.10 and §3.11.
