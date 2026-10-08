## What and why

<!-- One or two sentences. Link the issue if there is one. -->

## How it was tested

<!-- make test output summary, manual steps in the installed app, screenshots for UI changes. -->

## Checklist

- [ ] `make build` passes with zero warnings
- [ ] `make test` passes (required for changes in `web/`)
- [ ] Front end stays vanilla JS: no framework, no bundler, no new npm dependency outside `tests/`
- [ ] `src/main.m` stays ARC-clean (no `retain` / `release` / `autorelease`)
- [ ] No emoji in the UI; new styles use the CSS variables in `style.css`
- [ ] External strings are escaped before they reach `innerHTML`; new `href` / `src` values are http(s) only
- [ ] No token, password or other secret in the diff
- [ ] README / README_CN / HANDOVER updated if behaviour or setup changed
