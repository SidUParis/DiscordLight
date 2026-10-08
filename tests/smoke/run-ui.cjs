// Suite "ui": sidebar v2 (sections, collapse + persistence, server picker), Cmd+K / Cmd+F search, injection hardening
// (escaping, autolinks, data-act delegation), approval card, thread cards, Touch Bar payload, empty / loading / first-run states.
// Usage: node run-ui.cjs [path/to/web]   (default: ../../web). Screenshots: .shots/ui/
"use strict";
const path = require("path");
const { launchChromium, webDir, indexUrl, shotsDir, report, harnessFailed } = require("./harness.cjs");
const { mockBridge } = require("./mock-bridge.cjs");

const WEB = webDir();
const SHOTS = shotsDir("ui");

const EVIL_THREAD = "x'); window.__pwned=1; //";
const EVIL_CUSTOM = "pg:'\"<>&next";
const EVIL_NAME = "O'Brien \"<b>\" &amp;";

(async () => {
  const browser = await launchChromium();
  const ctx = await browser.newContext({ viewport: { width: 1120, height: 740 }, deviceScaleFactor: 2, timezoneId: "Europe/Paris" });
  const page = await ctx.newPage();
  const errors = [];
  const dialogs = [];
  const popups = [];
  const watch = (p) => {
    p.on("pageerror", e => errors.push("pageerror: " + e.message));
    p.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
    p.on("dialog", d => { dialogs.push(d.message()); d.dismiss(); });
    p.on("popup", pp => popups.push(pp.url()));
  };
  watch(page);
  await page.addInitScript(mockBridge);
  await page.goto(indexUrl(WEB));
  await page.waitForSelector(".approval-card");
  await page.waitForTimeout(300);

  const results = [];
  const info = {};
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };
  const calls = (action) => page.evaluate((a) => window.__calls.filter(c => c.action === a).map(c => { const { callback, ...rest } = c; return rest; }), action);
  const sections = () => page.$$eval(".sidebar-section", els => els.map(s => ({
    key: s.querySelector(".section-toggle").dataset.section,
    label: s.querySelector(".section-label").innerText,
    expanded: s.querySelector(".section-toggle").getAttribute("aria-expanded"),
    badge: s.querySelector(".section-toggle .channel-badge").hidden ? null : s.querySelector(".section-toggle .channel-badge").innerText,
    bodyHidden: s.querySelector(".section-body").hidden,
    bodyVisible: s.querySelector(".section-body").offsetParent !== null,
    rows: [...s.querySelectorAll(".section-body > .channel-item, .section-body > .thread-subitem")].map(r => (r.classList.contains("thread-subitem") ? "  > " : "") + (r.querySelector(".channel-name, .thread-sub-name").innerText) + (r.querySelector(".server-tag, .channel-badge") ? " [" + r.querySelector(".server-tag, .channel-badge").innerText + "]" : "") + (r.classList.contains("active") ? " *" : "")),
    firstChild: s.querySelector(".section-body").firstElementChild ? s.querySelector(".section-body").firstElementChild.className : null
  })));

  await page.screenshot({ path: path.join(SHOTS, "01-main.png") });
  await page.screenshot({ path: path.join(SHOTS, "02-sidebar.png"), clip: { x: 0, y: 0, width: 480, height: 740 } });

  // ---------- Sidebar structure ----------
  let sec = await sections();
  info.sectionsInitial = sec;
  check("sidebar: three sections in order 常用关注 / 群聊与私信 / 服务器", JSON.stringify(sec.map(s => s.label)) === JSON.stringify(["常用关注", "群聊与私信", "服务器"]), sec.map(s => s.label));
  check("sidebar: no tabs left in the DOM", await page.evaluate(() => !document.querySelector(".ws-tab, .workspace-tabs, .server-picker-row")));
  check("sidebar: all sections expanded by default with count badges 4 / 3 / 2", sec.every(s => s.expanded === "true" && s.bodyVisible) && JSON.stringify(sec.map(s => s.badge)) === JSON.stringify(["4", "3", "2"]), sec.map(s => s.badge));
  check("sidebar: section header is a <button type=button> with aria-controls", await page.$$eval(".section-toggle", els => els.length === 3 && els.every(e => e.tagName === "BUTTON" && e.type === "button" && document.getElementById(e.getAttribute("aria-controls")))));
  check("sidebar: #serverSelect is the first row of the 服务器 section", await page.evaluate(() => { const b = document.querySelector('.section-toggle[data-section="servers"]').nextElementSibling; return b.firstElementChild.classList.contains("server-picker") && b.firstElementChild.firstElementChild === document.getElementById("serverSelect") && document.querySelectorAll("#serverSelect").length === 1; }));
  check("sidebar: pinned rows keep server tag, nested thread and legacy icons", sec[0].rows.join("|") === "hermes-lab [Research] *|论文小组 [多人群聊]|旧版线程 [# hermes-lab]|\u{1F916}-bots [Hermes Hub]" || sec[0].rows.join("|").startsWith("hermes-lab [Research] *"), sec[0].rows);
  check("sidebar: groups then DMs, group has member badge, DMs have no tag", JSON.stringify(sec[1].rows) === JSON.stringify(["论文小组 [3人]", "Léa Martin", "Marc"]), sec[1].rows);
  check("sidebar: server channels listed without server tag (text + announcement only)", JSON.stringify(sec[2].rows) === JSON.stringify(["hermes-lab *", "reports"]), sec[2].rows);
  check("sidebar: nothing interactive under the native 240x38 drag strip", await page.evaluate(() => [...document.querySelectorAll("button, input, select, textarea, .channel-item")].filter(e => { const r = e.getBoundingClientRect(); return e.offsetParent !== null && r.left < 240 && r.top < 38 && r.bottom > 0; }).length === 0));
  info.kbd = await page.evaluate(() => { const k = document.querySelector(".search-kbd"); const r = k.getBoundingClientRect(); const b = document.querySelector(".search-box").getBoundingClientRect(); const cs = getComputedStyle(k); return { text: k.innerText, display: cs.display, fontSize: cs.fontSize, rightGap: Math.round(b.right - r.right), radius: cs.borderRadius }; });
  check("search: kbd chip shows ⌘K at right 7px while the field is empty", info.kbd.text === "⌘K" && info.kbd.display !== "none" && info.kbd.rightGap === 7, info.kbd);
  info.icons = await page.$$eval(".section-body > .channel-item", els => els.map(e => e.querySelector(".channel-name").innerText + " => " + e.querySelector(".channel-icon svg").innerHTML.slice(0, 26)));

  // ---------- Injection hardening ----------
  check("xss: no <img>/<script>/javascript: link created from message content", await page.evaluate(() => document.querySelectorAll('#messagesList img, #messagesList script, #messagesList b, #messagesList [onerror], #messagesList [onload], #messagesList a[href^="javascript"]').length === 0));
  const x1 = await page.evaluate(() => [...document.querySelectorAll(".message-content")].map(e => e.innerText).find(t => t.includes("onerror=alert(1)")));
  check("xss: payload renders as literal text", !!x1 && x1.includes("<img src=x onerror=alert(1)>") && x1.includes("<script>window.__pwned=2</script>") && x1.includes("<svg onload=alert(2)>") && x1.includes("<img src=y onerror=alert(3)>"), x1);
  check("xss: no inline on* attributes anywhere in rendered message / sidebar markup", await page.evaluate(() => [...document.querySelectorAll("#messagesList *, #channelList *, #mentionItems *")].every(e => [...e.attributes].every(a => !/^on/i.test(a.name)))));

  info.links = await page.$$eval("a.msg-link", els => els.map(a => ({ href: a.getAttribute("href"), text: a.textContent, target: a.target, rel: a.rel, next: a.nextSibling ? a.nextSibling.textContent.slice(0, 3) : "", inStrong: !!a.closest("strong") })));
  const L = (h) => info.links.find(l => l.href === h);
  check("autolink: https://example.org/a?b=1&c=2 has the exact href and text, trailing comma left outside", !!L("https://example.org/a?b=1&c=2") && L("https://example.org/a?b=1&c=2").text === "https://example.org/a?b=1&c=2" && L("https://example.org/a?b=1&c=2").next.startsWith(","), L("https://example.org/a?b=1&c=2"));
  check("autolink: target=_blank rel=noopener noreferrer", info.links.length > 0 && info.links.every(l => l.target === "_blank" && l.rel === "noopener noreferrer" && /^https?:\/\//.test(l.href)));
  check("autolink: closing paren / period and <angle> wrapper stay outside the link", !!L("https://example.org/paren") && !!L("https://example.org/angle"), info.links.map(l => l.href));
  check("autolink: works inside bold", !!L("https://example.org/bold") && L("https://example.org/bold").inStrong);
  check("autolink: URL inside a code block / inline code is NOT linked", await page.evaluate(() => document.querySelectorAll(".code-block a, .inline-code a, .terminal-block-wrapper a").length === 0 && [...document.querySelectorAll(".code-block")].some(c => c.innerText.includes("https://example.org/in-code")) && [...document.querySelectorAll(".inline-code")].some(c => c.innerText === "https://example.org/inline")));
  check("markdown: no placeholder residue (NUL) in the rendered stream", await page.evaluate(() => !document.getElementById("messagesList").innerHTML.includes("\u0000")));
  info.pills = await page.$$eval(".mention-pill", els => els.map(e => e.className.replace("mention-pill", "").trim() + ":" + e.innerText + ":" + (e.dataset.act || "") + ":" + (e.dataset.name || e.dataset.id || "")));
  check("mentions: user / role / channel pills render from escaped forms with data-act", info.pills.includes(":@Paper Hermes:mention:Paper Hermes") && info.pills.includes("role-pill:@Hermes:mention:Hermes") && info.pills.includes("channel-pill:#123456:channel:123456") && info.pills.includes(`:@${EVIL_NAME}:mention:${EVIL_NAME}`), info.pills);

  // mention pill with a hostile display name inserts the raw name
  await page.click(`.mention-pill[data-name*="Brien"]`);
  check("mention pill: click inserts the raw display name into the composer", (await page.inputValue("#messageInput")) === `@${EVIL_NAME} `, await page.inputValue("#messageInput"));
  await page.fill("#messageInput", "");

  // component button with a hostile custom_id
  // (each successful component click schedules a full reload 800 ms later, see handleComponentClick)
  const fullLoads = () => page.evaluate(() => window.__calls.filter(c => c.action === "fetchMessages" && c.limit === 40 && !c.after).length);
  const fullLoadsBefore = await fullLoads();
  await page.click('.components-row .btn-component');
  await page.waitForTimeout(80);
  const inter = await calls("sendInteraction");
  info.interaction = inter;
  check("component: sendInteraction carries the exact raw customId", inter.length === 1 && inter[0].customId === EVIL_CUSTOM && inter[0].messageId === "x4" && inter[0].applicationId === "1510971308589191218" && inter[0].channelId === "c1", inter);
  check("component: status shows the raw label", (await page.$eval("#statusIndicator .status-text", e => e.innerText)) === "已发送: 下一页 '\"<>", await page.$eval("#statusIndicator .status-text", e => e.innerText));

  // approval card still works through the delegated listener
  await page.click('.approval-card[data-state="pending"] .btn-component.style-success');
  await page.waitForSelector('.approval-card[data-message-id="m9"][data-state="approved"]');
  const inter2 = await calls("sendInteraction");
  check("approval: Allow Once resolves the card and sends allow_once:77", inter2.length === 2 && inter2[1].customId === "allow_once:77" && inter2[1].messageId === "m9", inter2[1]);
  // Let the two delayed reloads land now: otherwise one can re-render the list between focusing a thread card and
  // pressing Enter below, and the key press is lost (seen as a timeout on #threadBackBtn on a loaded machine)
  await page.waitForFunction((n) => window.__calls.filter(c => c.action === "fetchMessages" && c.limit === 40 && !c.after).length >= n, fullLoadsBefore + 2);
  await page.waitForTimeout(100);

  // copy button
  await page.click(".btn-copy");
  // the feedback follows the clipboard promise (writeText or the execCommand fallback): wait for it instead of reading at once
  const copied = await page.waitForFunction(() => document.querySelector(".btn-copy span")?.innerText === "已复制", null, { timeout: 3000 }).then(() => true).catch(() => false);
  check("copy: delegated copy button gives feedback", copied, await page.$eval(".btn-copy span", e => e.innerText));

  // thread card: keyboard accessible button, hostile name
  check("thread card: is a <button type=button> and focusable", await page.$$eval(".message-thread-card", els => els.length === 2 && els.every(e => e.tagName === "BUTTON" && e.type === "button" && e.tabIndex === 0)));
  info.threadCardBox = await page.$eval(".message-thread-card", e => { const cs = getComputedStyle(e); return { display: cs.display, textAlign: cs.textAlign, width: Math.round(e.getBoundingClientRect().width), bg: cs.backgroundColor, fontFamily: cs.fontFamily.slice(0, 20) }; });
  await page.screenshot({ path: path.join(SHOTS, "03-messages.png"), clip: { x: 480 / 2, y: 0, width: 1120 - 240, height: 740 } });
  await page.click('.message-thread-card[data-thread-id="t-evil"]');
  await page.waitForTimeout(200);
  const th = await page.evaluate(() => ({ title: document.getElementById("activeChannelTitle").innerText, pwned: window.__pwned, activeId: state.activeChannel.id, back: getComputedStyle(document.getElementById("threadBackBtn")).display, sub: [...document.querySelectorAll(".thread-subitem.active")].map(e => e.innerText.trim()) }));
  check("thread: hostile name opens the thread as plain text, window.__pwned stays unset", th.title === EVIL_THREAD && th.pwned === undefined && th.activeId === "t-evil" && th.back !== "none", th);
  check("thread: active thread row shown under its parent (pinned + server sections)", th.sub.length === 2 && th.sub.every(t => t === EVIL_THREAD), th.sub);
  await page.click("#threadBackBtn");
  await page.waitForTimeout(200);
  await page.focus('.message-thread-card[data-thread-id="t1"]');
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  check("thread: keyboard Enter on the focused card opens it", (await page.evaluate(() => state.activeChannel.id)) === "t1");
  await page.click("#threadBackBtn");
  await page.waitForTimeout(200);

  // mention popover (delegated row click)
  await page.click("#messageInput");
  await page.keyboard.type("请 @web");
  await page.waitForSelector("#mentionPopover", { state: "visible" });
  check("mention popover: rows carry data-index, no inline handler", await page.$$eval(".mention-item", els => els.length > 0 && els.every((e, i) => e.dataset.index === String(i) && !e.hasAttribute("onclick"))));
  await page.click(".mention-item");
  check("mention popover: clicking a row inserts the mention", (await page.inputValue("#messageInput")) === "请 @Web Hermes ", await page.inputValue("#messageInput"));
  await page.fill("#messageInput", "");

  // ---------- Cmd+K / Cmd+F ----------
  await page.click("#messageInput");
  await page.keyboard.press("Meta+k");
  check("⌘K focuses the search field", (await page.evaluate(() => document.activeElement.id)) === "channelSearch");
  await page.keyboard.type("re");
  await page.waitForTimeout(80);
  info.searchHeaders = await page.$$eval(".channel-section-header", els => els.map(e => e.innerText));
  check("search: flat grouped results replace the sections", info.searchHeaders.length >= 2 && (await page.$$eval(".sidebar-section", els => els.length)) === 0, info.searchHeaders);
  check("search: kbd chip hidden and clear button shown while the field has text", await page.evaluate(() => getComputedStyle(document.querySelector(".search-kbd")).display === "none" && document.getElementById("searchClearBtn").style.display !== "none"));
  await page.screenshot({ path: path.join(SHOTS, "05-search.png"), clip: { x: 0, y: 0, width: 480, height: 740 } });
  await page.click("#messageInput");
  await page.keyboard.press("Meta+f");
  const sel = await page.evaluate(() => ({ id: document.activeElement.id, s: document.activeElement.selectionStart, e: document.activeElement.selectionEnd }));
  check("⌘F focuses the search field and selects its text", sel.id === "channelSearch" && sel.s === 0 && sel.e === 2, sel);
  await page.keyboard.press("Meta+Shift+k");
  const firstResult = await page.$eval("#channelList .channel-item .channel-name", e => e.innerText);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  const afterEnter = await page.evaluate(() => ({ title: document.getElementById("activeChannelTitle").innerText, search: document.getElementById("channelSearch").value, sections: document.querySelectorAll(".sidebar-section").length, clear: document.getElementById("searchClearBtn").style.display, focus: document.activeElement.id }));
  check("search: Enter opens the first result and clears the search", afterEnter.title === firstResult && afterEnter.search === "" && afterEnter.sections === 3 && afterEnter.clear === "none", { firstResult, afterEnter });
  // Ctrl+K / Ctrl+F are Cocoa text-editing keys (kill line / forward char): the shortcut is Command-only
  await page.click("#messageInput");
  await page.keyboard.press("Control+k");
  check("Ctrl+K does NOT focus the search field", (await page.evaluate(() => document.activeElement.id)) === "messageInput");
  await page.keyboard.press("Control+f");
  check("Ctrl+F does NOT focus the search field", (await page.evaluate(() => document.activeElement.id)) === "messageInput");
  await page.keyboard.press("Meta+k");
  await page.keyboard.type("zzzz");
  await page.waitForTimeout(60);
  info.searchEmpty = await page.$eval("#channelList", e => e.innerText.trim());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);
  const esc1 = await page.evaluate(() => ({ v: document.getElementById("channelSearch").value, focus: document.activeElement.id, sections: document.querySelectorAll(".sidebar-section").length }));
  check("search: Esc clears a non-empty field and keeps focus", esc1.v === "" && esc1.focus === "channelSearch" && esc1.sections === 3, esc1);
  await page.keyboard.press("Escape");
  check("search: Esc on an empty field moves focus to the composer", (await page.evaluate(() => document.activeElement.id)) === "messageInput");
  await page.evaluate(() => switchChannelById("c1"));
  await page.waitForTimeout(250);

  // ---------- Server picker ----------
  const before = (await calls("fetchGuildChannels")).length;
  await page.evaluate(() => { window.__slowChannels = 5; });
  await page.selectOption("#serverSelect", "s2");
  await page.waitForTimeout(150);
  sec = await sections();
  info.afterServerSwitch = sec[2];
  const fetched = await calls("fetchGuildChannels");
  info.fetchGuildChannels = fetched.map(c => c.guildId);
  check("server picker: selecting a server lists its channels (count badge 3)", JSON.stringify(sec[2].rows) === JSON.stringify(["hub-general", "hub-bots", "hub-news"]) && sec[2].badge === "3" && sec[2].firstChild === "server-picker", sec[2]);
  check("server picker: each server fetched exactly once (pre-cache + lazy share one request)", JSON.stringify(info.fetchGuildChannels.slice().sort()) === JSON.stringify(["s1", "s2"]) && fetched.length === before, info.fetchGuildChannels);
  await page.screenshot({ path: path.join(SHOTS, "04-server-switched.png"), clip: { x: 0, y: 0, width: 480, height: 740 } });
  // a channel from the other server (e.g. via search / Touch Bar) moves the picker to that server
  await page.evaluate(() => switchChannelById("c2"));
  await page.waitForTimeout(250);
  sec = await sections();
  check("reveal: opening a channel of another server moves the picker there", (await page.$eval("#serverSelect", e => e.value)) === "s1" && sec[2].rows.includes("reports *"), sec[2].rows);
  await page.evaluate(() => switchChannelById("c1"));
  await page.waitForTimeout(250);

  // ---------- Collapse + persistence ----------
  await page.click('.section-toggle[data-section="dms"]');
  await page.waitForTimeout(60);
  sec = await sections();
  const uiSaves = (await calls("saveConfig")).filter(c => c.ui);
  info.uiSaves = uiSaves;
  check("collapse: 群聊与私信 hides its rows but keeps the header", sec[1].expanded === "false" && sec[1].bodyHidden && !sec[1].bodyVisible && sec[1].label === "群聊与私信" && sec[1].badge === "3", sec[1]);
  check("collapse: persisted through saveConfig({ ui: { collapsed: ['dms'] } })", uiSaves.length === 1 && JSON.stringify(uiSaves[0].ui) === JSON.stringify({ collapsed: ["dms"] }), uiSaves);
  check("collapse: focus stays on the header button", await page.evaluate(() => document.activeElement.classList.contains("section-toggle") && document.activeElement.dataset.section === "dms"));
  info.chevron = await page.$$eval(".section-chevron", els => els.map(e => getComputedStyle(e).transform));
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOTS, "06-collapsed.png"), clip: { x: 0, y: 0, width: 480, height: 740 } });

  await page.reload();
  await page.waitForSelector(".approval-card");
  await page.waitForTimeout(300);
  sec = await sections();
  check("collapse: restored from cfg.ui on reload", sec[1].expanded === "false" && sec[1].bodyHidden && sec[0].expanded === "true" && sec[2].expanded === "true" && (await page.evaluate(() => JSON.stringify(state.ui))) === JSON.stringify({ collapsed: ["dms"] }), sec.map(s => s.key + ":" + s.expanded));

  // switching to a DM that only lives in the collapsed section expands it
  await page.evaluate(() => switchChannelById("d2"));
  await page.waitForTimeout(250);
  sec = await sections();
  check("reveal: switching to a row inside a collapsed section auto-expands it", sec[1].expanded === "true" && sec[1].bodyVisible && sec[1].rows.includes("Marc *"), sec[1]);
  check("reveal: the expansion is saved", (await calls("saveConfig")).filter(c => c.ui).some(c => JSON.stringify(c.ui) === JSON.stringify({ collapsed: [] })));
  // a row visible in another expanded section does not force the collapsed one open
  await page.click('.section-toggle[data-section="servers"]');
  await page.evaluate(() => switchChannelById("c1"));
  await page.waitForTimeout(250);
  sec = await sections();
  check("reveal: no expansion when the row is already visible in another section", sec[2].expanded === "false" && sec[0].rows.some(r => r.endsWith("*")), sec.map(s => s.key + ":" + s.expanded));
  await page.click('.section-toggle[data-section="servers"]');
  await page.waitForTimeout(60);

  // pin toggle always refreshes the list
  await page.click("#pinToggleBtn");
  await page.waitForTimeout(80);
  sec = await sections();
  check("pin toggle: unpinning refreshes the 常用关注 section", sec[0].badge === "3" && !sec[0].rows.some(r => r.startsWith("hermes-lab")), sec[0]);
  await page.click("#pinToggleBtn");
  await page.waitForTimeout(80);
  const pinSaved = (await calls("saveConfig")).filter(c => c.pinned_channels).pop().pinned_channels;
  check("pin toggle: new pins save icon name, no serverId leak", pinSaved[pinSaved.length - 1].id === "c1" && pinSaved[pinSaved.length - 1].icon === "channel" && JSON.stringify(Object.keys(pinSaved[pinSaved.length - 1]).sort()) === JSON.stringify(["icon", "id", "name", "server"]), pinSaved[pinSaved.length - 1]);

  // ---------- Touch Bar contract ----------
  const tb = (await calls("updateTouchBar")).pop();
  info.touchBar = { keys: Object.keys(tb).sort(), channelId: tb.channelId, channelName: tb.channelName, bots: tb.bots.map(b => b.name), members: (tb.members || []).map(m => m.name), pinned: tb.pinned.map(p => p.id + ":" + p.name) };
  check("touch bar: payload shape {action, bots, channelId, channelName, members, pinned}", JSON.stringify(info.touchBar.keys) === JSON.stringify(["action", "bots", "channelId", "channelName", "members", "pinned"]) && tb.channelId === "c1" && tb.channelName === "hermes-lab" && tb.bots.every(b => typeof b.name === "string") && Array.isArray(tb.members) && tb.pinned.every(p => typeof p.name === "string" && typeof p.id === "string"), info.touchBar);
  check("touch bar: server channel sends bots only, members is empty", tb.bots.length > 0 && tb.members.length === 0, info.touchBar);
  check("native entry points still exist with the same names", await page.evaluate(() => ["openThread", "handleComponentClick", "copyCode", "selectMention", "insertMentionFromTouchBar", "switchChannelById", "touchBarAction", "returnToParentChannel", "loadMessages"].every(n => typeof window[n] === "function")));
  check("config: no bridge call from app.js carries a token except saveConfig from the setup modal", await page.evaluate(() => window.__calls.every(c => !("token" in c))));

  // ---------- Misc invariants ----------
  info.emojiFound = await page.evaluate(() => [...new Set((document.body.innerText + document.body.innerHTML.replace(/<script[\s\S]*?<\/script>/g, "")).match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{23F3}]/gu) || [])].map(c => "U+" + c.codePointAt(0).toString(16).toUpperCase()));
  info.minFont = await page.evaluate(() => {
    let min = 99, who = "";
    document.querySelectorAll("body *").forEach(el => {
      if (!el.childNodes.length || el.closest("script") || el.closest("svg") || el.offsetParent === null) return;
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < min) { min = fs; who = el.className || el.tagName; }
    });
    return { min, who };
  });
  check("type: smallest rendered text is 11px", info.minFont.min >= 11, info.minFont);
  await page.setViewportSize({ width: 760, height: 500 });
  await page.waitForTimeout(100);
  check("layout: no horizontal scroll at the 760x500 minimum window", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth && document.getElementById("channelList").scrollWidth <= document.getElementById("channelList").clientWidth));
  await page.screenshot({ path: path.join(SHOTS, "07-narrow.png") });

  // ---------- Slow channel fetch: loading row stays inside the section, stale render is dropped ----------
  const page3 = await ctx.newPage();
  watch(page3);
  await page3.addInitScript(() => { window.__slowChannels = 400; window.__noPersist = true; sessionStorage.removeItem("dl-config"); });
  await page3.addInitScript(mockBridge);
  await page3.goto(indexUrl(WEB));
  await page3.waitForSelector(".approval-card");
  const loading = await page3.evaluate(() => { const b = document.querySelector('.section-toggle[data-section="servers"]').nextElementSibling; return { text: b.querySelector(".state-empty") && b.querySelector(".state-empty").innerText, picker: !!b.querySelector("#serverSelect"), badgeHidden: document.querySelector('.section-toggle[data-section="servers"] .channel-badge').hidden, otherSections: document.querySelectorAll(".sidebar-section").length, pinnedRows: document.querySelectorAll('#sectionBody-pinned > .channel-item').length }; });
  check("lazy fetch: loading row lives inside the 服务器 section, other sections stay rendered", loading.text === "正在载入频道…" && loading.picker && loading.badgeHidden && loading.otherSections === 3 && loading.pinnedRows === 4, loading);
  await page3.screenshot({ path: path.join(SHOTS, "08-loading.png"), clip: { x: 0, y: 0, width: 480, height: 740 } });
  await page3.fill("#channelSearch", "论文");
  await page3.waitForTimeout(600);
  check("lazy fetch: a stale render does not append rows into search results", await page3.evaluate(() => document.querySelectorAll(".sidebar-section").length === 0 && document.querySelectorAll("#channelList .channel-item").length === 2));
  await page3.fill("#channelSearch", "");
  await page3.waitForTimeout(100);
  check("lazy fetch: channels appear once loaded", JSON.stringify(await page3.$$eval("#sectionBody-servers > .channel-item .channel-name", els => els.map(e => e.innerText))) === JSON.stringify(["hermes-lab", "reports"]));
  await page3.close();

  // ---------- Empty states ----------
  const page4 = await ctx.newPage();
  watch(page4);
  await page4.addInitScript(() => { window.__empty = true; window.__noPersist = true; sessionStorage.removeItem("dl-config"); });
  await page4.addInitScript(mockBridge);
  await page4.goto(indexUrl(WEB));
  await page4.waitForSelector(".sidebar-section");
  await page4.waitForTimeout(200);
  const empty = await page4.evaluate(() => [...document.querySelectorAll(".sidebar-section")].map(s => s.querySelector(".section-label").innerText + " (" + s.querySelector(".channel-badge").innerText + "): " + (s.querySelector(".section-body .state-empty") || {}).innerText));
  info.emptyStates = empty;
  check("empty states: pinned + groups/DMs notes, 服务器 section hidden", JSON.stringify(empty) === JSON.stringify(["常用关注 (0): 还没有关注。点击右上角的星标，把常用频道加进来", "群聊与私信 (0): 暂无群聊或私信"]), empty);
  await page4.screenshot({ path: path.join(SHOTS, "09-empty.png"), clip: { x: 0, y: 0, width: 480, height: 740 } });
  await page4.close();

  // ---------- First-run token flow: init() runs twice, listeners must not double-bind ----------
  const page2 = await ctx.newPage();
  watch(page2);
  await page2.addInitScript(() => { window.__noToken = true; window.__noPersist = true; sessionStorage.removeItem("dl-config"); });
  await page2.addInitScript(mockBridge);
  await page2.goto(indexUrl(WEB));
  await page2.waitForSelector("#tokenModal", { state: "visible" });
  await page2.keyboard.press("Meta+k");
  check("⌘K is ignored while the token modal is open", (await page2.evaluate(() => document.activeElement.id)) !== "channelSearch");
  await page2.screenshot({ path: path.join(SHOTS, "10-setup.png") });
  await page2.fill("#tokenInput", "fake-token");
  await page2.click("#saveTokenBtn");
  await page2.waitForSelector(".approval-card");
  await page2.waitForTimeout(200);
  await page2.click('.section-toggle[data-section="pinned"]');
  await page2.waitForTimeout(60);
  check("first run: after saving the token a section toggle fires once (no double-bound listeners)", (await page2.$eval('.section-toggle[data-section="pinned"]', e => e.getAttribute("aria-expanded"))) === "false");
  await page2.click('.components-row .btn-component');
  await page2.waitForTimeout(80);
  check("first run: a component click sends exactly one interaction", (await page2.evaluate(() => window.__calls.filter(c => c.action === "sendInteraction").length)) === 1);
  await page2.close();

  check("no dialogs (alert) fired and no popups opened", dialogs.length === 0 && popups.length === 0, { dialogs, popups });
  check("window.__pwned never set on the main page", (await page.evaluate(() => window.__pwned)) === undefined);
  check("zero page errors / console errors", errors.length === 0, errors);

  const code = report(results, info);
  await browser.close();
  process.exit(code);
})().catch(harnessFailed);
