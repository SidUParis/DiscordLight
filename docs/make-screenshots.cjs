// Renders the README screenshots from the real front end (web/) with a mocked native bridge.
//
//   node docs/make-screenshots.cjs [path/to/web]      (default: the repo's web/)
//
// Writes docs/screenshot-main.png (1280x800 @2x) and docs/screenshot-approval.png (760x420 @2x, around the approval
// card). Needs Playwright + Chromium, the same as the smoke tests (see tests/README.md). Nothing reaches Discord:
// the bridge is tests/smoke/mock-bridge.cjs with the actions below overridden, and every non-file request (the
// attachment image) is answered locally.
//
// All content is fictional: the user "Mia", the server "Mia's Lab", the people "Alex" and "Sam". The UI chrome stays
// Chinese because that is the app's language. Off macOS there is no SF Pro / PingFang, so the font variables are
// pointed at Inter / Noto Sans CJK SC / DejaVu Sans Mono when installed (closest look); on macOS the app's own stack is used.
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { launchChromium, webDir, indexUrl } = require("../tests/smoke/harness.cjs");
const { mockBridge } = require("../tests/smoke/mock-bridge.cjs");

const WEB = webDir();
const OUT = __dirname;

// ---------- a tiny PNG encoder for the attachment placeholder ----------
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xFF;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makePNG(w, h, pixel) {
  const stride = w * 3 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * stride + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// 400x220 placeholder "figure": dark panel, faint grid, two series of bars, a baseline
const FIGURE = (() => {
  const W = 400, H = 220, base = 188, left = 36, right = 380;
  const groups = [[0.62, 0.48], [0.80, 0.71], [0.55, 0.60], [0.92, 0.77], [0.70, 0.52]];
  const colors = [[110, 168, 254], [143, 211, 199]];
  const span = (right - left) / groups.length;
  return makePNG(W, H, (x, y) => {
    let rgb = [30, 31, 35];
    if (y > 20 && y < base && (base - y) % 34 === 0 && x >= left && x <= right) rgb = [44, 45, 50];
    const g = Math.floor((x - left) / span);
    if (g >= 0 && g < groups.length) {
      const off = x - left - g * span;
      for (let s = 0; s < 2; s++) {
        const x0 = 14 + s * 22;
        if (off >= x0 && off < x0 + 18 && y < base && y >= base - groups[g][s] * 150) rgb = colors[s];
      }
    }
    if (y === base && x >= left - 4 && x <= right) rgb = [96, 98, 108];
    return rgb;
  });
})();

// Runs in the page after mockBridge(): Mia's fictional workspace, numeric snowflake ids, an after / before-aware fetchMessages
function screenshotFixtures() {
  const bridge = window.webkit.messageHandlers.discordBridge;
  const orig = bridge.postMessage;
  const at = (hh, mm) => new Date(Date.UTC(2026, 9, 8, hh - 2, mm, 0)).toISOString(); // Europe/Paris is UTC+2 in October
  const me = { id: "100000000000000001", username: "mia", global_name: "Mia" };
  const alex = { id: "100000000000000002", username: "alex", global_name: "Alex" };
  const sam = { id: "100000000000000003", username: "sam", global_name: "Sam" };
  const paper = { id: "1491193341612654642", username: "paper-hermes", bot: true }; // shown as "Paper Hermes" (KNOWN_BOTS in app.js)
  const guild = { id: "200000000000000001", name: "Mia's Lab", owner: true };
  const ch = { lab: "300000000000000001", notes: "300000000000000002", general: "300000000000000003" };
  const img = (host) => `https://${host}/attachments/300000000000000001/400000000000000001/draft-figure-2.png`;

  // Newest first, like the Discord API. Three messages so everything fits in the 800 px window: Mia's request with her
  // figure, the agent's summary (embed + thread), and the agent's pending approval prompt.
  const messages = [
    { id: "400000000000000003", author: paper, timestamp: at(9, 17),
      content: "To compare the numbers I need to run this in your workspace:\n```bash\npython compare.py --paper 2507.04224 --figure draft-figure-2.png\n```",
      components: [{ type: 1, components: [
        { type: 2, style: 3, label: "Allow Once", custom_id: "allow_once:403" },
        { type: 2, style: 1, label: "Allow Session", custom_id: "allow_session:403" },
        { type: 2, style: 4, label: "Deny", custom_id: "deny:403" }
      ] }] },
    { id: "400000000000000002", author: paper, timestamp: at(9, 14), content: "",
      embeds: [{ type: "rich", color: 0xB9B2FF, title: "Summary: arXiv 2507.04224", url: "https://arxiv.org/abs/2507.04224",
        fields: [{ name: "Read time", value: "6 min", inline: true }, { name: "Open questions", value: "3", inline: true }] }],
      thread: { id: "600000000000000001", name: "Follow-up papers", message_count: 12 } },
    { id: "400000000000000001", author: me, timestamp: at(9, 12),
      content: "<@1491193341612654642> summarise arXiv 2507.04224 for Thursday's reading group, and check my draft figure against it.",
      mentions: [paper],
      // The PNG is 400x220; the declared size keeps the same ratio but smaller, so the whole conversation fits on screen
      attachments: [{ id: "500000000000000009", filename: "draft-figure-2.png", content_type: "image/png", size: 18432,
        width: 240, height: 132, url: img("cdn.discordapp.com"), proxy_url: img("media.discordapp.net") }] }
  ];

  const answers = {
    getConfig: () => ({ hasToken: true, last_channel_id: ch.lab, pinned_channels: [
      { id: ch.lab, name: "# agents-lab", server: "Mia's Lab", icon: "channel" }
    ] }),
    fetchCurrentUser: () => ({ user: me }),
    fetchDMs: () => ({ dms: [
      { id: "700000000000000001", type: 3, name: "Hermes 研究组", last_message_id: "400000000000000090", recipients: [alex, sam] },
      { id: "700000000000000002", type: 1, last_message_id: "400000000000000080", recipients: [alex] }
    ] }),
    fetchGuilds: () => ({ guilds: [guild] }),
    fetchGuildChannels: () => ({ channels: [
      { id: ch.lab, name: "agents-lab", type: 0 }, { id: ch.notes, name: "paper-notes", type: 0 }, { id: ch.general, name: "general", type: 0 }
    ] }),
    fetchMessages: (msg) => {
      if (msg.channelId !== ch.lab) return { messages: [] };
      if (msg.after !== undefined) return { messages: messages.filter(m => BigInt(m.id) > BigInt(msg.after)) };
      if (msg.before !== undefined) return { messages: messages.filter(m => BigInt(m.id) < BigInt(msg.before)).slice(0, msg.limit) };
      return { messages: messages.slice(0, msg.limit) };
    }
  };
  bridge.postMessage = function (msg) {
    const fn = answers[msg.action];
    if (!fn) return orig.call(this, msg);
    window.__calls.push(JSON.parse(JSON.stringify(msg)));
    setTimeout(() => window[msg.callback] && window[msg.callback](JSON.parse(JSON.stringify(fn(msg)))), 5);
  };
}

// The native window draws its traffic lights over the sidebar's 38px top band; the page leaves that band empty.
// Draw them in the screenshot so it reads like the real window (purely visual, outside the app's DOM logic).
function addWindowChrome() {
  const bar = document.createElement("div");
  bar.setAttribute("aria-hidden", "true");
  bar.style.cssText = "position:fixed;top:13px;left:13px;display:flex;gap:8px;z-index:9999;pointer-events:none";
  ["#FF5F57", "#FEBC2E", "#28C840"].forEach(c => {
    const dot = document.createElement("span");
    dot.style.cssText = `width:12px;height:12px;border-radius:50%;background:${c};box-shadow:inset 0 0 0 0.5px rgba(0,0,0,.25)`;
    bar.appendChild(dot);
  });
  document.body.appendChild(bar);
}

const FONT_OVERRIDE = `:root {
  --font-sans: "Inter", "Noto Sans CJK SC", -apple-system, "Helvetica Neue", sans-serif;
  --font-mono: "JetBrains Mono", "DejaVu Sans Mono", Menlo, monospace;
}`;

(async () => {
  const browser = await launchChromium();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, timezoneId: "Europe/Paris", locale: "zh-CN" });
  await ctx.route("**/*", route => {
    const url = route.request().url();
    if (url.startsWith("file:")) return route.continue();
    if (/\.png(\?|$)/i.test(url)) return route.fulfill({ status: 200, contentType: "image/png", body: FIGURE });
    return route.fulfill({ status: 204, body: "" });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await page.addInitScript(`window.__noPersist = true; try { sessionStorage.removeItem("dl-config"); } catch (e) {}\n` +
    `${mockBridge.toString()}\nmockBridge();\n(${screenshotFixtures.toString()})();`);
  await page.goto(indexUrl(WEB));
  if (process.platform !== "darwin") await page.addStyleTag({ content: FONT_OVERRIDE });
  await page.evaluate(addWindowChrome);

  await page.waitForSelector(".approval-card[data-state=pending]");
  await page.waitForSelector(".embed");
  await page.waitForSelector(".sidebar-section .server-picker");
  await page.waitForFunction(() => [...document.querySelectorAll("img.msg-image")].every(i => i.complete && i.naturalWidth > 0));
  await page.evaluate(() => document.fonts.ready);
  // The sidebar was drawn before the messages arrived; redraw it so the thread nests under its channel (as it does after
  // any later sidebar redraw in the app), then pin the message list to the bottom
  await page.evaluate(() => renderChannelList());
  await page.waitForSelector(".thread-subitem");
  await page.evaluate(() => { const v = document.getElementById("messagesViewport"); v.scrollTop = v.scrollHeight; });
  await page.waitForTimeout(300);

  const main = path.join(OUT, "screenshot-main.png");
  await page.screenshot({ path: main });

  // Approval close-up: 760x420 centred on the approval card's message row. The other rows, the composer and the
  // sidebar are hidden first (visibility only, the layout does not move; the body behind them has the chat area's
  // colour) so the crop does not cut through them.
  const W = 760, H = 420;
  const box = await page.$eval(".approval-card", el => {
    const row = el.closest(".message-row");
    document.querySelectorAll(".message-row").forEach(r => { if (r !== row) r.style.visibility = "hidden"; });
    document.querySelector(".input-container").style.visibility = "hidden";
    document.querySelector(".sidebar").style.visibility = "hidden";
    const r = row.getBoundingClientRect();
    const card = el.getBoundingClientRect();
    return { left: r.left, right: card.right, top: r.top, height: r.height };
  });
  const x = Math.max(0, Math.min(1280 - W, Math.round((box.left + box.right) / 2 - W / 2)));
  const y = Math.max(0, Math.min(800 - H, Math.round(box.top + box.height / 2 - H / 2)));
  const approval = path.join(OUT, "screenshot-approval.png");
  await page.screenshot({ path: approval, clip: { x, y, width: W, height: H } });

  await browser.close();
  if (errors.length) {
    console.error("page errors:\n  " + errors.join("\n  "));
    process.exit(1);
  }
  [main, approval].forEach(f => console.log(`wrote ${path.relative(process.cwd(), f)} (${fs.statSync(f).size} bytes)`));
})().catch(e => { console.error(e); process.exit(1); });
