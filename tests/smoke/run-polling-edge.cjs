// Suite "polling-edge": lightweight polling edge cases. Scroll position when `after` messages arrive (pinned to the
// bottom vs scrolled up), dedupe of an `after` answer racing a full reload, a thread reply-count change re-rendering
// exactly once at the resync, deletion of the newest shown message at the next resync while a reload races it.
// Own mock (snowflake ids, `after`-aware fetchMessages, per-request delays, "answer computed at request time" mode).
// Usage: node run-polling-edge.cjs [path/to/web]   (default: ../../web)
"use strict";
const { launchChromium, webDir, indexUrl, report, harnessFailed } = require("./harness.cjs");

const WEB = webDir();

function mock8() {
  const calls = [];
  window.__calls = calls;
  const base = 1300000000000000000n;
  const sid = (n) => String(base + BigInt(n));
  const ts = (min) => new Date(Date.UTC(2026, 9, 7, 8, 0, 0) + min * 60000).toISOString();
  const web = { id: "1510971308589191218", username: "Web Hermes", bot: true };
  const me = { id: "900100200300400500", username: "sidney", global_name: "Sidney" };
  const lea = { id: "900100200300400777", username: "lea", global_name: "Léa Martin" };
  // newest first, like Discord; 40 messages so the viewport overflows
  const mk = (ch, from, to) => {
    const out = [];
    for (let i = to; i >= from; i--) {
      out.push({ id: sid(i), channel_id: ch, author: i % 3 === 0 ? lea : (i % 2 ? web : me), timestamp: ts(i * 7), content: `${ch} 消息 #${i}\n第二行\n第三行` });
    }
    return out;
  };
  const c1 = mk("c1", 1, 40);
  c1[2].thread = { id: "t1", name: "构建日志", message_count: 3 };
  const channels = { c1 };
  const M = window.__mock = { channels, sid, ts, lea, me, delay: 5, afterDelay: 5, resyncDelay: 5, snapAtRequest: false, next: 1000 };
  const copy = (x) => JSON.parse(JSON.stringify(x));

  const responses = {
    getConfig: () => ({ hasToken: true, last_channel_id: "c1", pinned_channels: [{ id: "c1", name: "# lab", server: "Research" }] }),
    fetchCurrentUser: () => ({ user: me }),
    fetchDMs: () => ({ dms: [] }),
    fetchGuilds: () => ({ guilds: [{ id: "s1", name: "Research" }] }),
    fetchGuildChannels: () => ({ channels: [{ id: "c1", name: "lab", type: 0 }] }),
    fetchMessages: (d) => {
      let list = channels[d.channelId] || [];
      if (d.after !== undefined) {
        list = list.filter(m => BigInt(m.id) > BigInt(d.after));
        list = list.slice(Math.max(0, list.length - d.limit));
      } else {
        list = list.slice(0, d.limit);
      }
      return { messages: copy(list) };
    },
    sendMessage: () => ({ success: true }),
    saveConfig: () => ({ success: true }),
    updateTouchBar: () => ({ success: true })
  };

  window.webkit = { messageHandlers: { discordBridge: { postMessage(msg) {
    const rec = JSON.parse(JSON.stringify(msg));
    rec.t = performance.now();
    calls.push(rec);
    const fn = responses[msg.action];
    const isFm = msg.action === "fetchMessages";
    const early = (isFm && M.snapAtRequest && fn) ? fn(msg) : null;
    let delay = 5;
    if (isFm) delay = msg.after !== undefined ? M.afterDelay : (msg.limit === 15 ? M.resyncDelay : M.delay);
    setTimeout(() => {
      const res = early || (fn ? fn(msg) : {});
      if (res && res.messages) {
        rec.n = res.messages.length;
        rec.top = res.messages.length ? res.messages[0].id : null;
        rec.ids = res.messages.map(m => m.id);
        rec.doneT = performance.now();
      }
      if (window[msg.callback]) window[msg.callback](res);
    }, delay);
  } } } };
}

(async () => {
  const browser = await launchChromium();
  const ctx = await browser.newContext({ viewport: { width: 1120, height: 740 }, timezoneId: "Europe/Paris" });
  const errors = [];
  const results = [];
  const info = {};
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };

  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await page.addInitScript(() => { window.__DL_POLL_MS = { active: 150, hidden: 900 }; });
  await page.addInitScript(mock8);
  await page.goto(indexUrl(WEB));
  await page.waitForFunction(() => document.querySelectorAll("#messagesList .message-content").length === 40);
  await page.waitForTimeout(100);

  const allCalls = () => page.evaluate(() => window.__calls.length);
  const fmSince = (mark) => page.evaluate((m) => window.__calls.slice(m).filter(c => c.action === "fetchMessages"), mark);
  const waitFm = (mark, n, pred, timeout = 15000) => page.waitForFunction(([m, k, p]) => {
    const f = new Function("c", "return " + p);
    return window.__calls.slice(m).filter(c => c.action === "fetchMessages" && f(c) && c.n !== undefined).length >= k;
  }, [mark, n, pred || "true"], { timeout });
  const observe = () => page.evaluate(() => {
    if (window.__obs) window.__obs.disconnect();
    window.__mutT = [];
    window.__obs = new MutationObserver(() => { window.__mutT.push(performance.now()); });
    window.__obs.observe(document.getElementById("messagesList"), { childList: true, subtree: true, characterData: true, attributes: true });
  });
  const batches = () => page.evaluate(() => window.__mutT.slice());
  const inject = (content) => page.evaluate((c) => {
    const M = window.__mock;
    const id = M.sid(M.next++);
    M.channels.c1.unshift({ id, channel_id: "c1", author: M.lea, timestamp: M.ts(900 + M.next), content: c });
    return id;
  }, content);
  const countContent = (txt) => page.evaluate((t) => [...document.querySelectorAll("#messagesList .message-content")].filter(e => e.innerText === t).length, txt);
  const geo = () => page.evaluate(() => { const v = document.getElementById("messagesViewport"); return { top: v.scrollTop, h: v.scrollHeight, ch: v.clientHeight, gap: v.scrollHeight - v.scrollTop - v.clientHeight }; });
  const hasText = (t) => page.waitForFunction((x) => document.getElementById("messagesList").innerText.includes(x), t);

  // ---------- (i) scroll: pinned at the bottom follows new messages; scrolled up does not move ----------
  const g0 = await geo();
  const n1 = await inject("PIN-1 底部新消息");
  await hasText("PIN-1");
  const g1 = await geo();
  await page.evaluate(() => { document.getElementById("messagesViewport").scrollTop = 0; });
  await page.waitForTimeout(50);
  const gUp = await geo();
  const firstRowTop0 = await page.evaluate(() => document.querySelector("#messagesList .message-row").getBoundingClientRect().top);
  await inject("UP-1 上滚时到达");
  await hasText("UP-1");
  const gUp1 = await geo();
  const firstRowTop1 = await page.evaluate(() => document.querySelector("#messagesList .message-row").getBoundingClientRect().top);
  // a middle position as well
  await page.evaluate(() => { document.getElementById("messagesViewport").scrollTop = 400; });
  await page.waitForTimeout(50);
  const gMid = await geo();
  await inject("MID-1 中间位置到达");
  await hasText("MID-1");
  const gMid1 = await geo();
  info.scroll = { g0, g1, gUp, gUp1, firstRowTop0, firstRowTop1, gMid, gMid1 };
  check("(i) scroll: at the bottom an `after` message keeps the view pinned to the bottom; scrolled up (top 0 and mid 400) scrollTop and the first row do not move",
    g0.h > g0.ch + 300 && g0.gap < 2 && g1.gap < 2 && g1.h > g0.h &&
    gUp.top === 0 && gUp1.top === 0 && firstRowTop0 === firstRowTop1 && gUp1.h > gUp.h &&
    gMid.top === 400 && gMid1.top === 400,
    info.scroll);
  // back to the bottom for the rest
  await page.evaluate(() => { const v = document.getElementById("messagesViewport"); v.scrollTop = v.scrollHeight; });

  // ---------- (ii) dedupe: an `after` answer that contains a message already shown (load race) ----------
  // An `after` poll is held for 700 ms. Meanwhile X arrives and a full reload (Touch Bar refresh / send path) shows it;
  // then Y arrives. The held poll answers [Y, X]: X is already shown and must not be duplicated, Y is appended once.
  await page.evaluate(() => { window.__mock.afterDelay = 700; });
  let mark = await allCalls();
  await page.waitForFunction((m) => window.__calls.slice(m).some(c => c.action === "fetchMessages" && c.after !== undefined), mark);
  const held = (await fmSince(mark)).find(c => c.after !== undefined);
  const rowsBefore = await page.$$eval("#messagesList .message-content", e => e.length);
  const xId = await inject("DUP-X 已被重载显示");
  await page.evaluate(() => window.loadMessages());
  await hasText("DUP-X");
  const yId = await inject("DUP-Y 新消息");
  await hasText("DUP-Y");
  await page.evaluate(() => { window.__mock.afterDelay = 5; });
  const heldDone = (await fmSince(mark)).find(c => c.t === held.t);
  await page.waitForTimeout(100);
  const dupDom = { x: await countContent("DUP-X 已被重载显示"), y: await countContent("DUP-Y 新消息"), rows: await page.$$eval("#messagesList .message-content", e => e.length), last: await page.$$eval("#messagesList .message-content", e => e[e.length - 1].innerText) };
  mark = await allCalls();
  await waitFm(mark, 1, "c.after !== undefined");
  const afterY = (await fmSince(mark)).find(c => c.after !== undefined).after;
  info.dedupe = { heldAfter: held.after, heldIds: heldDone && heldDone.ids, xId, yId, dupDom, afterY };
  // rows: the reload shows the newest 40 (X included), then Y is merged on top -> 41
  check("(ii) dedupe: the held `after` answer [Y, X] (X already shown by a reload) shows X once and Y once, Y last, next `after` = Y",
    heldDone && JSON.stringify(heldDone.ids) === JSON.stringify([yId, xId]) && dupDom.x === 1 && dupDom.y === 1 && dupDom.rows === 41 && dupDom.last === "DUP-Y 新消息" && afterY === yId,
    { ...info.dedupe, rowsBefore });

  // ---------- (iii) resync: a thread reply count change re-renders exactly once ----------
  await page.waitForTimeout(200);
  await observe();
  const tbBefore = await page.evaluate(() => window.__calls.filter(c => c.action === "updateTouchBar").length);
  const tChange = await page.evaluate(() => { window.__mock.channels.c1.find(m => m.thread).thread.message_count = 7; return performance.now(); });
  await page.waitForFunction(() => [...document.querySelectorAll(".thread-card-count")].some(e => e.textContent === "7 条回复"), null, { timeout: 8000 });
  mark = await allCalls();
  await waitFm(mark, 14); // > 12 more polls: at least one more resync with nothing changed
  const b3 = await batches();
  const sinceChange = (await page.evaluate(() => window.__calls.filter(c => c.action === "fetchMessages"))).filter(c => c.t > tChange);
  const firstResync = sinceChange.find(c => c.limit === 15);
  const tbAfter = await page.evaluate(() => window.__calls.filter(c => c.action === "updateTouchBar").length);
  const counts = await page.$$eval(".thread-card-count", e => e.map(x => x.textContent));
  info.thread = { batches: b3.length, firstBatch: b3[0], resyncDone: firstResync && firstResync.doneT, resyncs: sinceChange.filter(c => c.limit === 15).length, counts, tb: tbAfter - tbBefore };
  check("(iii) resync: thread message_count 3 -> 7 re-renders exactly once (1 mutation batch, right after the resync answer; 1 updateTouchBar), card shows 7 条回复, later resyncs idle",
    b3.length === 1 && firstResync && b3[0] >= firstResync.doneT && counts.length === 1 && counts[0] === "7 条回复" && info.thread.resyncs >= 2 && tbAfter - tbBefore === 1,
    info.thread);

  // ---------- (iv) regression for the review fix: newest shown message deleted -> gone at the next resync;
  //            a newer message shown by a reload while that resync was in flight is kept ----------
  await observe();
  await page.evaluate(() => { window.__mock.channels.c1.shift(); }); // delete Y (the newest shown)
  let gone = true;
  try { await page.waitForFunction(() => !document.getElementById("messagesList").innerText.includes("DUP-Y"), null, { timeout: 6000 }); } catch (e) { gone = false; }
  mark = await allCalls();
  await waitFm(mark, 1, "c.after !== undefined");
  const afterDel = (await fmSince(mark)).find(c => c.after !== undefined).after;
  // race: the resync answer is a snapshot from before Z; a reload shows Z while the resync is in flight
  await page.evaluate(() => { const M = window.__mock; M.snapAtRequest = true; M.resyncDelay = 600; });
  mark = await allCalls();
  await page.evaluate(() => { window.setAppVisible(false); window.setAppVisible(true); }); // forces a resync now
  await page.waitForFunction((m) => window.__calls.slice(m).some(c => c.action === "fetchMessages" && c.limit === 15), mark);
  const zId = await inject("RACE-Z 重同步期间到达");
  await page.evaluate(() => window.loadMessages());
  await hasText("RACE-Z");
  await observe();
  await waitFm(mark, 1, "c.limit === 15");
  const resyncRace = (await fmSince(mark)).find(c => c.limit === 15);
  await page.waitForTimeout(20);
  const raceBatches = (await batches()).length; // between the reload render and just after the resync answer
  const zShown = await countContent("RACE-Z 重同步期间到达");
  await page.evaluate(() => { const M = window.__mock; M.snapAtRequest = false; M.resyncDelay = 5; });
  info.deletion = { gone, afterDel, xId, resyncRaceIds: resyncRace && resyncRace.ids && resyncRace.ids.length, resyncHasZ: resyncRace && resyncRace.ids.includes(zId), raceBatches, zShown };
  check("(iv) deleted newest message disappears at the next resync (next `after` = X); a newer message a reload showed during an in-flight resync stays (0 re-renders from that resync)",
    gone && afterDel === xId && resyncRace && !resyncRace.ids.includes(zId) && raceBatches === 0 && zShown === 1,
    info.deletion);

  check("(v) zero page errors / console errors", errors.length === 0, errors);

  const code = report(results, info);
  await browser.close();
  process.exit(code);
})().catch(harnessFailed);
