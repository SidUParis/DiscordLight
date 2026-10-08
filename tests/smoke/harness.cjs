// Shared plumbing for the smoke suites: Playwright loading, web dir / screenshot dir, the PASS/FAIL report.
// Dev-only. Nothing under tests/ is copied into the app bundle (the Makefile only copies web/*).
"use strict";
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const INSTALL_HINT =
  "Playwright not found. Run `npm install` in tests/ (and `npx playwright install chromium` once).\n" +
  "找不到 playwright：请在 tests/ 目录下运行 `npm install`（首次还需 `npx playwright install chromium`）。";

// tests/node_modules first (normal module lookup, also NODE_PATH), then the global npm install
function loadPlaywright() {
  try {
    return require(require.resolve("playwright"));
  } catch (e) { /* fall through */ }
  try {
    const root = require("child_process")
      .execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .trim();
    return require(path.join(root, "playwright"));
  } catch (e) { /* fall through */ }
  console.error(INSTALL_HINT);
  process.exit(2);
}

async function launchChromium() {
  const { chromium } = loadPlaywright();
  try {
    return await chromium.launch();
  } catch (e) {
    if (/Executable doesn't exist|playwright install/i.test(String(e && e.message))) {
      console.error("Chromium for Playwright is missing: run `npx playwright install chromium` in tests/.\n" +
        "缺少 Playwright 的 Chromium：请在 tests/ 目录下运行一次 `npx playwright install chromium`。");
      process.exit(2);
    }
    throw e;
  }
}

// The web dir comes from argv[2]; default is the repo's web/ folder
function webDir() {
  const dir = path.resolve(process.argv[2] || path.join(__dirname, "../../web"));
  if (!fs.existsSync(path.join(dir, "index.html"))) {
    console.error(`No index.html in ${dir} (usage: node <suite>.cjs [path/to/web])`);
    process.exit(2);
  }
  return dir;
}

function indexUrl(dir) {
  return pathToFileURL(path.join(dir, "index.html")).href;
}

// tests/smoke/.shots/<suite>/ (gitignored)
function shotsDir(suite) {
  const dir = path.join(__dirname, ".shots", suite);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Prints one line per assertion and the "x/y assertions passed" line that run-all.cjs reads.
// The INFO dump (measured values) is printed on failure, or always with DL_TEST_VERBOSE=1.
function report(results, info) {
  const failed = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? "PASS  " : "FAIL  ") + r.name + (r.ok ? "" : "\n        -> " + JSON.stringify(r.detail))));
  console.log(`\n${results.length - failed.length}/${results.length} assertions passed`);
  if (info && (failed.length || process.env.DL_TEST_VERBOSE)) console.log("\nINFO " + JSON.stringify(info, null, 1));
  return failed.length ? 1 : 0;
}

function harnessFailed(e) {
  console.error("HARNESS FAILED", e);
  process.exit(2);
}

module.exports = { loadPlaywright, launchChromium, webDir, indexUrl, shotsDir, report, harnessFailed };
