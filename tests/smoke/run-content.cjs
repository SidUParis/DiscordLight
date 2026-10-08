// Suite "content": rich message content and scroll-back history.
//   Embeds (color / author / linked title / markdown description / 2-column fields / thumbnail / footer + time, caps,
//   XSS), embeds inside an approval card whose text is empty, image attachments (<a><img loading=lazy>, proxy src,
//   scaled width / height), file rows (size, download link), non-http(s) urls rejected, select menus (placeholder,
//   no data-act, not an approval), embed-only / attachment-only edits picked up by the resync, image loads keep the
//   view pinned to the bottom, and `before` pagination (anchor kept, exhausted on a short page, polling / resync /
//   refresh keep the loaded history, channel switch resets, late answers dropped, 400-message cap).
// Uses the shared mock-bridge.cjs; getConfig / fetchMessages are overridden below with numeric snowflake ids and an
// `after` / `before`-aware fetchMessages. Every non-file request (the Discord CDN images) is answered locally.
// Usage: node run-content.cjs [path/to/web]   (default: ../../web). Screenshots: .shots/content/
"use strict";
const path = require("path");
const zlib = require("zlib");
const { launchChromium, webDir, indexUrl, shotsDir, report, harnessFailed } = require("./harness.cjs");
const { mockBridge } = require("./mock-bridge.cjs");

const WEB = webDir();
const SHOTS = shotsDir("content");
const mock = mockBridge.toString();

// ---------- a tiny PNG encoder, so the CDN images can be answered locally ----------
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
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// A dark "dashboard" picture: soft gradient, a few bars
const mix = (a, b, t) => Math.round(a + (b - a) * t);
const DASHBOARD = makePNG(640, 360, (x, y) => {
  const t = x / 640;
  let rgb = [mix(30, 38, t), mix(36, 30, t), mix(48, 56, t)];
  const bars = [[60, 0.82, [72, 132, 220]], [120, 0.64, [64, 170, 140]], [180, 0.9, [72, 132, 220]], [240, 0.45, [210, 160, 70]]];
  bars.forEach(([top, len, c]) => { if (y >= top && y < top + 30 && x >= 48 && x < 48 + len * 544) rgb = c; });
  if (y === 310 && x >= 48 && x < 592) rgb = [90, 96, 110];
  return rgb;
});
const THUMB = makePNG(128, 128, (x, y) => [mix(80, 140, x / 128), mix(90, 110, y / 128), 200]);
// The preview's wide dashboard strip (10:3, same ratio as the attachment's declared 1600x480)
const WIDE = makePNG(800, 240, (x, y) => {
  let rgb = [mix(28, 36, x / 800), mix(34, 30, x / 800), mix(46, 54, x / 800)];
  const bars = [[40, 0.78, [72, 132, 220]], [100, 0.56, [64, 170, 140]], [160, 0.88, [210, 160, 70]]];
  bars.forEach(([top, len, c]) => { if (y >= top && y < top + 34 && x >= 40 && x < 40 + len * 720) rgb = c; });
  return rgb;
});

// Runs in the page after mockBridge(): channels with numeric snowflake ids, an `after` / `before`-aware fetchMessages
function contentFixtures() {
  const calls = window.__calls;
  const base = 1400000000000000000n;
  const sid = (n) => String(base + BigInt(n));
  const ts = (min) => new Date(Date.UTC(2026, 9, 7, 8, 0, 0) + min * 60000).toISOString();
  const me = { id: "900100200300400500", username: "sidney", global_name: "Sidney" };
  const lea = { id: "900100200300400777", username: "lea", global_name: "Léa Martin" };
  const web = { id: "1510971308589191218", username: "Web Hermes", bot: true };
  const paper = { id: "1491193341612654642", username: "bot1491193341612654642", bot: true };
  const cdn = (p) => `https://cdn.discordapp.com/attachments/1300/${p}?ex=6710&is=670f&hm=ab12`;
  const media = (p) => `https://media.discordapp.net/attachments/1300/${p}?ex=6710&is=670f&hm=ab12`;
  const approval = (tag) => [{ type: 1, components: [
    { type: 2, style: 3, label: "Allow Once", custom_id: `allow_once:${tag}` },
    { type: 2, style: 1, label: "Allow Session", custom_id: `allow_session:${tag}` },
    { type: 2, style: 2, label: "Always Allow", custom_id: `allow_always:${tag}` },
    { type: 2, style: 4, label: "Deny", custom_id: `deny:${tag}` }
  ] }];

  // ---- c1: the content channel (oldest first here, reversed below) ----
  const c1 = [
    { id: sid(1), author: me, timestamp: ts(0), content: "帮我看看部署状态" },
    { id: sid(2), author: web, timestamp: ts(10), content: "部署完成，详情如下：", embeds: [
      { type: "rich", color: 0x5865F2, author: { name: "Deploy Bot" }, title: "Release v1.2.0 <script>window.__pwned=1</script>", url: "https://example.org/release?a=1&b=2",
        description: "**全部通过** 日志 https://example.org/log 以及 <img src=x onerror=window.__pwned=2>",
        fields: [
          { name: "环境", value: "`staging`", inline: true },
          { name: "耗时 <b>x</b>", value: "3 分 12 秒", inline: true },
          { name: "变更", value: "修复登录\n新增导出 **CSV**", inline: false }
        ],
        thumbnail: { url: "https://cdn.discordapp.com/thumbs/release.png", proxy_url: "https://media.discordapp.net/thumbs/release.png", width: 128, height: 128 },
        footer: { text: "CI #482" }, timestamp: "2026-10-07T12:34:00.000Z" },
      { type: "rich", title: "Not a link", url: "javascript:window.__pwned=3", description: "plain", color: "red;background:url(x)" }
    ] },
    { id: sid(3), author: lea, timestamp: ts(20), content: "", attachments: [
      { id: "a1", filename: "screen.png", content_type: "image/png", size: 234567, width: 1600, height: 1200, url: cdn("screen.png"), proxy_url: media("screen.png") },
      { id: "a2", filename: "photo.JPG", size: 34567, url: cdn("photo.JPG"), proxy_url: media("photo.JPG") },
      { id: "a3", filename: "evil.png", content_type: "image/png", size: 10, url: "javascript:window.__pwned=4", proxy_url: "javascript:window.__pwned=5" },
      { id: "a4", filename: "report-<b>final</b>-2026-q3-very-long-name-for-ellipsis.pdf", content_type: "application/pdf", size: 1258291, url: cdn("report.pdf"), proxy_url: media("report.pdf") }
    ] },
    { id: sid(4), author: paper, timestamp: ts(30), content: "", components: approval("embed"), embeds: [
      { type: "rich", color: 0xFEE75C, title: "运行命令", description: "```bash\nrm -rf build && make install\n```", fields: [{ name: "工作目录", value: "`~/Developer/DiscordLight`" }] }
    ] },
    { id: sid(5), author: web, timestamp: ts(40), content: "选择要部署的环境", components: [
      { type: 1, components: [{ type: 3, custom_id: "env_select", placeholder: "选择环境 <i>", options: [{ label: "staging", value: "s" }] }] },
      { type: 1, components: [{ type: 3, custom_id: "env_select_2", options: [] }] }
    ] },
    { id: sid(6), author: web, timestamp: ts(50), content: "需要确认部署目标", components: [
      { type: 1, components: [{ type: 3, custom_id: "target", placeholder: "目标" }] },
      { type: 1, components: [{ type: 2, style: 3, label: "Allow Once", custom_id: "allow_once:sel" }, { type: 2, style: 4, label: "Deny", custom_id: "deny:sel" }] }
    ] },
    { id: sid(7), author: web, timestamp: ts(60), content: "批量结果", embeds: Array.from({ length: 6 }, (_, i) => ({
      type: "rich", title: `结果 ${i + 1}`,
      fields: i === 0 ? Array.from({ length: 12 }, (_, k) => ({ name: `F${k + 1}`, value: String(k + 1), inline: true })) : undefined
    })) },
    { id: sid(8), author: lea, timestamp: ts(70), content: "https://tenor.com/view/cat", embeds: [
      { type: "gifv", url: "https://tenor.com/view/cat", provider: { name: "Tenor" },
        thumbnail: { url: "https://media.tenor.com/cat.png", proxy_url: "https://images-ext-1.discordapp.net/external/cat.png", width: 498, height: 280 },
        video: { url: "https://media.tenor.com/cat.mp4" } }
    ] },
    { id: sid(9), author: me, timestamp: ts(80), content: "看这个 https://example.org/post" }
  ].reverse();

  // ---- p1: the preview channel for the screenshot ----
  const p1 = [
    { id: sid(201), author: me, timestamp: ts(200), content: "<@1510971308589191218> 把 v1.2.0 部署到 staging，完成后发一张仪表盘截图", mentions: [web] },
    { id: sid(202), author: web, timestamp: ts(203), content: "部署完成。", embeds: [
      { type: "rich", color: 0x3BA55C, author: { name: "Deploy · staging" }, title: "Release v1.2.0", url: "https://example.org/releases/1.2.0",
        description: "构建与冒烟测试全部通过，日志见 https://example.org/ci/482",
        fields: [{ name: "环境", value: "`staging`", inline: true }, { name: "耗时", value: "3 分 12 秒", inline: true }],
        footer: { text: "CI #482" }, timestamp: "2026-10-07T11:23:00.000Z" }
    ] },
    { id: sid(203), author: web, timestamp: ts(204), content: "", attachments: [
      { id: "p1a", filename: "dashboard.png", content_type: "image/png", size: 182044, width: 1600, height: 480, url: cdn("dashboard.png"), proxy_url: media("dashboard.png") }
    ] },
    { id: sid(204), author: paper, timestamp: ts(206), content: "", components: approval("p1"), embeds: [
      { type: "rich", color: 0xFEE75C, title: "执行命令", description: "`make migrate && make restart`", footer: { text: "工作目录 ~/Developer/projects/DiscordLight" } }
    ] }
  ].reverse();

  // ---- history channels ----
  const mk = (from, to, text) => {
    const out = [];
    for (let i = to; i >= from; i--) {
      out.push({ id: sid(1000 + i), author: i % 2 ? lea : web, timestamp: ts(300 + i * 7), content: `${text} #${i}` + (i % 5 === 0 ? "\n第二行" : "") });
    }
    return out;
  };
  const channels = { c1, p1, hist: mk(1, 100, "历史"), short: mk(1, 3, "短频道"), cap: mk(1, 450, "存档") };
  const M = window.__mock = { channels, sid, ts, lea, web, beforeDelay: 5, next: 5000 };
  const copy = (x) => JSON.parse(JSON.stringify(x));

  const answer = (msg) => {
    if (msg.action === "getConfig") {
      return { hasToken: true, last_channel_id: window.__startChannel || "c1", pinned_channels: [
        { id: "c1", name: "# agent-lab", server: "Research" },
        { id: "p1", name: "# deploy", server: "Research" },
        { id: "hist", name: "# history", server: "Research" },
        { id: "short", name: "# short", server: "Research" },
        { id: "cap", name: "# archive", server: "Research" }
      ] };
    }
    let list = channels[msg.channelId] || [];
    if (msg.after !== undefined) {
      list = list.filter(m => BigInt(m.id) > BigInt(msg.after));
      list = list.slice(Math.max(0, list.length - msg.limit));
    } else if (msg.before !== undefined) {
      list = list.filter(m => BigInt(m.id) < BigInt(msg.before)).slice(0, msg.limit);
    } else {
      list = list.slice(0, msg.limit);
    }
    return { messages: copy(list) };
  };
  const bridge = window.webkit.messageHandlers.discordBridge;
  const orig = bridge.postMessage;
  bridge.postMessage = function (msg) {
    if (msg.action !== "fetchMessages" && msg.action !== "getConfig") return orig.call(this, msg);
    const rec = JSON.parse(JSON.stringify(msg));
    rec.t = performance.now();
    calls.push(rec);
    const delay = msg.before !== undefined ? M.beforeDelay : 5;
    setTimeout(() => {
      const res = answer(msg);
      if (res.messages) { rec.n = res.messages.length; rec.doneT = performance.now(); }
      if (window[msg.callback]) window[msg.callback](res);
    }, delay);
  };
}

const META = ["callback", "t", "n", "doneT"];
const keysOf = (c) => Object.keys(c).filter(k => !META.includes(k)).sort().join(",");

(async () => {
  const browser = await launchChromium();
  const ctx = await browser.newContext({ viewport: { width: 1120, height: 740 }, deviceScaleFactor: 2, timezoneId: "Europe/Paris" });
  // Nothing may leave the machine: images are answered with local PNGs (photo.JPG / late.png after a delay), the rest with text
  const requested = [];
  await ctx.route("**/*", async route => {
    const url = route.request().url();
    if (url.startsWith("file:")) return route.continue();
    requested.push(url);
    const isImage = /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url);
    if (!isImage) return route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
    if (/photo\.JPG|late\.png/.test(url)) await new Promise(r => setTimeout(r, 500));
    return route.fulfill({ status: 200, contentType: "image/png", body: /thumbs\//.test(url) ? THUMB : (/dashboard\.png/.test(url) ? WIDE : DASHBOARD) });
  });

  const errors = [];
  const dialogs = [];
  const watch = (p, tag) => {
    p.on("pageerror", e => errors.push(`${tag} pageerror: ${e.message}`));
    p.on("console", m => { if (m.type() === "error") errors.push(`${tag} console: ${m.text()}`); });
    p.on("dialog", d => { dialogs.push(d.message()); d.dismiss(); });
  };
  const results = [];
  const info = {};
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };
  const init = (start, pollMs) => `window.__noPersist = true; try { sessionStorage.removeItem("dl-config"); } catch (e) {}\n` +
    (start ? `window.__startChannel = ${JSON.stringify(start)};\n` : "") +
    (pollMs ? `window.__DL_POLL_MS = ${JSON.stringify(pollMs)};\n` : "") +
    `${mock}\nmockBridge();\n(${contentFixtures.toString()})();`;
  const sid = (n) => String(1400000000000000000n + BigInt(n));

  // ================= Page A: embeds, attachments, select menus, signature, image pinning =================
  const page = await ctx.newPage();
  watch(page, "A");
  await page.addInitScript(init(null, { active: 200, hidden: 900 }));
  await page.goto(indexUrl(WEB));
  await page.waitForSelector(".embed");
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS, "01-content.png") });

  const row = (n) => `#messagesList .message-row[data-msg-id="${sid(n)}"]`;

  // ---------- embeds ----------
  info.embed = await page.$eval(`${row(2)} .embed`, el => {
    const cs = getComputedStyle(el);
    const title = el.querySelector(".embed-title");
    const a = title && title.querySelector("a");
    const fields = [...el.querySelectorAll(".embed-field")].map(f => { const r = f.getBoundingClientRect(); const n = f.querySelector(".embed-field-name"); const v = f.querySelector(".embed-field-value"); return { name: n.textContent, value: v.innerText, html: v.innerHTML, left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), wide: f.classList.contains("wide"), nameFont: getComputedStyle(n).fontSize + "/" + getComputedStyle(n).fontWeight, valueFont: getComputedStyle(v).fontSize }; });
    const grid = el.querySelector(".embed-fields").getBoundingClientRect();
    const thumb = el.querySelector(".embed-thumb");
    const thumbLink = thumb && thumb.closest("a");
    const main = el.querySelector(".embed-main").getBoundingClientRect();
    return {
      border: cs.borderLeftColor, borderWidth: cs.borderLeftWidth, bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, maxWidth: cs.maxWidth, padding: cs.padding,
      author: (el.querySelector(".embed-author") || {}).textContent, authorFont: el.querySelector(".embed-author") && getComputedStyle(el.querySelector(".embed-author")).fontSize,
      titleText: title && title.textContent, titleTag: a ? a.tagName : null, titleHref: a && a.getAttribute("href"), titleTarget: a && a.target, titleRel: a && a.rel, titleClass: a && a.className, titleFont: title && getComputedStyle(title).fontSize + "/" + getComputedStyle(title).fontWeight,
      descText: el.querySelector(".embed-description").innerText, descStrong: [...el.querySelectorAll(".embed-description strong")].map(s => s.textContent), descLinks: [...el.querySelectorAll(".embed-description a")].map(l => l.className + "|" + l.getAttribute("href") + "|" + l.target + "|" + l.rel), descImgs: el.querySelectorAll(".embed-description img").length,
      fields, gridWidth: Math.round(grid.width), gridCols: getComputedStyle(el.querySelector(".embed-fields")).gridTemplateColumns,
      thumb: thumb && { src: thumb.getAttribute("src"), w: thumb.getAttribute("width"), h: thumb.getAttribute("height"), loading: thumb.getAttribute("loading"), href: thumbLink && thumbLink.getAttribute("href"), right: Math.round(thumb.getBoundingClientRect().left) >= Math.round(main.right), box: Math.round(thumb.getBoundingClientRect().width) + "x" + Math.round(thumb.getBoundingClientRect().height) },
      footer: el.querySelector(".embed-footer") && el.querySelector(".embed-footer").textContent, footerFont: el.querySelector(".embed-footer") && getComputedStyle(el.querySelector(".embed-footer")).fontSize
    };
  });
  const E = info.embed;
  check("embed: card under the content, left border 3px from color 0x5865F2, bg --bg-raised, radius 8, max-width 560, padding 10px 12px",
    E.border === "rgb(88, 101, 242)" && E.borderWidth === "3px" && E.bg === "rgb(40, 40, 43)" && E.radius === "8px" && E.maxWidth === "560px" && E.padding === "10px 12px", E);
  check("embed: author row (11px) and a linked title <a class=msg-link target=_blank rel='noopener noreferrer'> with the exact href, 13px/600, markup in the title shown as text",
    E.author === "Deploy Bot" && E.authorFont === "11px" && E.titleTag === "A" && E.titleClass === "msg-link" && E.titleHref === "https://example.org/release?a=1&b=2" && E.titleTarget === "_blank" && E.titleRel === "noopener noreferrer" && E.titleFont === "13px/600" && E.titleText === "Release v1.2.0 <script>window.__pwned=1</script>", E);
  check("embed: description through parseMarkdown (**bold**, https autolink), the <img onerror> payload stays literal text",
    JSON.stringify(E.descStrong) === JSON.stringify(["全部通过"]) && E.descLinks.length === 1 && E.descLinks[0] === "msg-link|https://example.org/log|_blank|noopener noreferrer" && E.descImgs === 0 && E.descText.includes("<img src=x onerror=window.__pwned=2>"), E);
  const [f1, f2, f3] = E.fields;
  check("embed fields: 2 inline side by side in a 2-column grid, the inline:false field spans both columns; name 11px/600, value 12.5px through parseMarkdown",
    E.fields.length === 3 && f1.top === f2.top && f2.left > f1.left && !f1.wide && !f2.wide && f3.wide && f3.top > f1.top && Math.abs(f3.width - E.gridWidth) <= 1 && f1.width < E.gridWidth / 2 &&
    E.gridCols.split(" ").length === 2 && f1.nameFont === "11px/600" && f1.valueFont === "12.5px" && /<code class="inline-code">staging<\/code>/.test(f1.html) && /<strong>CSV<\/strong>/.test(f3.html) && f2.name === "耗时 <b>x</b>", E.fields);
  check("embed: thumbnail on the right, proxy src, scaled to 64x64, lazy, wrapped in an http(s) link",
    E.thumb && E.thumb.src === "https://media.discordapp.net/thumbs/release.png" && E.thumb.href === "https://cdn.discordapp.com/thumbs/release.png" && E.thumb.w === "64" && E.thumb.h === "64" && E.thumb.loading === "lazy" && E.thumb.right && E.thumb.box === "64x64", E.thumb);
  check("embed: footer text + timestamp in local time (12:34Z -> 14:34 Europe/Paris), 11px", E.footer === "CI #482 · 14:34" && E.footerFont === "11px", { footer: E.footer, font: E.footerFont });
  info.embed2 = await page.$$eval(`${row(2)} .embed`, els => els.length > 1 && { border: getComputedStyle(els[1]).borderLeftColor, style: els[1].getAttribute("style"), titleLinks: els[1].querySelectorAll(".embed-title a").length, title: els[1].querySelector(".embed-title").textContent });
  check("embed: javascript: title url -> plain title (no link); a non-integer color -> default --line-strong border, no inline style",
    info.embed2 && info.embed2.titleLinks === 0 && info.embed2.title === "Not a link" && info.embed2.style === null && info.embed2.border === "rgba(255, 255, 255, 0.14)", info.embed2);
  info.caps = await page.$eval(row(7), r => ({ embeds: r.querySelectorAll(".embed").length, fields: r.querySelector(".embed").querySelectorAll(".embed-field").length, last: r.querySelector(".embed:last-child .embed-title").textContent }));
  check("embed caps: 6 embeds -> 4 cards, 12 fields -> 10", info.caps.embeds === 4 && info.caps.fields === 10 && info.caps.last === "结果 4", info.caps);
  info.gifv = await page.$eval(row(8), r => ({ cards: r.querySelectorAll(".embed").length, imgs: [...r.querySelectorAll("a.msg-image-link > img.msg-image")].map(i => i.getAttribute("src") + "|" + i.closest("a").getAttribute("href") + "|" + i.getAttribute("width") + "x" + i.getAttribute("height")), video: r.querySelectorAll("video, iframe, source").length }));
  check("embed: a bare GIF link (type gifv) shows just the still picture via the proxy, no card, no video element",
    info.gifv.cards === 0 && info.gifv.video === 0 && JSON.stringify(info.gifv.imgs) === JSON.stringify(["https://images-ext-1.discordapp.net/external/cat.png|https://media.tenor.com/cat.png|400x225"]), info.gifv);

  // ---------- approval prompt whose request lives in an embed ----------
  info.approvalEmbed = await page.$eval(row(4), r => {
    const card = r.querySelector(".approval-card");
    const body = card && card.querySelector(".approval-body");
    return {
      card: !!card, state: card && card.dataset.state, bodyVisible: !!body && body.offsetHeight > 0, embedInBody: !!(body && body.querySelector(".msg-accessories.lead > .embed")),
      text: body && body.innerText, copyBtn: !!(body && body.querySelector(".embed .btn-copy[data-act=copy]")), content: r.querySelectorAll(".message-content").length,
      firstGap: body && Math.round(body.querySelector(".embed").getBoundingClientRect().top - body.getBoundingClientRect().top), border: body && getComputedStyle(body.querySelector(".embed")).borderLeftColor
    };
  });
  check("approval: empty content + embed -> pending approval card with the embed (code block, fields) inside the body, body visible, no extra gap",
    info.approvalEmbed.card && info.approvalEmbed.state === "pending" && info.approvalEmbed.bodyVisible && info.approvalEmbed.embedInBody && info.approvalEmbed.text.includes("rm -rf build && make install") &&
    info.approvalEmbed.text.includes("~/Developer/DiscordLight") && info.approvalEmbed.copyBtn && info.approvalEmbed.content === 0 && info.approvalEmbed.firstGap === 12 && info.approvalEmbed.border === "rgb(254, 231, 92)", info.approvalEmbed);

  // ---------- attachments ----------
  info.att = await page.$eval(row(3), r => ({
    contentEl: (() => { const c = r.querySelector(".message-content"); return c ? { html: c.innerHTML, h: c.offsetHeight, display: getComputedStyle(c).display } : null; })(),
    images: [...r.querySelectorAll(".msg-images > a.msg-image-link")].map(a => { const i = a.querySelector("img"); return { href: a.getAttribute("href"), target: a.target, rel: a.rel, cls: i.className, src: i.getAttribute("src"), alt: i.getAttribute("alt"), loading: i.getAttribute("loading"), decoding: i.getAttribute("decoding"), w: i.getAttribute("width"), h: i.getAttribute("height") }; }),
    allImgs: r.querySelectorAll("img").length,
    files: [...r.querySelectorAll(".msg-file")].map(f => { const a = f.querySelector("a"); const n = f.querySelector(".msg-file-name"); return { name: n.textContent, size: (f.querySelector(".msg-file-size") || {}).textContent || null, href: a && a.getAttribute("href"), target: a && a.target, rel: a && a.rel, icon: !!f.querySelector(".msg-file-icon svg.icon"), ellipsis: getComputedStyle(n).textOverflow === "ellipsis" && n.scrollWidth > n.clientWidth, nameFont: getComputedStyle(n).fontSize, width: Math.round(f.getBoundingClientRect().width), bg: getComputedStyle(f).backgroundColor }; }),
    gap: getComputedStyle(r.querySelector(".msg-images")).columnGap
  }));
  const A = info.att;
  const [img1, img2] = A.images;
  check("attachments: 2 images -> <a class=msg-image-link target=_blank rel='noopener noreferrer' href=url><img class=msg-image loading=lazy decoding=async src=proxy_url alt=filename>, 6px gap",
    A.images.length === 2 && A.allImgs === 2 && A.images.every(i => i.target === "_blank" && i.rel === "noopener noreferrer" && i.cls === "msg-image" && i.loading === "lazy" && i.decoding === "async") &&
    img1.href === "https://cdn.discordapp.com/attachments/1300/screen.png?ex=6710&is=670f&hm=ab12" && img1.src === "https://media.discordapp.net/attachments/1300/screen.png?ex=6710&is=670f&hm=ab12" && img1.alt === "screen.png" &&
    img2.href === "https://cdn.discordapp.com/attachments/1300/photo.JPG?ex=6710&is=670f&hm=ab12" && img2.alt === "photo.JPG" && A.gap === "6px", A.images);
  check("attachments: width/height known (1600x1200) -> attributes scaled into 400x300; unknown (photo.JPG, no content_type) -> no attributes",
    img1.w === "400" && img1.h === "300" && img2.w === null && img2.h === null, [img1, img2]);
  check("attachments: a javascript: image url gets no <img> and no link (file row with name only)",
    A.files.length === 2 && A.files[0].name === "evil.png" && A.files[0].href === null && (await page.evaluate(() => [...document.querySelectorAll("#messagesList [href], #messagesList [src]")].every(e => /^https?:\/\//i.test(e.getAttribute("href") || e.getAttribute("src"))))), A.files[0]);
  const pdf = A.files[1];
  check("attachments: PDF -> .msg-file row (file icon, escaped name with ellipsis, size 1.2 MB, download <a target=_blank rel=noopener noreferrer>), bg --bg-inset, max 400px",
    pdf && pdf.name === "report-<b>final</b>-2026-q3-very-long-name-for-ellipsis.pdf" && pdf.size === "1.2 MB" && pdf.icon && pdf.ellipsis && pdf.nameFont === "12.5px" && pdf.href === "https://cdn.discordapp.com/attachments/1300/report.pdf?ex=6710&is=670f&hm=ab12" && pdf.target === "_blank" && pdf.rel === "noopener noreferrer" && pdf.width === 400 && pdf.bg === "rgb(21, 21, 23)", pdf);
  check("attachment-only message: the empty .message-content takes no space", A.contentEl && A.contentEl.html === "" && A.contentEl.h === 0 && A.contentEl.display === "none", A.contentEl);

  // ---------- select menus ----------
  info.select = await page.$eval(row(5), r => ({
    inCard: !!r.querySelector(".approval-card"), inRow: !!r.querySelector(".components-row"),
    items: [...r.querySelectorAll(".btn-component")].map(b => ({ tag: b.tagName, cls: b.className.replace(/\s+/g, " ").trim(), label: b.textContent.trim(), act: b.dataset.act || null, title: b.title, chevron: !!b.querySelector("svg.icon"), aria: b.getAttribute("aria-disabled"), opacity: getComputedStyle(b).opacity }))
  }));
  check("select menu: renders as a disabled-looking .btn-component.style-secondary with the placeholder (escaped) / 选择…, chevron, title 下拉选择暂不支持, no data-act, plain row (not an approval card)",
    !info.select.inCard && info.select.inRow && info.select.items.length === 2 && info.select.items.every(i => i.tag === "BUTTON" && i.cls === "btn-component style-secondary select-menu" && i.act === null && i.title === "下拉选择暂不支持" && i.chevron && i.aria === "true" && Number(i.opacity) < 1) &&
    info.select.items[0].label === "选择环境 <i>" && info.select.items[1].label === "选择…", info.select);
  const interBefore = await page.evaluate(() => window.__calls.filter(c => c.action === "sendInteraction").length);
  await page.click(`${row(5)} .select-menu`, { force: true }); // aria-disabled: Playwright would wait for "enabled"
  await page.waitForTimeout(80);
  check("select menu: clicking it sends nothing", (await page.evaluate(() => window.__calls.filter(c => c.action === "sendInteraction").length)) === interBefore);
  info.selectApproval = await page.$eval(row(6), r => ({ card: !!r.querySelector(".approval-card"), state: r.querySelector(".approval-card") && r.querySelector(".approval-card").dataset.state, items: [...r.querySelectorAll(".approval-actions .btn-component")].map(b => b.textContent.trim() + ":" + (b.dataset.act || "-")) }));
  check("select menu: next to approval buttons it does not change the approval card (and is not counted: card stays pending)",
    info.selectApproval.card && info.selectApproval.state === "pending" && JSON.stringify(info.selectApproval.items) === JSON.stringify(["目标:-", "Allow Once:component", "Deny:component"]), info.selectApproval);

  // ---------- injection ----------
  check("xss: no inline on* attributes, no script, window.__pwned unset", await page.evaluate(() => [...document.querySelectorAll("#messagesList *")].every(e => [...e.attributes].every(a => !/^on/i.test(a.name))) && !document.querySelector("#messagesList script") && window.__pwned === undefined));
  check("images: every <img> in the stream is lazy, async and has an http(s) src", await page.evaluate(() => [...document.querySelectorAll("#messagesList img")].every(i => i.loading === "lazy" && i.decoding === "async" && /^https?:\/\//.test(i.getAttribute("src")))));

  // ---------- signature: embed-only / attachment-only edits re-render at the resync ----------
  const resyncNow = async () => {
    const mark = await page.evaluate(() => window.__calls.length);
    await page.evaluate(() => { window.setAppVisible(false); window.setAppVisible(true); });
    await page.waitForFunction((m) => window.__calls.slice(m).some(c => c.action === "fetchMessages" && c.limit === 15 && c.n !== undefined), mark, { timeout: 8000 });
    await page.waitForTimeout(60);
  };
  await page.evaluate(() => {
    const m9 = window.__mock.channels.c1.find(m => m.id === window.__mock.sid(9));
    // Discord adds the link preview later: same edited_timestamp (none), one more embed
    m9.embeds = [{ type: "link", title: "Example post", url: "https://example.org/post", description: "A preview added after the fact" }];
  });
  await resyncNow();
  info.sig1 = await page.$eval(row(9), r => ({ embeds: r.querySelectorAll(".embed").length, title: r.querySelector(".embed .embed-title") && r.querySelector(".embed .embed-title").textContent }));
  check("signature: an embed added without edited_timestamp (link preview) re-renders at the next resync", info.sig1.embeds === 1 && info.sig1.title === "Example post", info.sig1);
  await page.evaluate(() => {
    const m1 = window.__mock.channels.c1.find(m => m.id === window.__mock.sid(1));
    m1.attachments = [{ id: "a9", filename: "notes.txt", content_type: "text/plain", size: 900, url: "https://cdn.discordapp.com/attachments/1300/notes.txt" }];
  });
  await resyncNow();
  check("signature: an attachment-only change re-renders at the next resync too", (await page.$$eval(`${row(1)} .msg-file`, els => els.map(e => e.innerText.replace(/\s+/g, " ").trim()))).join("|") === "notes.txt 900 B");

  // ---------- an image without a size, arriving at the bottom, keeps the view pinned when it loads ----------
  await page.evaluate(() => { const v = document.getElementById("messagesViewport"); v.scrollTop = v.scrollHeight; });
  await page.waitForTimeout(100);
  const g0 = await page.evaluate(() => { const v = document.getElementById("messagesViewport"); return { gap: v.scrollHeight - v.scrollTop - v.clientHeight, h: v.scrollHeight, stick: state.stickToBottom }; });
  await page.evaluate(() => {
    const M = window.__mock;
    M.channels.c1.unshift({ id: M.sid(50), author: M.lea, timestamp: M.ts(95), content: "迟到的图片", attachments: [{ id: "late", filename: "late.png", content_type: "image/png", size: 5000, url: "https://cdn.discordapp.com/attachments/1300/late.png", proxy_url: "https://media.discordapp.net/attachments/1300/late.png" }] });
  });
  await page.waitForSelector(`${row(50)} img`);
  const g1 = await page.evaluate(() => { const v = document.getElementById("messagesViewport"); const i = document.querySelector('img[alt="late.png"]'); return { gap: v.scrollHeight - v.scrollTop - v.clientHeight, h: v.scrollHeight, complete: i.complete && i.naturalWidth > 0 }; });
  await page.waitForFunction(() => { const i = document.querySelector('img[alt="late.png"]'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 });
  await page.waitForTimeout(50);
  const g2 = await page.evaluate(() => { const v = document.getElementById("messagesViewport"); const i = document.querySelector('img[alt="late.png"]'); return { gap: v.scrollHeight - v.scrollTop - v.clientHeight, h: v.scrollHeight, imgH: Math.round(i.getBoundingClientRect().height) }; });
  info.pin = { g0, g1, g2 };
  check("image load: at the bottom, a size-less image loading after the render (+300px) keeps the view pinned (gap < 2 before and after)",
    g0.gap < 2 && g0.stick && !g1.complete && g1.gap < 2 && g2.imgH >= 200 && g2.h > g1.h + 150 && g2.gap < 2, info.pin);

  check("network: images are requested only from the Discord media proxy hosts (proxy_url preferred), never a javascript: url",
    requested.length > 0 && requested.every(u => /^https:\/\/(media\.discordapp\.net|images-ext-1\.discordapp\.net)\//.test(u)), [...new Set(requested.map(u => u.split("?")[0]))]);
  await page.screenshot({ path: path.join(SHOTS, "02-content-bottom.png") });
  await page.close();

  // ================= Page B: scroll-back history =================
  const pB = await ctx.newPage();
  watch(pB, "B");
  await pB.addInitScript(init("hist", { active: 150, hidden: 900 }));
  await pB.goto(indexUrl(WEB));
  await pB.waitForFunction(() => document.querySelectorAll("#messagesList .message-row").length === 40);
  await pB.waitForTimeout(150);
  const H = (n) => String(1400000000000000000n + BigInt(1000 + n));
  const before = () => pB.evaluate(() => window.__calls.filter(c => c.action === "fetchMessages" && c.before !== undefined));
  const rows = () => pB.$$eval("#messagesList .message-row", els => els.map(e => e.dataset.msgId));
  const offsetOf = (id) => pB.evaluate((x) => { const r = document.querySelector(`.message-row[data-msg-id="${x}"]`); return r ? r.getBoundingClientRect().top - document.getElementById("messagesViewport").getBoundingClientRect().top : null; }, id);
  const status = () => pB.evaluate(() => { const s = document.getElementById("historyStatus"); return { hidden: s.hidden, visible: s.offsetHeight > 0, text: s.textContent }; });
  const toTop = () => pB.evaluate(() => { const v = document.getElementById("messagesViewport"); v.scrollTop = Math.min(v.scrollTop, 200) + 1; v.scrollTop = 0; });

  const b0 = { rows: (await rows()).length, before: (await before()).length, gap: await pB.evaluate(() => { const v = document.getElementById("messagesViewport"); return v.scrollHeight - v.scrollTop - v.clientHeight; }), exhausted: await pB.evaluate(() => state.historyExhausted) };
  check("history: channel load shows the newest 40 at the bottom, no `before` request yet, not exhausted (full page)", b0.rows === 40 && b0.before === 0 && b0.gap < 2 && b0.exhausted === false, b0);

  // first page
  await pB.evaluate(() => { window.__mock.beforeDelay = 400; });
  const topId = (await rows())[0];
  await toTop();
  await pB.waitForFunction(() => window.__calls.some(c => c.action === "fetchMessages" && c.before !== undefined));
  await pB.waitForTimeout(100);
  const loadingStatus = await status();
  const offDuring = await offsetOf(topId);
  await pB.waitForFunction(() => document.querySelectorAll("#messagesList .message-row").length === 80, null, { timeout: 5000 });
  const offAfter = await offsetOf(topId);
  const p1calls = await before();
  const rows1 = await rows();
  info.page1 = { topId, call: p1calls[0] && { keys: keysOf(p1calls[0]), before: p1calls[0].before, limit: p1calls[0].limit, n: p1calls[0].n }, loadingStatus, offDuring, offAfter, first: rows1[0], status: await status() };
  check("history: scrolling to the top fetches {action, before: oldest shown id, channelId, limit: 40}",
    p1calls.length === 1 && keysOf(p1calls[0]) === "action,before,channelId,limit" && p1calls[0].before === H(61) && topId === H(61) && p1calls[0].limit === 40 && p1calls[0].channelId === "hist", info.page1.call);
  check("history: a slim loading row '正在载入更早的消息…' shows above the list while the page is in flight, hidden afterwards",
    loadingStatus.visible && loadingStatus.text === "正在载入更早的消息…" && info.page1.status.hidden && !info.page1.status.visible, { during: loadingStatus, after: info.page1.status });
  check("history: 40 older rows added above (80, chronological, oldest #21), the previously-top message stays within 2px",
    rows1.length === 80 && rows1[0] === H(21) && rows1[40] === H(61) && rows1.every((id, i) => i === 0 || BigInt(id) > BigInt(rows1[i - 1])) && offDuring !== null && Math.abs(offAfter - offDuring) <= 2, info.page1);

  // second page: short -> exhausted
  await pB.evaluate(() => { window.__mock.beforeDelay = 5; });
  await toTop();
  await pB.waitForFunction(() => document.querySelectorAll("#messagesList .message-row").length === 100, null, { timeout: 5000 });
  await pB.waitForTimeout(100);
  const p2calls = await before();
  info.page2 = { calls: p2calls.map(c => c.before + "/" + c.n), exhausted: await pB.evaluate(() => state.historyExhausted), first: (await rows())[0] };
  check("history: the second scroll to the top asks before the new oldest id (#21); a short page (20) marks history exhausted",
    p2calls.length === 2 && p2calls[1].before === H(21) && p2calls[1].n === 20 && info.page2.exhausted === true && info.page2.first === H(1), info.page2);
  await toTop();
  await pB.waitForTimeout(400);
  check("history: exhausted -> no third request, status row says 已经是最早的消息", (await before()).length === 2 && !(await status()).hidden && (await status()).text === "已经是最早的消息", { before: (await before()).length, status: await status() });

  // polling, resync and refresh keep the loaded history
  await pB.evaluate(() => { const M = window.__mock; M.channels.hist.unshift({ id: M.sid(1101), author: M.lea, timestamp: M.ts(2000), content: "新消息 NEW-H" }); });
  await pB.waitForFunction(() => document.getElementById("messagesList").innerText.includes("NEW-H"), null, { timeout: 5000 });
  const afterNew = await rows();
  check("history + polling: a new message arriving after scroll-back keeps all 100 older rows (cap 400 once scrolled back): 101 rows",
    afterNew.length === 101 && afterNew[0] === H(1) && afterNew[100] === H(101), { n: afterNew.length, first: afterNew[0], last: afterNew[afterNew.length - 1] });
  let mark = await pB.evaluate(() => window.__calls.length);
  await pB.evaluate(() => { window.setAppVisible(false); window.setAppVisible(true); });
  await pB.waitForFunction((m) => window.__calls.slice(m).some(c => c.action === "fetchMessages" && c.limit === 15 && c.n !== undefined), mark);
  await pB.waitForTimeout(80);
  const afterResync = await rows();
  mark = await pB.evaluate(() => window.__calls.length);
  await pB.click("#refreshBtn");
  await pB.waitForFunction((m) => window.__calls.slice(m).some(c => c.action === "fetchMessages" && c.limit === 40 && c.before === undefined && c.after === undefined && c.n !== undefined), mark);
  await pB.waitForTimeout(80);
  const afterRefresh = await rows();
  info.keep = { resync: afterResync.length, refresh: afterRefresh.length, loaded: await pB.evaluate(() => state.historyLoaded) };
  check("history: a resync (limit 15) and a refresh / reload (limit 40) merge instead of truncating: still 101 rows, oldest #1 kept",
    afterResync.length === 101 && afterRefresh.length === 101 && afterRefresh[0] === H(1) && info.keep.loaded === true, info.keep);

  // channel switch resets; coming back starts from the newest 40 again
  await pB.evaluate(() => window.switchChannelById("short"));
  await pB.waitForFunction(() => document.querySelectorAll("#messagesList .message-row").length === 3);
  const shortState = await pB.evaluate(() => ({ loaded: state.historyLoaded, exhausted: state.historyExhausted, loading: state.historyLoading }));
  await pB.evaluate(() => window.switchChannelById("hist"));
  await pB.waitForFunction(() => document.querySelectorAll("#messagesList .message-row").length === 40);
  await pB.waitForTimeout(100);
  const backState = await pB.evaluate(() => ({ loaded: state.historyLoaded, exhausted: state.historyExhausted }));
  const n0 = (await before()).length;
  await toTop();
  await pB.waitForFunction((k) => window.__calls.filter(c => c.action === "fetchMessages" && c.before !== undefined).length > k, n0);
  const again = (await before()).pop();
  info.reset = { shortState, backState, again: again.before };
  check("history: channel switch resets (short channel: loaded false, exhausted after its short load); back on the channel: newest 40, not exhausted, scroll-back starts again from the oldest of those",
    !shortState.loaded && shortState.exhausted && !shortState.loading && !backState.loaded && !backState.exhausted && again.before === H(62), info.reset);
  await pB.waitForFunction(() => document.querySelectorAll("#messagesList .message-row").length === 80);

  // a late page for a channel the user left is dropped
  await pB.evaluate(() => window.switchChannelById("hist"));
  await pB.waitForFunction(() => document.querySelectorAll("#messagesList .message-row").length === 40);
  await pB.waitForTimeout(100);
  await pB.evaluate(() => { window.__mock.beforeDelay = 600; });
  const n1 = (await before()).length;
  await toTop();
  await pB.waitForFunction((k) => window.__calls.filter(c => c.action === "fetchMessages" && c.before !== undefined).length > k, n1);
  await pB.evaluate(() => window.switchChannelById("short"));
  await pB.waitForTimeout(900);
  const late = await pB.evaluate(() => ({ rows: document.querySelectorAll("#messagesList .message-row").length, text: document.getElementById("messagesList").innerText, ids: state.messages.map(m => m.id), loading: state.historyLoading, status: document.getElementById("historyStatus").hidden }));
  const lateCall = (await before()).pop();
  info.late = { rows: late.rows, loading: late.loading, statusHidden: late.status, answered: lateCall.n };
  check("history: a page answered after switching away is dropped (short channel still shows its 3 rows, no history text, no status)",
    lateCall.n === 40 && late.rows === 3 && !late.text.includes("历史") && late.ids.length === 3 && !late.loading && late.status, info.late);
  await pB.evaluate(() => { window.__mock.beforeDelay = 5; });

  // cap: 450 messages, scroll back until it stops
  await pB.evaluate(() => window.switchChannelById("cap"));
  await pB.waitForFunction(() => document.querySelectorAll("#messagesList .message-row").length === 40);
  await pB.waitForTimeout(100);
  const capStart = (await before()).length;
  for (let i = 0; i < 14; i++) {
    const n = (await rows()).length;
    await toTop();
    try {
      await pB.waitForFunction((k) => document.querySelectorAll("#messagesList .message-row").length > k, n, { timeout: 1500 });
    } catch (e) { break; }
    await pB.waitForTimeout(30);
  }
  await toTop();
  await pB.waitForTimeout(300);
  const capCalls = (await before()).length - capStart;
  info.cap = { rows: (await rows()).length, calls: capCalls, status: await status() };
  check("history cap: scrolling back stops at 400 messages (9 pages), the status row says so, no further request",
    info.cap.rows === 400 && capCalls === 9 && info.cap.status.visible && info.cap.status.text === "只显示最近 400 条消息", info.cap);
  await pB.screenshot({ path: path.join(SHOTS, "03-history-top.png") });
  await pB.close();

  // ================= Page C: preview screenshot =================
  const pC = await ctx.newPage();
  watch(pC, "C");
  await pC.addInitScript(init("p1"));
  await pC.goto(indexUrl(WEB));
  await pC.waitForSelector(".approval-card .embed");
  await pC.waitForFunction(() => [...document.querySelectorAll("#messagesList img")].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 5000 });
  await pC.waitForTimeout(200);
  info.preview = await pC.evaluate(() => {
    const v = document.getElementById("messagesViewport").getBoundingClientRect();
    const vis = (sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return r.top >= v.top - 1 && r.bottom <= v.bottom + 1; };
    return { embed: vis(".message-row:not(:last-child) .embed"), image: vis(".msg-image"), approval: vis(".approval-card"), hScroll: document.getElementById("messagesViewport").scrollWidth > document.getElementById("messagesViewport").clientWidth };
  });
  check("preview: the embed card, the image and the pending approval card are all fully visible at 1120x740, no horizontal scroll",
    info.preview.embed && info.preview.image && info.preview.approval && !info.preview.hScroll, info.preview);
  await pC.screenshot({ path: path.join(SHOTS, "preview-content.png") });
  info.minFont = await pC.evaluate(() => {
    let min = 99, who = "";
    document.querySelectorAll("#messagesList *, #historyStatus").forEach(el => {
      if (el.closest("svg") || el.offsetParent === null) return;
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < min) { min = fs; who = el.className || el.tagName; }
    });
    return { min, who };
  });
  check("type: smallest text in the rich content is 11px", info.minFont.min >= 11, info.minFont);
  await pC.setViewportSize({ width: 760, height: 500 });
  await pC.waitForTimeout(100);
  check("layout: no horizontal scroll with embeds / images at the 760x500 minimum window", await pC.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth && document.getElementById("messagesViewport").scrollWidth <= document.getElementById("messagesViewport").clientWidth));
  await pC.screenshot({ path: path.join(SHOTS, "04-preview-narrow.png") });
  await pC.close();

  check("no dialogs fired", dialogs.length === 0, dialogs);
  check("zero page errors / console errors (pages A, B, C)", errors.length === 0, errors);

  const code = report(results, info);
  await browser.close();
  process.exit(code);
})().catch(harnessFailed);
