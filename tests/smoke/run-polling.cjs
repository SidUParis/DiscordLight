// Suite "polling": lightweight polling. Incremental `after` polls (empty answer = no DOM work), the resync every 12th
// poll (limit 15), visible / hidden interval via window.setAppVisible and the visibilitychange fallback, one poll in
// flight at a time, stale answers dropped on channel switch, bursts that need a full reload, bridge payloads unchanged,
// polling paused while the token modal is open, and the default 2.5 s / 15 s cadence on a fake clock.
// Pages A and B shorten the intervals through window.__DL_POLL_MS (a test-only override read by app.js); the timing
// assertions on them allow some slack but expect a machine that is not under heavy load.
// The mock below has numeric snowflake ids and an `after`-aware fetchMessages, so it is kept here instead of mock-bridge.cjs.
// Usage: node run-polling.cjs [path/to/web]   (default: ../../web)
"use strict";
const { launchChromium, webDir, indexUrl, report, harnessFailed } = require("./harness.cjs");

const WEB = webDir();

function mock7() {
  const calls = [];
  window.__calls = calls;
  const base = 1300000000000000000n;
  const sid = (n) => String(base + BigInt(n));
  const ts = (min) => new Date(Date.UTC(2026, 9, 7, 8, 0, 0) + min * 60000).toISOString();
  const paper = { id: "1491193341612654642", username: "bot1491193341612654642", bot: true };
  const web = { id: "1510971308589191218", username: "Web Hermes", bot: true };
  const me = { id: "900100200300400500", username: "sidney", global_name: "Sidney" };
  const lea = { id: "900100200300400777", username: "lea", global_name: "Léa Martin" };
  const approval = (tag, disabled) => [{ type: 1, components: [
    { type: 2, style: 3, label: "Allow Once", custom_id: `allow_once:${tag}`, disabled },
    { type: 2, style: 4, label: "Deny", custom_id: `deny:${tag}`, disabled }
  ] }];
  // newest first, like Discord
  const mk = (ch, from, to) => {
    const out = [];
    for (let i = to; i >= from; i--) {
      out.push({ id: sid(i), channel_id: ch, author: i % 3 === 0 ? lea : (i % 2 ? web : me), timestamp: ts((i % 100) * 7), content: `${ch} 消息 #${i}` });
    }
    return out;
  };
  const c1 = mk("c1", 1, 20);
  c1[0].author = paper; c1[0].content = "需要运行 `make install`，请确认"; c1[0].components = approval("c1", false);
  c1[3].thread = { id: "t1", name: "构建日志", message_count: 3 };
  const c2 = mk("c2", 501, 525);
  c2[0].author = paper; c2[0].content = "c2 审批：部署到 staging？"; c2[0].components = approval("c2", false);
  c2[2].thread = { id: "t2", name: "部署线程", message_count: 1 };
  const channels = { c1, c2 };
  const M = window.__mock = { channels, sid, ts, lea, me, paper, delay: 5, inflight: 0, maxInflight: 0, next: 1000 };
  const copy = (x) => JSON.parse(JSON.stringify(x));

  const responses = {
    getConfig: () => ({ hasToken: !window.__noToken, last_channel_id: "c1", pinned_channels: [
      { id: "c1", name: "# lab", server: "Research" },
      { id: "c2", name: "# ops", server: "Research" }
    ] }),
    fetchCurrentUser: () => ({ user: me }),
    fetchDMs: () => ({ dms: [] }),
    fetchGuilds: () => ({ guilds: [{ id: "s1", name: "Research" }] }),
    fetchGuildChannels: () => ({ channels: [{ id: "c1", name: "lab", type: 0 }, { id: "c2", name: "ops", type: 0 }] }),
    fetchMessages: (d) => {
      let list = channels[d.channelId] || [];
      if (d.after !== undefined) {
        // Discord: the `limit` messages right after the id, newest first
        list = list.filter(m => BigInt(m.id) > BigInt(d.after));
        list = list.slice(Math.max(0, list.length - d.limit));
      } else {
        list = list.slice(0, d.limit);
      }
      return { messages: copy(list) };
    },
    sendInteraction: () => ({ success: true }),
    sendMessage: (d) => {
      channels[d.channelId].unshift({ id: sid(M.next++), channel_id: d.channelId, author: me, timestamp: ts(900), content: d.content });
      return { success: true };
    },
    saveConfig: (d) => { if (d.token) window.__noToken = false; return { success: true }; },
    updateTouchBar: () => ({ success: true })
  };

  window.webkit = { messageHandlers: { discordBridge: { postMessage(msg) {
    const rec = JSON.parse(JSON.stringify(msg));
    rec.t = performance.now();
    rec.wall = Date.now();
    calls.push(rec);
    const isPoll = msg.action === "fetchMessages" && msg.limit !== 40;
    if (isPoll) { M.inflight++; M.maxInflight = Math.max(M.maxInflight, M.inflight); }
    const delay = msg.action === "fetchMessages" ? M.delay : 5;
    setTimeout(() => {
      if (isPoll) M.inflight--;
      const fn = responses[msg.action];
      const res = fn ? fn(msg) : {};
      if (res && res.messages) {
        rec.n = res.messages.length;
        rec.top = res.messages.length ? res.messages[0].id : null;
        rec.doneT = performance.now();
      }
      if (window[msg.callback]) window[msg.callback](res);
    }, delay);
  } } } };
}

const META = ["callback", "t", "wall", "n", "top", "doneT"];
const keysOf = (c) => Object.keys(c).filter(k => !META.includes(k)).sort().join(",");
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const gapsOf = (ts) => ts.slice(1).map((t, i) => Math.round(t - ts[i]));

(async () => {
  const browser = await launchChromium();
  const ctx = await browser.newContext({ viewport: { width: 1120, height: 740 }, timezoneId: "Europe/Paris" });
  const errors = [];
  const watch = (p, tag) => {
    p.on("pageerror", e => errors.push(`${tag} pageerror: ${e.message}`));
    p.on("console", m => { if (m.type() === "error") errors.push(`${tag} console: ${m.text()}`); });
  };
  const results = [];
  const info = {};
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };

  // ================= Page A: 150 ms active / 900 ms hidden =================
  const page = await ctx.newPage();
  watch(page, "A");
  await page.addInitScript(() => { window.__DL_POLL_MS = { active: 150, hidden: 900 }; });
  await page.addInitScript(mock7);
  await page.goto(indexUrl(WEB));
  await page.waitForSelector(".approval-card");
  await page.waitForTimeout(50);

  const sid = (n) => String(1300000000000000000n + BigInt(n));
  const fm = () => page.evaluate(() => window.__calls.filter(c => c.action === "fetchMessages"));
  const allCalls = () => page.evaluate(() => window.__calls.length);
  const fmSince = async (mark) => (await page.evaluate((m) => window.__calls.slice(m).filter(c => c.action === "fetchMessages"), mark));
  const waitFm = (mark, n, pred, timeout = 15000) => page.waitForFunction(([m, k, p]) => {
    const f = new Function("c", "return " + p);
    return window.__calls.slice(m).filter(c => c.action === "fetchMessages" && f(c) && c.n !== undefined).length >= k;
  }, [mark, n, pred || "true"], { timeout });
  const statusText = () => page.$eval("#statusIndicator .status-text", e => e.textContent);
  const observe = () => page.evaluate(() => {
    if (window.__obs) window.__obs.disconnect();
    window.__mut = 0;
    window.__mutT = [];
    window.__obs = new MutationObserver(recs => { window.__mut += recs.length; window.__mutT.push(performance.now()); });
    window.__obs.observe(document.getElementById("messagesList"), { childList: true, subtree: true, characterData: true, attributes: true });
  });
  const mut = () => page.evaluate(() => ({ n: window.__mut, t: window.__mutT.slice() }));
  const tbCount = () => page.evaluate(() => window.__calls.filter(c => c.action === "updateTouchBar").length);

  // ---------- (1) idle polls carry `after` = top id, return [], no re-render ----------
  const first = (await fm())[0];
  info.loadCall = { keys: keysOf(first), limit: first.limit, after: first.after };
  check("(1) load: first fetchMessages is the full load {channelId, limit: 40}, no after", keysOf(first) === "action,channelId,limit" && first.limit === 40 && first.channelId === "c1", info.loadCall);

  await observe();
  const html0 = await page.$eval("#messagesList", e => e.innerHTML);
  const tb0 = await tbCount();
  let mark = await allCalls();
  await waitFm(mark, 8);
  const idle = await fmSince(mark);
  const afterPolls = idle.filter(c => c.after !== undefined);
  info.idlePolls = idle.map(c => `${c.limit}/${c.after ? c.after.slice(-4) : "-"}/n=${c.n}`);
  check("(1) idle: >= 6 incremental polls, each {channelId: c1, limit: 50, after: top id} returning []", afterPolls.length >= 6 && afterPolls.every(c => c.channelId === "c1" && c.limit === 50 && c.after === sid(20) && (c.n === 0 || c.n === undefined)), info.idlePolls);
  check("(1) idle: poll payload keys are exactly {action, after, channelId, limit}", afterPolls.every(c => keysOf(c) === "action,after,channelId,limit"), afterPolls.map(keysOf));
  check("(1) idle: the only non-`after` polls are resyncs (limit 15)", idle.filter(c => c.after === undefined).every(c => c.limit === 15), idle.filter(c => c.after === undefined));
  const m1 = await mut();
  check("(1) idle: no DOM re-render (innerHTML identical, 0 mutations, no updateTouchBar)", (await page.$eval("#messagesList", e => e.innerHTML)) === html0 && m1.n === 0 && (await tbCount()) === tb0, { mutations: m1.n, tb: [(await tbCount()), tb0] });
  info.activeGaps = gapsOf(idle.map(c => c.t));
  check("(3a) active interval: median gap ~150 ms (override), none above 400", median(info.activeGaps) >= 130 && median(info.activeGaps) <= 220 && Math.max(...info.activeGaps) < 400, info.activeGaps);
  check("status: idle text 已连接 while visible", (await statusText()) === "已连接", await statusText());

  // ---------- (2) a new message: next poll returns it, appended at the bottom, top id advances ----------
  const rowsBefore = await page.$$eval("#messagesList .message-row", e => e.length);
  const newA = sid(1000);
  mark = await allCalls();
  await page.evaluate(() => { const M = window.__mock; M.channels.c1.unshift({ id: M.sid(M.next++), channel_id: "c1", author: M.lea, timestamp: M.ts(400), content: "NEW-A 新消息" }); });
  await page.waitForFunction(() => document.getElementById("messagesList").innerText.includes("NEW-A"));
  const delivered = (await fmSince(mark)).find(c => c.n === 1);
  check("(2) the next `after` poll returned exactly the new message", !!delivered && delivered.after === sid(20) && delivered.limit === 50 && delivered.top === newA, delivered);
  const dom2 = await page.evaluate(() => { const rows = [...document.querySelectorAll("#messagesList .message-row")]; return { rows: rows.length, last: rows[rows.length - 1].innerText, hasOldest: document.getElementById("messagesList").innerText.includes("c1 消息 #1\n") || [...document.querySelectorAll(".message-content")].some(e => e.innerText === "c1 消息 #1") }; });
  check("(2) DOM: new message is the last row, all earlier messages kept (rows +1, oldest still shown)", dom2.last.includes("NEW-A") && dom2.rows === rowsBefore + 1 && dom2.hasOldest, { rowsBefore, ...dom2 });
  mark = await allCalls();
  await waitFm(mark, 1, "c.after !== undefined");
  const nextAfter = (await fmSince(mark)).find(c => c.after !== undefined);
  check("(2) top id advanced: the following poll carries after = the new id", nextAfter.after === newA, nextAfter.after);
  await observe();
  mark = await allCalls();
  await waitFm(mark, 4);
  check("(2) idle again afterwards: 0 mutations", (await mut()).n === 0);

  // ---------- (3) hidden: interval grows ----------
  const t0 = await page.evaluate(() => { const t = performance.now(); window.setAppVisible(false); return t; });
  check("(3) status: 已连接 · 后台低频 while hidden", (await statusText()) === "已连接 · 后台低频", await statusText());
  await page.waitForTimeout(2900);
  const hiddenCalls = (await fm()).filter(c => c.t > t0 + 1);
  info.hiddenGaps = gapsOf([t0, ...hiddenCalls.map(c => c.t)]);
  check("(3) hidden: polls every ~900 ms (override of 15 s), first one a full interval after the switch", hiddenCalls.length >= 2 && hiddenCalls.length <= 4 && info.hiddenGaps.every(g => g >= 850 && g <= 1150), info.hiddenGaps);

  // ---------- (4) visible again: immediate poll ----------
  const t1 = await page.evaluate(() => { const t = performance.now(); window.setAppVisible(true); return t; });
  const imm = (await fm()).filter(c => c.t >= t1);
  info.immediate = imm.map(c => ({ dt: Math.round(c.t - t1), limit: c.limit, after: c.after }));
  check("(4) setAppVisible(true) polls immediately (< 50 ms)", imm.length >= 1 && imm[0].t - t1 < 50, info.immediate);
  check("(4) the return poll re-reads the newest messages (limit 15, no after)", imm.length >= 1 && imm[0].limit === 15 && imm[0].after === undefined, info.immediate);
  check("(4) status back to 已连接", (await statusText()) === "已连接", await statusText());
  await page.waitForTimeout(800);
  const backGaps = gapsOf((await fm()).filter(c => c.t >= t1).map(c => c.t));
  info.backGaps = backGaps;
  check("(4) back to the ~150 ms cadence", backGaps.length >= 3 && median(backGaps) >= 130 && median(backGaps) <= 220, backGaps);
  check("(4) setAppVisible with the same value is a no-op (no extra poll)", await page.evaluate(() => { const n = window.__calls.length; window.setAppVisible(true); return window.__calls.length === n; }));

  // (3b) document.visibilitychange fallback
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
  const fbHidden = await statusText();
  const tH = await page.evaluate(() => performance.now());
  await page.waitForTimeout(700);
  const duringHidden = (await fm()).filter(c => c.t > tH).length;
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); delete document.hidden; });
  const fbVisible = await statusText();
  check("(3b) visibilitychange fallback: document.hidden switches to the slow interval and back", fbHidden === "已连接 · 后台低频" && duringHidden === 0 && fbVisible === "已连接", { fbHidden, duringHidden, fbVisible });

  // ---------- overlapping polls: at most one poll request in flight ----------
  await page.evaluate(() => { window.__mock.maxInflight = 0; window.__mock.delay = 500; });
  mark = await allCalls();
  await page.waitForTimeout(2200);
  await page.evaluate(() => { window.__mock.delay = 5; });
  await page.waitForTimeout(600);
  const slow = await fmSince(mark);
  info.slowPolls = slow.map(c => Math.round(c.t));
  check("guard: with 500 ms answers and a 150 ms timer, never two polls in flight (ticks skipped)", (await page.evaluate(() => window.__mock.maxInflight)) === 1 && slow.filter(c => c.t < slow[0].t + 2200).length <= 6, { maxInflight: await page.evaluate(() => window.__mock.maxInflight), polls: slow.length });

  // ---------- (5) resync on the 12th poll; a disabled flag / thread count / deletion re-renders ----------
  mark = await allCalls();
  await page.evaluate(() => window.switchChannelById("c2"));
  await page.waitForFunction(() => document.getElementById("messagesList").innerText.includes("c2 消息 #501"));
  await observe();
  const loadIdx = (await fmSince(mark)).findIndex(c => c.channelId === "c2" && c.limit === 40);
  await waitFm(mark, 14, "c.channelId === 'c2'");
  const c2calls = (await fmSince(mark)).filter(c => c.channelId === "c2");
  const c2polls = c2calls.filter(c => c.limit !== 40);
  info.c2polls = c2polls.slice(0, 14).map((c, i) => `${i + 1}:${c.limit}/${c.after ? c.after.slice(-3) : "-"}`);
  check("(5) channel switch: full load first, then polls counted from 1", loadIdx === 0 && c2calls[0].limit === 40, info.c2polls);
  check("(5) polls 1-11 are `after` polls (after = c2 top), poll 12 is the resync {limit: 15, no after}, poll 13 is `after` again",
    c2polls.slice(0, 11).every(c => c.after === sid(525) && c.limit === 50) && c2polls[11].limit === 15 && c2polls[11].after === undefined && keysOf(c2polls[11]) === "action,channelId,limit" && c2polls[12].after === sid(525), info.c2polls);
  check("(5) unchanged resync does not re-render (0 mutations through poll 13)", (await mut()).n === 0, await mut());

  // bot disables its buttons, a thread gets replies, one message is deleted (all invisible to `after`)
  const tChange = await page.evaluate(() => {
    const c2 = window.__mock.channels.c2;
    c2[0].components[0].components.forEach(b => { b.disabled = true; });
    c2[2].thread.message_count = 9;
    c2.splice(5, 1); // id ...520
    return performance.now();
  });
  await observe();
  await page.waitForSelector(`.approval-card[data-message-id="${sid(525)}"][data-state="expired"]`, { timeout: 8000 });
  const afterChange = (await fm()).filter(c => c.t > tChange && c.channelId === "c2");
  const resyncAfterChange = afterChange.find(c => c.limit === 15);
  const m5 = await mut();
  info.afterChange = afterChange.map(c => `${c.limit}/${c.after ? "a" : "-"}`);
  check("(5) the change shows only after the next resync: `after` polls in between did not re-render", !!resyncAfterChange && afterChange.indexOf(resyncAfterChange) >= 1 && m5.t.length > 0 && m5.t[0] >= resyncAfterChange.t, { afterChange: info.afterChange, firstMutation: m5.t[0], resyncT: resyncAfterChange && resyncAfterChange.t });
  const dom5 = await page.evaluate(() => ({
    state: document.querySelector(".approval-card").dataset.state,
    disabled: [...document.querySelectorAll(".approval-card .btn-component")].map(b => b.disabled),
    count: [...document.querySelectorAll(".thread-card-count")].map(e => e.textContent),
    has520: [...document.querySelectorAll(".message-content")].some(e => e.innerText === "c2 消息 #520"),
    has505: [...document.querySelectorAll(".message-content")].some(e => e.innerText === "c2 消息 #505"),
    has501: [...document.querySelectorAll(".message-content")].some(e => e.innerText === "c2 消息 #501"),
    contents: document.querySelectorAll("#messagesList .message-content, #messagesList .approval-body").length
  }));
  info.dom5 = dom5;
  check("(5) resync re-render: card 已处理 (expired) with disabled buttons, thread count 9, deleted #520 gone, older #505/#501 kept (24 messages)",
    dom5.state === "expired" && dom5.disabled.every(Boolean) && dom5.count.includes("9 条回复") && !dom5.has520 && dom5.has505 && dom5.has501 && dom5.contents === 24, dom5);
  await page.waitForTimeout(100);
  await observe();
  mark = await allCalls();
  await waitFm(mark, 13, "c.channelId === 'c2'");
  const noChange = (await fmSince(mark)).filter(c => c.limit === 15);
  check("(5) next resync with nothing changed: no re-render", noChange.length >= 1 && (await mut()).n === 0, { resyncs: noChange.length, mutations: (await mut()).n });
  check("(5) after the resync re-render the `after` id is still the top id", (await fmSince(mark)).filter(c => c.after !== undefined).every(c => c.after === sid(525)));

  // ---------- stale answer: a poll in flight when the channel switches is dropped ----------
  await page.evaluate(() => { window.__mock.delay = 400; });
  mark = await allCalls();
  await page.waitForFunction((m) => window.__calls.slice(m).some(c => c.action === "fetchMessages" && c.channelId === "c2" && c.limit !== 40), mark);
  const staleId = await page.evaluate(() => {
    const M = window.__mock;
    const id = M.sid(M.next++);
    M.channels.c2.unshift({ id, channel_id: "c2", author: M.lea, timestamp: M.ts(500), content: "STALE-c2 must not render in c1" });
    M.delay = 5;
    window.switchChannelById("c1");
    return id;
  });
  await page.waitForTimeout(900);
  const staleCall = (await fmSince(mark)).find(c => c.channelId === "c2" && c.limit !== 40);
  const domStale = await page.evaluate(() => ({ title: document.getElementById("activeChannelTitle").innerText, text: document.getElementById("messagesList").innerText }));
  const c1PollsAfter = (await fmSince(mark)).filter(c => c.channelId === "c1" && c.after !== undefined);
  check("stale: the in-flight c2 poll did return the new c2 message ...", staleCall && staleCall.top === staleId, staleCall);
  check("stale: ... but it is dropped: c1 shown, no c2 content, c1 polls use c1's top id", domStale.title === "lab" && !domStale.text.includes("STALE") && !domStale.text.includes("c2 消息") && domStale.text.includes("NEW-A") && c1PollsAfter.length > 0 && c1PollsAfter.every(c => c.after === newA), { title: domStale.title, c1After: c1PollsAfter.map(c => c.after) });
  check("stale: no c2 poll issued after the switch", (await fm()).filter(c => c.channelId === "c2" && c.t > staleCall.t).length === 0);

  // ---------- (6) payloads unchanged ----------
  await page.click(`.approval-card[data-message-id="${sid(20)}"] .btn-component.style-success`);
  await page.waitForSelector(`.approval-card[data-message-id="${sid(20)}"][data-state="approved"]`);
  const inter = await page.evaluate(() => window.__calls.filter(c => c.action === "sendInteraction"));
  check("(6) sendInteraction payload unchanged {action, applicationId, channelId, customId, messageId}", inter.length === 1 && keysOf(inter[0]) === "action,applicationId,channelId,customId,messageId" && inter[0].applicationId === "1491193341612654642" && inter[0].channelId === "c1" && inter[0].messageId === sid(20) && inter[0].customId === "allow_once:c1", inter);
  await page.click("#messageInput");
  await page.keyboard.type("payload 测试");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.getElementById("messagesList").innerText.includes("payload 测试"));
  const sends = await page.evaluate(() => window.__calls.filter(c => c.action === "sendMessage"));
  check("(6) sendMessage payload unchanged {action, channelId, content}", sends.length === 1 && keysOf(sends[0]) === "action,channelId,content" && sends[0].channelId === "c1" && sends[0].content === "payload 测试", sends);
  // IME composition must never send: Enter during composition, and Enter right after compositionend (WebKit quirk)
  await page.click("#messageInput");
  await page.keyboard.type("ime 测试");
  const sendsBeforeIme = sends.length;
  await page.evaluate(() => {
    const el = document.getElementById("messageInput");
    el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229, bubbles: true, cancelable: true }));
    el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "测试" }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(60);
  const sendsDuringIme = await page.evaluate(() => window.__calls.filter(c => c.action === "sendMessage"));
  check("(6) IME: Enter during composition and right after compositionend does not send", sendsDuringIme.length === sendsBeforeIme && (await page.inputValue("#messageInput")) === "ime 测试", sendsDuringIme.length);
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.getElementById("messagesList").innerText.includes("ime 测试"));
  const sendsAfterIme = await page.evaluate(() => window.__calls.filter(c => c.action === "sendMessage"));
  check("(6) IME: a real Enter after the grace period sends", sendsAfterIme.length === sendsBeforeIme + 1 && sendsAfterIme[sendsAfterIme.length - 1].content === "ime 测试", sendsAfterIme.length);
  const sentId = await page.evaluate(() => window.__mock.channels.c1[0].id);
  mark = await allCalls();
  await waitFm(mark, 2, "c.after !== undefined");
  check("(6) after the reload that follows a send, polls carry after = the sent message id", (await fmSince(mark)).filter(c => c.after !== undefined).every(c => c.after === sentId), sentId);
  const tbAll = await page.evaluate(() => window.__calls.filter(c => c.action === "updateTouchBar"));
  check("(6) updateTouchBar payload {action, bots, channelId, channelName, members, pinned}", tbAll.length > 0 && tbAll.every(c => keysOf(c) === "action,bots,channelId,channelName,members,pinned"), [...new Set(tbAll.map(keysOf))]);
  const fmKeys = [...new Set((await fm()).map(keysOf))].sort();
  check("(6) fetchMessages payloads: only the optional `after` key was added", JSON.stringify(fmKeys) === JSON.stringify(["action,after,channelId,limit", "action,channelId,limit"]), fmKeys);

  // ---------- many new messages at once (e.g. after sleep): never leave a hole in the history ----------
  const hasContent = (txt) => page.evaluate((t) => [...document.querySelectorAll("#messagesList .message-content")].some(e => e.innerText === t), txt);
  const injectBurst = (prefix, count) => page.evaluate(([p, k]) => {
    const M = window.__mock;
    let id;
    for (let i = 0; i < k; i++) { id = M.sid(M.next++); M.channels.c1.unshift({ id, channel_id: "c1", author: M.lea, timestamp: M.ts(600 + i), content: `${p}-${i}` }); }
    return id;
  }, [prefix, count]);
  // (a) 60 new right before an `after` poll: a full page of 50 -> reload the newest 40
  await page.waitForTimeout(900); // the approval click above schedules its own reload 800 ms later; let it run first
  mark = await allCalls();
  await page.evaluate(() => window.switchChannelById("c1")); // resets the poll counter
  await waitFm(mark, 3, "c.channelId === 'c1'"); // load + 2 polls answered; poll 3 is an `after` poll
  const burstTop = await injectBurst("BURST", 60);
  await page.waitForFunction(() => [...document.querySelectorAll(".message-content")].some(e => e.innerText === "BURST-59"));
  await page.waitForTimeout(50);
  const burst = (await fmSince(mark)).slice(1);
  const pageIdx = burst.findIndex(c => c.n === 50);
  const dom7 = await page.evaluate(() => ({ contents: document.querySelectorAll("#messagesList .message-content").length, has19: [...document.querySelectorAll(".message-content")].some(e => e.innerText === "BURST-19"), has20: [...document.querySelectorAll(".message-content")].some(e => e.innerText === "BURST-20") }));
  check("burst (after): a full page of 50 is followed by a full load (limit 40) showing the newest 40", pageIdx >= 0 && burst[pageIdx].after !== undefined && burst[pageIdx + 1] && burst[pageIdx + 1].limit === 40 && burst[pageIdx + 1].after === undefined && dom7.contents === 40 && dom7.has20 && !dom7.has19, { seq: burst.map(c => `${c.limit}/${c.after ? "a" : "-"}/n=${c.n}`), dom7 });
  mark = await allCalls();
  await waitFm(mark, 1, "c.after !== undefined");
  check("burst (after): next poll carries after = newest id", (await fmSince(mark)).find(c => c.after !== undefined).after === burstTop);
  // (b) 20 new right before the 12th poll (a resync of 15): the re-read does not reach the shown top -> reload, no hole
  mark = await allCalls();
  await page.evaluate(() => window.switchChannelById("c1"));
  await waitFm(mark, 12, "c.channelId === 'c1'"); // load + 11 polls answered; poll 12 is the resync
  const burst2Top = await injectBurst("R", 20);
  await page.waitForFunction(() => [...document.querySelectorAll(".message-content")].some(e => e.innerText === "R-19"));
  await page.waitForTimeout(50);
  const seq2 = (await fmSince(mark)).slice(1);
  const rIdx = seq2.findIndex(c => c.n > 0);
  const gapFree = { r0: await hasContent("R-0"), r4: await hasContent("R-4"), r19: await hasContent("R-19"), b59: await hasContent("BURST-59") };
  check("burst (resync): resync answer {limit 15} not reaching the shown top is followed by a full load; R-0..R-19 and the older BURST-59 all shown",
    rIdx === 11 && seq2[rIdx].limit === 15 && seq2[rIdx].after === undefined && seq2[rIdx + 1].limit === 40 && gapFree.r0 && gapFree.r4 && gapFree.r19 && gapFree.b59,
    { seq: seq2.map(c => `${c.limit}/${c.after ? "a" : "-"}/n=${c.n}`), gapFree });
  mark = await allCalls();
  await waitFm(mark, 1, "c.after !== undefined");
  check("burst (resync): next poll carries after = newest id", (await fmSince(mark)).find(c => c.after !== undefined).after === burst2Top);

  // ================= Page B: token modal pauses polling =================
  const pB = await ctx.newPage();
  watch(pB, "B");
  await pB.addInitScript(() => { window.__noToken = true; window.__DL_POLL_MS = { active: 100, hidden: 300 }; });
  await pB.addInitScript(mock7);
  await pB.goto(indexUrl(WEB));
  await pB.waitForSelector("#tokenModal", { state: "visible" });
  await pB.waitForTimeout(600);
  await pB.evaluate(() => { window.setAppVisible(false); window.setAppVisible(true); });
  await pB.waitForTimeout(400);
  const bBefore = await pB.evaluate(() => window.__calls.filter(c => c.action === "fetchMessages").length);
  check("token modal: no fetchMessages at all while it is shown, setAppVisible does not start polling", bBefore === 0, bBefore);
  await pB.fill("#tokenInput", "fake-token");
  await pB.click("#saveTokenBtn");
  await pB.waitForSelector(".approval-card");
  await pB.waitForTimeout(1050);
  const bPolls = await pB.evaluate(() => window.__calls.filter(c => c.action === "fetchMessages" && c.limit !== 40));
  const bGaps = gapsOf(bPolls.map(c => c.t));
  info.tokenFlowGaps = bGaps;
  check("token modal: polling starts after the token is saved, one timer only (no doubled cadence)", bPolls.length >= 6 && bPolls.length <= 12 && Math.min(...bGaps) >= 80, { polls: bPolls.length, bGaps });

  // ================= Page C: default intervals (2.5 s / 15 s) on a fake clock =================
  const ctxC = await browser.newContext({ viewport: { width: 1120, height: 740 }, timezoneId: "Europe/Paris" });
  const pC = await ctxC.newPage();
  watch(pC, "C");
  await pC.clock.install({ time: new Date("2026-10-08T10:00:00Z") });
  await pC.addInitScript(mock7);
  await pC.goto(indexUrl(WEB));
  for (let i = 0; i < 40 && !(await pC.$(".approval-card")); i++) await pC.clock.runFor(50);
  const cfm = () => pC.evaluate(() => window.__calls.filter(c => c.action === "fetchMessages"));
  const w0 = await pC.evaluate(() => Date.now());
  await pC.clock.runFor(25000);
  const cActive = (await cfm()).filter(c => c.wall > w0 && c.limit !== 40);
  info.defaultActiveGaps = gapsOf(cActive.map(c => c.wall));
  // The installed fake clock still flows with real time between runFor() calls, so a busy machine adds a few ms to
  // the measured gaps (an 11 ms outlier was seen under `make test`); hence the +-JITTER tolerance. 2.5 s vs 15 s stays unambiguous.
  const JITTER = 50;
  check("defaults: visible -> one poll every 2500 ms (10 in 25 s)", cActive.length === 10 && info.defaultActiveGaps.every(g => Math.abs(g - 2500) <= JITTER), { n: cActive.length, gaps: info.defaultActiveGaps });
  const w1 = await pC.evaluate(() => { window.setAppVisible(false); return Date.now(); });
  await pC.clock.runFor(61000);
  const cHidden = (await cfm()).filter(c => c.wall > w1);
  info.defaultHiddenGaps = gapsOf([w1, ...cHidden.map(c => c.wall)]);
  check("defaults: hidden -> one poll every 15000 ms (4 in 61 s)", cHidden.length === 4 && info.defaultHiddenGaps.every(g => Math.abs(g - 15000) <= JITTER), { n: cHidden.length, gaps: info.defaultHiddenGaps });
  const cPolls = (await cfm()).filter(c => c.limit !== 40);
  info.defaultPollLimits = cPolls.map(c => c.limit);
  check("defaults: the 12th poll since the load is the resync (limit 15), the others are `after` polls", cPolls.length >= 13 && cPolls[11].limit === 15 && cPolls[11].after === undefined && cPolls.filter((c, i) => i !== 11).every(c => c.limit === 50 && c.after !== undefined), info.defaultPollLimits);
  check("defaults: hidden status text", (await pC.$eval("#statusIndicator .status-text", e => e.textContent)) === "已连接 · 后台低频");
  const w2 = await pC.evaluate(() => { window.setAppVisible(true); return Date.now(); });
  await pC.clock.runFor(5100);
  const cBack = (await cfm()).filter(c => c.wall >= w2);
  info.defaultBack = cBack.map(c => c.wall - w2);
  check("defaults: visible again -> immediate poll, then 2500 ms cadence", info.defaultBack.length === 3 && info.defaultBack[0] <= JITTER && [2500, 5000].every((v, i) => Math.abs(info.defaultBack[i + 1] - v) <= JITTER), info.defaultBack);
  await ctxC.close();

  check("(7) zero page errors / console errors (pages A, B, C)", errors.length === 0, errors);

  const code = report(results, info);
  await browser.close();
  process.exit(code);
})().catch(harnessFailed);
