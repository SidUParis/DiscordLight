// Runs every smoke suite in sequence (one browser at a time, so the polling timings are not disturbed) and exits
// non-zero if any suite fails. Usage: node run-all.cjs [path/to/web]   (default: ../../web)
// DL_TEST_VERBOSE=1 also prints each suite's INFO dump (measured values) when it passes.
"use strict";
const { spawn } = require("child_process");
const path = require("path");
const { webDir, loadPlaywright } = require("./harness.cjs");

loadPlaywright(); // fail once with the install hint instead of once per suite

const SUITES = [
  ["ui", "run-ui.cjs"],
  ["links", "run-links.cjs"],
  ["mentions", "run-mentions.cjs"],
  ["polling", "run-polling.cjs"],
  ["polling-edge", "run-polling-edge.cjs"],
  ["fuzz-markdown", "fuzz-markdown.cjs"]
];

const WEB = webDir();

function runSuite(file) {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(__dirname, file), WEB], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", d => { out += d; process.stdout.write(d); });
    child.stderr.on("data", d => { out += d; process.stderr.write(d); });
    child.on("close", code => resolve({ code, out, secs: (Date.now() - started) / 1000 }));
  });
}

(async () => {
  console.log(`web dir: ${WEB}\n`);
  const summary = [];
  for (const [name, file] of SUITES) {
    console.log(`==== ${name} (${file}) ====`);
    const { code, out, secs } = await runSuite(file);
    const m = out.match(/(\d+)\/(\d+) assertions passed/);
    const counts = m ? `${m[1]}/${m[2]} assertions` : "no assertion summary";
    const verdict = code === 0 ? "PASS " : (code === 1 ? "FAIL " : "ERROR");
    summary.push({ ok: code === 0, line: `${verdict} ${name.padEnd(14)} ${counts.padEnd(20)} ${secs.toFixed(1).padStart(5)} s` });
    console.log("");
  }
  console.log("==== smoke summary ====");
  summary.forEach(s => console.log(s.line));
  const passed = summary.filter(s => s.ok).length;
  console.log(`${passed}/${summary.length} suites passed`);
  process.exit(passed === summary.length ? 0 : 1);
})();
