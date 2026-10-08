// Suite "mentions": who the composer chips and the Touch Bar offer for a quick @mention (getMentionTargets).
// Agents and group DM members are kept apart; the KNOWN_BOTS fallback is for server channels only, never DMs.
// Usage: node run-mentions.cjs [path/to/web]   (default: ../../web). Screenshots: .shots/mentions/
"use strict";
const path = require("path");
const { launchChromium, webDir, indexUrl, shotsDir, report, harnessFailed } = require("./harness.cjs");
const { mockBridge } = require("./mock-bridge.cjs");

const WEB = webDir();
const SHOTS = shotsDir("mentions");
const mock = mockBridge.toString();

const KNOWN_FALLBACK = ["Web Hermes", "Paper Hermes", "Notion"];

// Runs in the page after mockBridge(): DMs, pins and per-channel messages for the mention scenarios
function mentionFixtures() {
  const ts = (min) => new Date(Date.UTC(2026, 9, 7, 12, min, 0)).toISOString();
  const me = { id: "900100200300400500", username: "sidney", global_name: "Sidney" }; // fetchCurrentUser in mockBridge
  const lea = { id: "900100200300400777", username: "lea", global_name: "Léa Martin" };
  const marc = { id: "777", username: "marc", global_name: "Marc" };
  const relay = { id: "424242424242424242", username: "relay-bot", global_name: "Claude Relay", bot: true };
  const scout = { id: "515151515151515151", username: "scout", global_name: "Scout", bot: true };
  const dms = [
    // (a) group DM with a bot; the current user is listed too and must be left out
    { id: "g2", type: 3, name: "智能体小组", last_message_id: "40", recipients: [lea, marc, relay, me] },
    // (b) group DM with humans only
    { id: "g1", type: 3, name: "论文小组", last_message_id: "30", recipients: [lea, marc] },
    // (f) 1:1 DM with a human
    { id: "d1", type: 1, last_message_id: "20", recipients: [lea] }
  ];
  const messages = {
    g2: [
      { id: "g2m2", author: lea, timestamp: ts(12), content: "看一下 <@777> 的草稿", mentions: [marc] },
      { id: "g2m1", author: me, timestamp: ts(10), content: "大家好" }
    ],
    g1: [
      { id: "g1m2", author: marc, timestamp: ts(9), content: "收到" },
      { id: "g1m1", author: lea, timestamp: ts(8), content: "周五交稿" }
    ],
    d1: [{ id: "d1m1", author: lea, timestamp: ts(7), content: "在吗" }],
    // (c) server channel, no bot has posted
    c1: [
      { id: "c1m2", author: me, timestamp: ts(6), content: "早上好" },
      { id: "c1m1", author: lea, timestamp: ts(5), content: "早" }
    ],
    // (d) server channel where a bot (not in KNOWN_BOTS) has posted
    c2: [
      { id: "c2m2", author: scout, timestamp: ts(4), content: "日报已生成" },
      { id: "c2m1", author: me, timestamp: ts(3), content: "请生成日报" }
    ]
  };
  const answers = {
    getConfig: () => ({ hasToken: true, last_channel_id: "c1", pinned_channels: [
      { id: "c1", name: "# hermes-lab", server: "Research", icon: "channel" },
      // (g) a pinned group DM: the saved entry has the type but no recipients
      { id: "g2", name: "智能体小组", server: "多人群聊", icon: "group", type: 3, subtitle: "Léa Martin, Marc, Claude Relay · 4人" }
    ] }),
    fetchDMs: () => ({ dms }),
    // `after` polls get nothing new, so nothing re-renders behind the assertions
    fetchMessages: (d) => ({ messages: d.after ? [] : (messages[d.channelId] || []).slice(0, d.limit) })
  };
  const bridge = window.webkit.messageHandlers.discordBridge;
  const orig = bridge.postMessage;
  bridge.postMessage = function (msg) {
    const fn = answers[msg.action];
    if (!fn) return orig.call(this, msg);
    window.__calls.push(JSON.parse(JSON.stringify(msg)));
    setTimeout(() => window[msg.callback] && window[msg.callback](fn(msg)), 5);
  };
}

(async () => {
  const browser = await launchChromium();
  const ctx = await browser.newContext({ viewport: { width: 1120, height: 740 }, deviceScaleFactor: 2, timezoneId: "Europe/Paris" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("dialog", d => { errors.push("dialog: " + d.message()); d.dismiss(); });
  await page.addInitScript(`window.__noPersist = true; try { sessionStorage.removeItem("dl-config"); } catch (e) {}\n${mock}\nmockBridge();\n(${mentionFixtures.toString()})();`);
  await page.goto(indexUrl(WEB));

  const results = [];
  const info = {};
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };

  // Waits until the channel's messages are rendered (renderMessages sends updateTouchBar and redraws the chips)
  const loaded = (id) => page.waitForFunction((cid) => state.activeChannel.id === cid && state.messages.length > 0 && state.messages[0].id.startsWith(cid), id);
  const clickRow = async (section, name) => {
    await page.click(`#sectionBody-${section} > .channel-item:has(.channel-name:text-is("${name}"))`);
  };
  // The last updateTouchBar payload and what the composer chip bar shows
  const snap = () => page.evaluate(() => {
    const tb = window.__calls.filter(c => c.action === "updateTouchBar").pop();
    const bar = document.getElementById("inputAgentChips");
    const shape = (list) => (list || []).map(i => Object.keys(i).sort().join(","));
    return {
      channel: state.activeChannel.id,
      keys: Object.keys(tb).filter(k => k !== "callback").sort().join(","),
      bots: tb.bots.map(b => b.name),
      botIds: tb.bots.map(b => b.id),
      members: (tb.members || []).map(m => m.name),
      memberIds: (tb.members || []).map(m => m.id),
      itemShapes: [...new Set([...shape(tb.bots), ...shape(tb.members)])],
      barShown: bar.style.display !== "none" && bar.offsetParent !== null,
      chips: [...bar.children].map(el => el.classList.contains("agent-chip-sep")
        ? "|"
        : (el.querySelector(".agent-chip-avatar").classList.contains("bot") ? "bot " : "member ") + el.querySelector(".agent-chip-avatar + span").textContent),
      radii: [...bar.querySelectorAll(".agent-chip-avatar")].map(a => getComputedStyle(a).borderRadius),
      sep: [...bar.querySelectorAll(".agent-chip-sep")].map(s => { const cs = getComputedStyle(s); return { w: cs.width, h: cs.height, aria: s.getAttribute("aria-hidden"), tag: s.tagName }; })
    };
  });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // ---------- (c) server channel, no bot messages: KNOWN_BOTS fallback, no members ----------
  await loaded("c1");
  let s = await snap();
  info.c = s;
  check("(c) server channel without bot messages: bots = the KNOWN_BOTS fallback, members empty", same(s.bots, KNOWN_FALLBACK) && same(s.members, []), s);
  check("payload: updateTouchBar is {action, bots, channelId, channelName, members, pinned}, items {id, name, username}", s.keys === "action,bots,channelId,channelName,members,pinned" && same(s.itemShapes, ["id,name,username"]), { keys: s.keys, shapes: s.itemShapes });
  check("(c) composer: three agent chips with rounded-square avatars, no divider", same(s.chips, KNOWN_FALLBACK.map(n => "bot @" + n)) && s.radii.every(r => r === "4px") && s.sep.length === 0, s.chips);

  // ---------- (d) server channel where a bot posted: that bot first, then the fallback ----------
  await page.evaluate(() => switchChannelById("c2"));
  await loaded("c2");
  s = await snap();
  info.d = s;
  check("(d) server channel with a bot message: the posting bot comes first, fallback after, no duplicates", same(s.bots, ["Scout", ...KNOWN_FALLBACK]) && s.botIds[0] === "515151515151515151" && new Set(s.botIds).size === s.botIds.length && same(s.members, []), s);
  check("(d) composer: Scout chip first, all chips are agents", s.chips[0] === "bot @Scout" && s.chips.every(c => c.startsWith("bot ")), s.chips);

  // ---------- (a) group DM with a bot: bot apart from the human members, current user left out ----------
  await clickRow("dms", "智能体小组");
  await loaded("g2");
  s = await snap();
  info.a = s;
  check("(a) group DM with a bot: bots = [Claude Relay] only (no KNOWN_BOTS fallback)", same(s.bots, ["Claude Relay"]) && same(s.botIds, ["424242424242424242"]), s.bots);
  check("(a) group DM with a bot: members = [Léa Martin, Marc], current user excluded", same(s.members, ["Léa Martin", "Marc"]) && !s.memberIds.includes("900100200300400500"), s.members);
  check("(a) composer: 1 agent chip + divider + 2 member chips", same(s.chips, ["bot @Claude Relay", "|", "member @Léa Martin", "member @Marc"]) && s.barShown, s.chips);
  check("(a) composer: agent avatar is a rounded square, member avatars are circles", same(s.radii, ["4px", "50%", "50%"]), s.radii);
  check("(a) composer: divider is an aria-hidden <span>, 1px x 16px", s.sep.length === 1 && s.sep[0].tag === "SPAN" && s.sep[0].aria === "true" && s.sep[0].w === "1px" && s.sep[0].h === "16px", s.sep);
  await page.screenshot({ path: path.join(SHOTS, "01-group-with-bot.png"), clip: { x: 240, y: 560, width: 880, height: 180 } });

  // ---------- (e) clicking a member chip inserts @name ----------
  await page.fill("#messageInput", "");
  await page.click('#inputAgentChips .agent-chip:has-text("@Léa Martin")');
  const v1 = await page.inputValue("#messageInput");
  check("(e) clicking a member chip inserts \"@Léa Martin \" into the composer", v1 === "@Léa Martin ", v1);
  // what the native @ 成员 button calls (touchBarPopoverMemberClicked: -> insertMentionFromTouchBar(name))
  await page.evaluate((name) => window.insertMentionFromTouchBar(name), s.members[1]);
  const v2 = await page.inputValue("#messageInput");
  check("(e) the Touch Bar member name inserts the same way", v2 === "@Léa Martin @Marc ", v2);
  await page.fill("#messageInput", "");

  // ---------- (b) group DM without bots: no agents at all, members only ----------
  await clickRow("dms", "论文小组");
  await loaded("g1");
  s = await snap();
  info.b = s;
  check("(b) group DM without bots: bots empty (no KNOWN_BOTS fallback), members = [Léa Martin, Marc]", same(s.bots, []) && same(s.members, ["Léa Martin", "Marc"]), s);
  check("(b) composer: two member chips with circle avatars, no agent chip, no divider", same(s.chips, ["member @Léa Martin", "member @Marc"]) && s.radii.every(r => r === "50%") && s.sep.length === 0, s.chips);
  await page.screenshot({ path: path.join(SHOTS, "02-group-no-bot.png"), clip: { x: 240, y: 560, width: 880, height: 180 } });
  // the @ autocomplete is unchanged: it still offers every known user and bot
  await page.click("#messageInput");
  await page.keyboard.type("@pap");
  await page.waitForSelector("#mentionPopover", { state: "visible" });
  const popNames = await page.$$eval(".mention-item .mention-item-name", els => els.map(e => e.textContent));
  check("@ autocomplete unchanged: still offers Paper Hermes inside a group DM", popNames.includes("Paper Hermes"), popNames);
  await page.keyboard.press("Escape");
  await page.fill("#messageInput", "");

  // ---------- (f) 1:1 DM with a human: nothing to offer, chip bar hidden ----------
  await clickRow("dms", "Léa Martin");
  await loaded("d1");
  s = await snap();
  info.f = s;
  check("(f) 1:1 DM with a human: bots and members empty, chip bar hidden", same(s.bots, []) && same(s.members, []) && !s.barShown && s.chips.length === 0, s);

  // ---------- (g) the pinned entry of a group DM (no recipients saved) behaves like the DM row ----------
  await clickRow("pinned", "智能体小组");
  await loaded("g2");
  s = await snap();
  info.g = s;
  check("(g) pinned group DM: recipients come from the DM list, same split as (a)", same(s.bots, ["Claude Relay"]) && same(s.members, ["Léa Martin", "Marc"]) && same(s.chips, ["bot @Claude Relay", "|", "member @Léa Martin", "member @Marc"]), s);

  // getChannelBots stays as the agents-only alias
  check("getChannelBots() returns getMentionTargets().bots", await page.evaluate(() => typeof getMentionTargets === "function" && JSON.stringify(getChannelBots()) === JSON.stringify(getMentionTargets().bots) && getChannelBots().length === 1));

  check("zero page errors / console errors / dialogs", errors.length === 0, errors);

  const code = report(results, info);
  await browser.close();
  process.exit(code);
})().catch(harnessFailed);
