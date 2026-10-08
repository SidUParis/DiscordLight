// Suite "notify": system notifications and the Dock badge (bridge actions `notify` / `setBadge`, window.setAppFocused).
// New messages arrive through the real polling path (the `after`-aware mock below, same pattern as run-polling.cjs):
// nothing on a channel load; a mention / @everyone, any DM or group DM message, or an approval prompt notifies while the
// window is not key (or is hidden); never for the user's own messages; at most 5 banners per poll tick; the resync and
// full-reload polling paths notify new ids only, once. Polling is shortened through window.__DL_POLL_MS (test-only).
// Usage: node run-notify.cjs [path/to/web]   (default: ../../web)
"use strict";
const { launchChromium, webDir, indexUrl, report, harnessFailed } = require("./harness.cjs");

const WEB = webDir();

function mockNotify() {
  const calls = [];
  window.__calls = calls;
  const base = 1300000000000000000n;
  const sid = (n) => String(base + BigInt(n));
  const ts = (min) => new Date(Date.UTC(2026, 9, 7, 8, 0, 0) + min * 60000).toISOString();
  const paper = { id: "1491193341612654642", username: "bot1491193341612654642", bot: true };
  const me = { id: "900100200300400500", username: "sidney", global_name: "Sidney" };
  const lea = { id: "900100200300400777", username: "lea", global_name: "Léa Martin" };
  const marc = { id: "777", username: "marc", global_name: "Marc" };
  const approval = (tag) => [{ type: 1, components: [
    { type: 2, style: 3, label: "Allow Once", custom_id: `allow_once:${tag}` },
    { type: 2, style: 4, label: "Deny", custom_id: `deny:${tag}` }
  ] }];
  const mk = (ch, from, to, author) => {
    const out = [];
    for (let i = to; i >= from; i--) out.push({ id: sid(i), channel_id: ch, author, timestamp: ts(i % 500), content: `${ch} 历史 #${i}`, mentions: [] });
    return out;
  };
  // History that WOULD notify if it arrived by polling: a mention, @everyone, an approval prompt, DM / group DM messages
  const c1 = mk("c1", 1, 12, lea);
  c1[0].content = `<@${me.id}> 早上好`; c1[0].mentions = [me];
  c1[1].author = paper; c1[1].content = ""; c1[1].components = approval("h");
  c1[2].mention_everyone = true;
  const channels = { c1, d1: mk("d1", 101, 105, lea), g1: mk("g1", 201, 203, marc) };
  const M = window.__mock = { channels, sid, ts, me, lea, marc, paper, approval, next: 1000, delay: 5 };
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const responses = {
    getConfig: () => ({ hasToken: true, last_channel_id: "c1", pinned_channels: [{ id: "c1", name: "# lab", server: "Research" }] }),
    fetchCurrentUser: () => ({ user: me }),
    fetchDMs: () => ({ dms: [
      { id: "d1", type: 1, last_message_id: sid(105), recipients: [lea] },
      { id: "g1", type: 3, name: "论文小组", last_message_id: sid(203), recipients: [lea, marc] }
    ] }),
    fetchGuilds: () => ({ guilds: [{ id: "s1", name: "Research" }] }),
    fetchGuildChannels: () => ({ channels: [{ id: "c1", name: "lab", type: 0 }, { id: "c9", name: "general", type: 0 }] }),
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
    saveConfig: () => ({ success: true }),
    updateTouchBar: () => ({ success: true }),
    notify: () => ({ success: true }),
    setBadge: () => ({ success: true })
  };
  window.webkit = { messageHandlers: { discordBridge: { postMessage(msg) {
    const rec = JSON.parse(JSON.stringify(msg));
    calls.push(rec);
    setTimeout(() => {
      const fn = responses[msg.action];
      const res = fn ? fn(msg) : {};
      if (res && res.messages) { rec.n = res.messages.length; rec.ids = res.messages.map(m => m.id); }
      if (window[msg.callback]) window[msg.callback](res);
    }, msg.action === "fetchMessages" ? M.delay : 5);
  } } } };
}

const keysOf = (c) => Object.keys(c).filter(k => !["callback", "n", "ids"].includes(k)).sort().join(",");

(async () => {
  const browser = await launchChromium();
  const ctx = await browser.newContext({ viewport: { width: 1120, height: 740 }, timezoneId: "Europe/Paris" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  const results = [];
  const info = {};
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };

  // The window starts without focus (as if the app came up in the background)
  await page.addInitScript(() => { window.__DL_POLL_MS = { active: 120, hidden: 240 }; document.hasFocus = () => false; });
  await page.addInitScript(mockNotify);
  await page.goto(indexUrl(WEB));
  await page.waitForSelector(".approval-card");

  const notifs = () => page.evaluate(() => window.__calls.filter(c => c.action === "notify"));
  const badges = () => page.evaluate(() => window.__calls.filter(c => c.action === "setBadge").map(c => c.count));
  const lastBadge = async () => { const b = await badges(); return b.length ? b[b.length - 1] : undefined; };
  const polls = (n) => page.evaluate((k) => window.__calls.filter(c => c.action === "fetchMessages").length + k, n)
    .then(target => page.waitForFunction((t) => window.__calls.filter(c => c.action === "fetchMessages" && c.n !== undefined).length >= t, target));
  // Adds one message to a channel's mock history (newest first) and waits until polling has rendered it
  const push = async (ch, fields) => {
    const id = await page.evaluate(([c, f]) => {
      const M = window.__mock;
      const author = M[f.author] || M.lea;
      const m = Object.assign({ id: M.sid(M.next++), channel_id: c, timestamp: M.ts(600), content: "", mentions: [] }, f, { author });
      if (f.mentionMe) { m.mentions = [M.me]; delete m.mentionMe; }
      if (f.approval) { m.components = M.approval(m.id); delete m.approval; }
      M.channels[c].unshift(m);
      return m.id;
    }, [ch, fields]);
    await page.waitForFunction((i) => state.lastMessageId === i, id, { timeout: 8000 });
    return id;
  };
  const ME = "900100200300400500";

  // ---------- initial load: qualifying history never notifies ----------
  await page.waitForFunction(() => state.lastMessageId !== null);
  await polls(4);
  check("load: unfocused at start (state.focused follows document.hasFocus())", (await page.evaluate(() => state.focused)) === false);
  check("load: a channel load with a mention, @everyone and an approval prompt in its history sends no notify / setBadge",
    (await notifs()).length === 0 && (await badges()).length === 0, { notifs: await notifs(), badges: await badges() });

  // ---------- a mention while unfocused: one notification, badge 1 ----------
  const id1 = await push("c1", { content: `<@${ME}>  请看   <@1491193341612654642> 的结果`, mentionMe: true });
  let n = await notifs();
  info.first = n;
  check("mention (unfocused): exactly one notify {title 'Léa Martin · #lab', plain-text body with @names, channelId c1, tag = message id}",
    n.length === 1 && n[0].title === "Léa Martin · #lab" && n[0].body === "@Sidney 请看 @Paper Hermes 的结果" && n[0].channelId === "c1" && n[0].tag === id1, n);
  check("notify payload keys are exactly {action, body, channelId, tag, title}", n.length === 1 && keysOf(n[0]) === "action,body,channelId,tag,title", n.map(keysOf));
  check("mention (unfocused): setBadge {count: 1}", JSON.stringify(await badges()) === "[1]", await badges());

  const id2 = await push("c1", { content: "再看一下 <@!" + ME + ">", mentionMe: true });
  n = await notifs();
  check("second mention: second notify, setBadge {count: 2}", n.length === 2 && n[1].tag === id2 && n[1].body === "再看一下 @Sidney" && (await lastBadge()) === 2, { n: n.length, badges: await badges() });

  // ---------- focus clears the badge; focused + visible never notifies ----------
  await page.evaluate(() => window.setAppFocused(true));
  check("setAppFocused(true): setBadge {count: 0}, counter reset", (await lastBadge()) === 0 && (await page.evaluate(() => state.unreadNotified)) === 0, await badges());
  const badgeCallsFocused = (await badges()).length;
  await push("c1", { content: `<@${ME}> 你在看吗`, mentionMe: true });
  check("focused + visible: a mention sends no notify and no setBadge", (await notifs()).length === 2 && (await badges()).length === badgeCallsFocused);

  // focused but the window cannot be seen (minimized / occluded): notifies
  await page.evaluate(() => window.setAppVisible(false));
  const idHidden = await push("c1", { content: `<@${ME}> 窗口被遮住了`, mentionMe: true });
  n = await notifs();
  check("focused but hidden (setAppVisible(false)): notifies, badge 1", n.length === 3 && n[2].tag === idHidden && (await lastBadge()) === 1, { n: n.length, badges: await badges() });
  await page.evaluate(() => { window.setAppVisible(true); window.setAppFocused(false); });
  const badgeBase = await page.evaluate(() => state.unreadNotified);

  // ---------- own messages and ordinary channel chatter never notify ----------
  await push("c1", { author: "me", content: `<@${ME}> 自己提到自己`, mentionMe: true, mention_everyone: true });
  await push("c1", { content: "普通消息，没有提到任何人" });
  check("unfocused: own message (even mentioning me / @everyone) and a plain guild message send no notify", (await notifs()).length === 3, (await notifs()).length);

  // ---------- approval prompt (empty content), @everyone ----------
  const idAppr = await push("c1", { author: "paper", content: "", approval: true });
  n = await notifs();
  check("approval prompt with empty content: notify, title 'Paper Hermes · #lab', body '[审批请求]'",
    n.length === 4 && n[3].tag === idAppr && n[3].title === "Paper Hermes · #lab" && n[3].body === "[审批请求]", n[3]);
  const idEvery = await push("c1", { content: "@everyone 部署完成", mention_everyone: true });
  n = await notifs();
  check("@everyone: notify", n.length === 5 && n[4].tag === idEvery && n[4].body === "@everyone 部署完成", n[4]);
  const idAtt = await push("c1", { content: "", mentionMe: true, attachments: [{ id: "a1", filename: "x.png" }] });
  n = await notifs();
  check("empty content that is not an approval prompt: body '[附件]'", n.length === 6 && n[5].tag === idAtt && n[5].body === "[附件]", n[5]);

  // ---------- body: plain text, cut to 140 characters ----------
  const longText = `<@${ME}> <b>粗</b> & ` + "很长的内容".repeat(60);
  const idLong = await push("c1", { content: longText, mentionMe: true });
  n = await notifs();
  const longBody = n[n.length - 1].body;
  info.longBody = { len: Array.from(longBody).length, head: longBody.slice(0, 30) };
  check("long body: plain text (raw '<b>' and '&', no HTML escaping), 140 characters + '…'",
    n[n.length - 1].tag === idLong && longBody.startsWith("@Sidney <b>粗</b> & 很长") && !longBody.includes("&lt;") && Array.from(longBody).length === 141 && longBody.endsWith("…"), info.longBody);
  check("badge counts every notification since the last focus", (await lastBadge()) === badgeBase + 4, { badges: await badges(), badgeBase });

  // ---------- at most 5 banners per poll tick ----------
  const before7 = (await notifs()).length;
  const badgeBefore7 = await page.evaluate(() => state.unreadNotified);
  const burstIds = await page.evaluate((me) => {
    const M = window.__mock;
    const ids = [];
    for (let i = 0; i < 7; i++) {
      const id = M.sid(M.next++);
      ids.push(id);
      M.channels.c1.unshift({ id, channel_id: "c1", author: M.lea, timestamp: M.ts(700 + i), content: `<@${me}> 批量 ${i}`, mentions: [M.me] });
    }
    return ids;
  }, ME);
  await page.waitForFunction((i) => state.lastMessageId === i, burstIds[6]);
  n = (await notifs()).slice(before7);
  info.burst = n.map(c => c.body);
  check("7 mentions in one poll tick: exactly 5 notify calls, the newest 5, oldest of them first",
    n.length === 5 && JSON.stringify(n.map(c => c.tag)) === JSON.stringify(burstIds.slice(2)), info.burst);
  check("7 mentions in one poll tick: one setBadge for the tick, counting all 7", (await lastBadge()) === badgeBefore7 + 7, await badges());

  // ---------- resync poll (limit 15): a new id notifies once, already-shown ids never ----------
  let before = (await notifs()).length;
  const resyncsDone = () => window.__calls.filter(c => c.action === "fetchMessages" && c.limit === 15 && c.n !== undefined).length;
  const resyncs0 = await page.evaluate(resyncsDone);
  await page.evaluate(() => { state.resyncDue = true; });
  await page.waitForFunction(`(${resyncsDone})() > ${resyncs0}`);
  await polls(3);
  check("resync with nothing new: no notify", (await notifs()).length === before, (await notifs()).length - before);
  let idResync = null;
  for (let tries = 0; tries < 50 && !idResync; tries++) {
    idResync = await page.evaluate((me) => {
      if (state.polling) return null; // no poll in flight: the next poll is the resync and it is the one that sees the message
      const M = window.__mock;
      const id = M.sid(M.next++);
      M.channels.c1.unshift({ id, channel_id: "c1", author: M.lea, timestamp: M.ts(800), content: `<@${me}> resync 送达`, mentions: [M.me] });
      state.resyncDue = true;
      return id;
    }, ME);
    if (!idResync) await page.waitForTimeout(10);
  }
  await page.waitForFunction((i) => state.lastMessageId === i, idResync);
  await polls(4);
  const deliveredBy = await page.evaluate((i) => window.__calls.find(c => c.action === "fetchMessages" && c.ids && c.ids.includes(i)), idResync);
  n = (await notifs()).slice(before);
  check("resync delivery: the message came in a {limit: 15} resync, notified exactly once (no repeat on later polls)",
    deliveredBy && deliveredBy.limit === 15 && deliveredBy.after === undefined && n.length === 1 && n[0].tag === idResync, { deliveredBy: deliveredBy && { limit: deliveredBy.limit, after: deliveredBy.after }, n });

  // ---------- burst of 60 (full `after` page -> reload of the newest 40): notifies the new mentions among them ----------
  before = (await notifs()).length;
  const reload = await page.evaluate((me) => {
    const M = window.__mock;
    const out = { mention: [], last: null };
    for (let i = 0; i < 60; i++) {
      const id = M.sid(M.next++);
      const mention = i === 5 || i === 57 || i === 59; // i = 5 is too old to be among the 40 shown
      if (mention && i > 5) out.mention.push(id);
      M.channels.c1.unshift({ id, channel_id: "c1", author: M.lea, timestamp: M.ts(900 + i), content: mention ? `<@${me}> burst ${i}` : `burst ${i}`, mentions: mention ? [M.me] : [] });
      out.last = id;
    }
    return out;
  }, ME);
  await page.waitForFunction((i) => state.lastMessageId === i, reload.last);
  await polls(3);
  n = (await notifs()).slice(before);
  const reloadCall = await page.evaluate(() => window.__calls.filter(c => c.action === "fetchMessages" && c.limit === 40 && c.channelId === "c1").pop());
  check("60 new at once: full reload (limit 40) shown, the 2 new mentions in it notified once each",
    reloadCall && reloadCall.ids && reloadCall.ids[0] === reload.last && JSON.stringify(n.map(c => c.tag)) === JSON.stringify(reload.mention), { n: n.map(c => c.tag), expected: reload.mention });

  // ---------- DM: any message notifies, no channel suffix; the DM's own history does not ----------
  before = (await notifs()).length;
  await page.evaluate(() => window.switchChannelById("d1"));
  await page.waitForFunction(() => state.activeChannel.id === "d1" && state.lastMessageId === window.__mock.sid(105));
  await polls(4);
  check("DM: switching to a DM (history from the other person) sends no notify", (await notifs()).length === before, (await notifs()).length - before);
  const idDm = await push("d1", { content: "在吗？" });
  n = (await notifs()).slice(before);
  check("DM: a message without mention notifies, title 'Léa Martin' (no channel suffix), channelId d1",
    n.length === 1 && n[0].title === "Léa Martin" && n[0].body === "在吗？" && n[0].channelId === "d1" && n[0].tag === idDm, n);

  // ---------- group DM (not pinned): switchChannelById finds it, messages notify ----------
  await page.evaluate(() => window.switchChannelById("g1"));
  await page.waitForFunction(() => state.lastMessageId === window.__mock.sid(203));
  check("switchChannelById reaches an unpinned group DM (notification click target)", (await page.evaluate(() => state.activeChannel.id)) === "g1");
  before = (await notifs()).length;
  const idGroup = await push("g1", { author: "marc", content: "群里有新消息" });
  n = (await notifs()).slice(before);
  check("group DM: a message notifies, title 'Marc', channelId g1", n.length === 1 && n[0].title === "Marc" && n[0].channelId === "g1" && n[0].tag === idGroup, n);

  const badgeKeys = await page.evaluate(() => [...new Set(window.__calls.filter(c => c.action === "setBadge").map(c => Object.keys(c).filter(k => k !== "callback").sort().join(",")))]);
  check("setBadge payload keys are exactly {action, count}", JSON.stringify(badgeKeys) === '["action,count"]', badgeKeys);
  check("zero page errors / console errors", errors.length === 0, errors);

  const code = report(results, info);
  await browser.close();
  process.exit(code);
})().catch(harnessFailed);
