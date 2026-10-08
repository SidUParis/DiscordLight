// Suite "links": Command-only search shortcut (Ctrl+K / Ctrl+F stay with the text system) and Discord link buttons
// (style 5): http(s) only, no interaction, approval cards with links. Every non-file request is answered locally.
// Usage: node run-links.cjs [path/to/web]   (default: ../../web). Screenshots: .shots/links/
"use strict";
const path = require("path");
const { launchChromium, webDir, indexUrl, shotsDir, report, harnessFailed } = require("./harness.cjs");
const { mockBridge } = require("./mock-bridge.cjs");

const WEB = webDir();
const SHOTS = shotsDir("links");
const mock = mockBridge.toString();

const GOOD_URL = "https://example.org/docs?a=1&b=\"q\"&c='x'#<frag>";

// Runs in the page after mockBridge(): fetchMessages answers with the link-button fixtures instead
function linkFixtures(goodUrl) {
  const ts = (min) => new Date(Date.UTC(2026, 9, 7, 12, min, 0)).toISOString();
  const web = { id: "1510971308589191218", username: "Web Hermes", bot: true };
  const paper = { id: "1491193341612654642", username: "bot1491193341612654642", bot: true };
  const messages = [
    { id: "k4", author: web, timestamp: ts(40), content: "翻页与来源", components: [{ type: 1, components: [
      { type: 2, style: 2, label: "下一页", custom_id: "pg:next" },
      { type: 2, style: 5, label: "来源", url: "http://example.org/source" } ] }] },
    { id: "k3", author: paper, timestamp: ts(30), content: "已在别处处理", components: [{ type: 1, components: [
      { type: 2, style: 3, label: "Allow Once", custom_id: "allow_once:3", disabled: true },
      { type: 2, style: 4, label: "Deny", custom_id: "deny:3", disabled: true },
      { type: 2, style: 5, label: "View log", url: "https://example.org/log" } ] }] },
    { id: "k2", author: paper, timestamp: ts(20), content: "需要运行 `make install`，请确认", components: [{ type: 1, components: [
      { type: 2, style: 3, label: "Allow Once", custom_id: "allow_once:2" },
      { type: 2, style: 5, label: "View diff", url: "https://example.org/diff" },
      { type: 2, style: 4, label: "Deny", custom_id: "deny:2" } ] }] },
    { id: "k1", author: web, timestamp: ts(10), content: "文档在这里", components: [{ type: 1, components: [
      { type: 2, style: 5, label: "Open docs", url: goodUrl },
      { type: 2, style: 5, label: "Cancel plan", url: "HTTPS://example.org/cancel" },
      { type: 2, style: 5, label: "JS", url: "javascript:alert(1)" },
      { type: 2, style: 5, label: "JS2", url: " javascript:window.__pwned=1" },
      { type: 2, style: 5, label: "JS3", url: "java\tscript:window.__pwned=1//https://example.org" },
      { type: 2, style: 5, label: "Data", url: "data:text/html,<script>window.__pwned=1</script>" },
      { type: 2, style: 5, label: "File", url: "file:///etc/passwd" },
      { type: 2, style: 5, label: "Relative", url: "//example.org/x" },
      { type: 2, style: 5, label: "Spaced", url: "https://example.org/a b" },
      { type: 2, style: 5, label: "NoHost", url: "https:///x" },
      { type: 2, style: 5, label: "NoUrl" },
      { type: 2, style: 5, label: "Off", url: "https://example.org/off", disabled: true } ] }] }
  ];
  const bridge = window.webkit.messageHandlers.discordBridge;
  const orig = bridge.postMessage;
  bridge.postMessage = function (msg) {
    if (msg.action !== "fetchMessages") return orig.call(this, msg);
    window.__calls.push(JSON.parse(JSON.stringify(msg)));
    setTimeout(() => window[msg.callback] && window[msg.callback]({ messages: messages.slice(0, msg.limit) }), 5);
  };
}

(async () => {
  const browser = await launchChromium();
  const ctx = await browser.newContext({ viewport: { width: 1120, height: 740 }, deviceScaleFactor: 2, timezoneId: "Europe/Paris" });
  // Nothing may leave the machine: every non-file request (the link targets) is answered locally
  const requested = [];
  await ctx.route("**/*", route => {
    const url = route.request().url();
    if (url.startsWith("file:")) return route.continue();
    requested.push(url);
    return route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
  });
  const page = await ctx.newPage();
  const errors = [];
  const dialogs = [];
  const popups = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("dialog", d => { dialogs.push(d.message()); d.dismiss(); });
  page.on("popup", pp => popups.push(pp));
  await page.addInitScript(`window.__noPersist = true; try { sessionStorage.removeItem("dl-config"); } catch (e) {}\n${mock}\nmockBridge();\n(${linkFixtures.toString()})(${JSON.stringify(GOOD_URL)});`);
  await page.goto(indexUrl(WEB));
  await page.waitForSelector(".approval-card");
  await page.waitForTimeout(300);

  const results = [];
  const info = {};
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };
  const interactions = () => page.evaluate(() => window.__calls.filter(c => c.action === "sendInteraction").map(c => c.messageId + ":" + c.customId));
  const bridgeCount = () => page.evaluate(() => window.__calls.length);
  const active = () => page.evaluate(() => document.activeElement.id);

  // ---------- Keyboard: Command only ----------
  await page.evaluate(() => {
    window.__keys = [];
    // window listener runs after the app's document listener (bubble order), so defaultPrevented is final here
    window.addEventListener("keydown", e => window.__keys.push((e.metaKey ? "Meta+" : "") + (e.ctrlKey ? "Ctrl+" : "") + (e.altKey ? "Alt+" : "") + (e.shiftKey ? "Shift+" : "") + e.key.toLowerCase() + ":" + e.defaultPrevented));
  });
  await page.click("#messageInput");
  await page.keyboard.type("hello");
  await page.keyboard.press("Control+k");
  check("keys: Ctrl+K does NOT focus the search field", (await active()) === "messageInput", await active());
  await page.keyboard.press("Control+f");
  check("keys: Ctrl+F does NOT focus the search field", (await active()) === "messageInput", await active());
  await page.keyboard.press("Control+Meta+k");
  await page.keyboard.press("Alt+Meta+k");
  await page.keyboard.press("Shift+Meta+k");
  await page.keyboard.press("Control+Meta+f");
  check("keys: ⌘K with Ctrl / Option / Shift held does NOT focus the search field", (await active()) === "messageInput", await active());
  info.keysBefore = await page.evaluate(() => window.__keys.filter(k => /\+[kf]:/.test(k)));
  check("keys: Ctrl+K / Ctrl+F are not preventDefault-ed (left to the text system)", info.keysBefore.includes("Ctrl+k:false") && info.keysBefore.includes("Ctrl+f:false") && info.keysBefore.every(k => k.endsWith(":false")), info.keysBefore);
  await page.keyboard.press("Meta+k");
  check("keys: ⌘K focuses the search field", (await active()) === "channelSearch", await active());
  await page.click("#messageInput");
  await page.keyboard.press("Meta+f");
  check("keys: ⌘F focuses the search field", (await active()) === "channelSearch", await active());
  info.keysAfter = await page.evaluate(() => window.__keys.filter(k => /^Meta\+[kf]:/.test(k)));
  check("keys: ⌘K / ⌘F are consumed (preventDefault)", JSON.stringify(info.keysAfter) === JSON.stringify(["Meta+k:true", "Meta+f:true"]), info.keysAfter);
  await page.keyboard.press("Escape");
  await page.fill("#messageInput", "");

  // ---------- Link buttons ----------
  const rowOf = (id) => page.evaluate((mid) => {
    const all = [...document.querySelectorAll("#messagesList .message-row")];
    const row = all.find(r => r.querySelector(`[data-msg="${mid}"]`)) || all.find(r => r.innerText.includes(mid === "k1" ? "文档在这里" : "\u0000"));
    if (!row) return null;
    return {
      inCard: !!row.querySelector(".approval-card"),
      cardState: row.querySelector(".approval-card") ? row.querySelector(".approval-card").dataset.state : null,
      inPlainRow: !!row.querySelector(".components-row"),
      items: [...row.querySelectorAll(".btn-component")].map(e => ({
        tag: e.tagName, label: e.textContent.trim(), cls: e.className.replace(/\s+/g, " ").trim(),
        href: e.getAttribute("href"), hasHref: e.hasAttribute("href"), target: e.getAttribute("target"), rel: e.getAttribute("rel"),
        act: e.dataset.act || null, disabled: e.tagName === "BUTTON" ? e.disabled : null, icon: !!e.querySelector("svg.icon"),
        onAttrs: [...e.attributes].filter(a => /^on/i.test(a.name)).length
      }))
    };
  }, id);

  const k1 = await rowOf("k1");
  info.k1 = k1;
  const byLabel = (row, l) => row.items.find(i => i.label === l);
  check("link-only message: plain .components-row, not an approval card (the 'Cancel plan' label does not count)", k1 && k1.inPlainRow && !k1.inCard, k1 && { inCard: k1.inCard, inPlainRow: k1.inPlainRow });
  const good = byLabel(k1, "Open docs");
  check("link button: renders as <a class='btn-component style-link'> with the exact href", good && good.tag === "A" && good.cls === "btn-component style-link" && good.href === GOOD_URL, good);
  check("link button: target=_blank rel='noopener noreferrer', external icon, no data-act, no on* attribute", good && good.target === "_blank" && good.rel === "noopener noreferrer" && good.icon && good.act === null && good.onAttrs === 0, good);
  check("link button: scheme check is case-insensitive (HTTPS://)", byLabel(k1, "Cancel plan").tag === "A" && byLabel(k1, "Cancel plan").href === "HTTPS://example.org/cancel", byLabel(k1, "Cancel plan"));
  const rejected = ["JS", "JS2", "JS3", "Data", "File", "Relative", "Spaced", "NoHost", "NoUrl", "Off"].map(l => byLabel(k1, l));
  check("link button: javascript: / data: / file: / relative / malformed / missing url render as a disabled <button> with no href", rejected.every(r => r && r.tag === "BUTTON" && r.disabled === true && !r.hasHref && r.act === null && r.cls === "btn-component style-link disabled"), rejected);
  check("link button: a link the bot disabled gets no href either", byLabel(k1, "Off").tag === "BUTTON" && !byLabel(k1, "Off").hasHref, byLabel(k1, "Off"));
  check("link buttons: no element in the stream carries a non-http(s) href", await page.evaluate(() => [...document.querySelectorAll("#messagesList [href]")].every(a => /^https?:\/\//i.test(a.getAttribute("href")))));
  check("link buttons: none sits inside (or is) a [data-act] element", await page.evaluate(() => [...document.querySelectorAll(".style-link")].every(e => !e.closest("[data-act]"))));
  info.linkStyle = await page.evaluate(() => { const a = document.querySelector("a.style-link"); const b = document.querySelector(".btn-component.style-primary, .btn-component.style-secondary"); const pick = (e) => { const cs = getComputedStyle(e); return { bg: cs.backgroundColor, border: cs.borderTopColor, color: cs.color, height: cs.height, deco: cs.textDecorationLine, radius: cs.borderRadius, font: cs.fontSize + "/" + cs.fontWeight }; }; return { link: pick(a), neutral: pick(b) }; });
  check("link button: same neutral look as style-primary/secondary, not underlined", JSON.stringify({ ...info.linkStyle.link, deco: 0 }) === JSON.stringify({ ...info.linkStyle.neutral, deco: 0 }) && info.linkStyle.link.deco === "none", info.linkStyle);

  await page.screenshot({ path: path.join(SHOTS, "01-link-buttons.png"), clip: { x: 240, y: 0, width: 880, height: 740 } });
  await page.screenshot({ path: path.join(SHOTS, "02-sidebar.png"), clip: { x: 0, y: 0, width: 480, height: 740 } });

  // click the good link: opens a new window with the exact URL, the bridge is not called
  const callsBefore = await bridgeCount();
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.click("a.style-link >> text=Open docs")]);
  await popup.waitForLoadState().catch(() => {});
  info.popupUrl = popup.url();
  check("link click: opens the exact URL in a new window (native side hands it to the system browser)", popup.url() === new URL(GOOD_URL).href, { popup: popup.url(), expected: new URL(GOOD_URL).href });
  check("link click: popup has no opener (noopener)", (await popup.evaluate(() => window.opener)) === null);
  await popup.close();
  await page.waitForTimeout(120);
  const newCalls = await page.evaluate((n) => window.__calls.slice(n).map(c => c.action).filter(a => a !== "fetchMessages"), callsBefore);
  check("link click: no sendInteraction and no other bridge call", (await interactions()).length === 0 && newCalls.length === 0, { interactions: await interactions(), newCalls });
  check("link click: the app page itself did not navigate", page.url().startsWith("file:") && page.url().endsWith("/index.html"), page.url());

  // rejected link buttons: forced clicks and synthetic events do nothing
  await page.evaluate(() => document.querySelectorAll("button.style-link").forEach(b => { b.click(); b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); }));
  await page.waitForTimeout(80);
  check("rejected link buttons: forced clicks send nothing and open nothing", (await interactions()).length === 0 && popups.length === 1 && (await page.evaluate(() => window.__pwned)) === undefined, { popups: popups.length });

  // approval card + link button
  const k2 = await rowOf("k2");
  info.k2 = k2;
  check("approval + link: still an approval card, pending, link shown among the actions", k2 && k2.inCard && k2.cardState === "pending" && k2.items.map(i => i.tag + ":" + i.label).join("|") === "BUTTON:Allow Once|A:View diff|BUTTON:Deny", k2 && k2.items.map(i => i.tag + ":" + i.label));
  const [popup2] = await Promise.all([page.waitForEvent("popup"), page.click('.approval-card[data-message-id="k2"] a.style-link')]);
  await popup2.close();
  await page.waitForTimeout(80);
  check("approval + link: clicking the link leaves the card pending and sends no interaction", (await rowOf("k2")).cardState === "pending" && (await interactions()).length === 0, await interactions());
  const k3 = await rowOf("k3");
  info.k3 = k3;
  check("approval + link: all interaction buttons disabled => 'expired' even though the link is live", k3 && k3.inCard && k3.cardState === "expired" && byLabel(k3, "View log").tag === "A", k3 && { state: k3.cardState, items: k3.items.map(i => i.tag + ":" + i.label) });
  await page.click('.approval-card[data-message-id="k2"] .btn-component.style-success');
  await page.waitForSelector('.approval-card[data-message-id="k2"][data-state="approved"]');
  check("approval + link: Allow Once still resolves the card through sendInteraction", JSON.stringify(await interactions()) === JSON.stringify(["k2:allow_once:2"]), await interactions());

  // plain row mixing an interaction button and a link
  const k4 = await rowOf("k4");
  info.k4 = k4;
  check("plain row: interaction button and http:// link side by side", k4 && k4.inPlainRow && !k4.inCard && k4.items.map(i => i.tag + ":" + i.label + ":" + i.act).join("|") === "BUTTON:下一页:component|A:来源:null" && byLabel(k4, "来源").href === "http://example.org/source", k4 && k4.items);
  await page.click('.components-row [data-msg="k4"]');
  await page.waitForTimeout(80);
  check("plain row: the interaction button still sends its custom_id", JSON.stringify(await interactions()) === JSON.stringify(["k2:allow_once:2", "k4:pg:next"]), await interactions());

  check("only the clicked link targets were requested", JSON.stringify(requested.map(u => u.split("?")[0].split("#")[0]).sort()) === JSON.stringify(["https://example.org/diff", "https://example.org/docs"]), requested);
  check("no dialogs fired, window.__pwned unset", dialogs.length === 0 && (await page.evaluate(() => window.__pwned)) === undefined, dialogs);
  check("zero page errors / console errors", errors.length === 0, errors);

  const code = report(results, info);
  await browser.close();
  process.exit(code);
})().catch(harnessFailed);
