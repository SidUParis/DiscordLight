// Fake native bridge shared by run-ui, run-links and fuzz-markdown.
//
// The front end only talks to main.m through window.webkit.messageHandlers.discordBridge.postMessage({action, callback, ...}).
// mockBridge() replaces it before app.js runs: every call is recorded in window.__calls, and the answer for
// msg.action comes from the fixtures below, delivered to window[msg.callback] a few ms later. Nothing reaches Discord.
//
// Install it with page.addInitScript(mockBridge), or splice mockBridge.toString() into a string init script and
// override single actions afterwards (see run-links.cjs).
//
// Knobs (set them on window in an earlier init script):
//   __noToken       getConfig reports hasToken: false -> the token modal shows (first-run flow)
//   __empty         no pins, DMs, servers or messages (empty states)
//   __slowChannels  delay in ms for fetchGuildChannels (default 5)
//   __noPersist     saveConfig does not keep anything in sessionStorage across reloads
//
// The polling suites (run-polling, run-polling-edge) need numeric snowflake ids and an `after`-aware fetchMessages,
// so they keep their own mock next to their assertions.
"use strict";

function mockBridge() {
  const calls = [];
  window.__calls = calls;
  const ts = (min) => new Date(Date.UTC(2026, 9, 7, 12, min, 0)).toISOString();
  const paper = { id: "1491193341612654642", username: "bot1491193341612654642", bot: true };
  const web = { id: "1510971308589191218", username: "Web Hermes", bot: true };
  const me = { id: "900100200300400500", username: "sidney", global_name: "Sidney" };
  const lea = { id: "900100200300400777", username: "lea", global_name: "Léa Martin" };
  const marc = { id: "777", username: "marc", global_name: "Marc" };
  const evil = { id: "666000666000666000", username: "evil", global_name: "O'Brien \"<b>\" &amp;" };
  const approvalButtons = (disabled) => [{ type: 1, components: [
    { type: 2, style: 3, label: "Allow Once", custom_id: "allow_once:77", disabled },
    { type: 2, style: 1, label: "Allow Session", custom_id: "allow_session:77", disabled },
    { type: 2, style: 2, label: "Always Allow", custom_id: "allow_always:77", disabled },
    { type: 2, style: 4, label: "Deny", custom_id: "deny:77", disabled }
  ] }];
  const channelMessages = [
    { id: "m9", author: paper, timestamp: ts(31), content: "需要运行以下命令，请确认：\n```bash\nrm -rf build && make build && make install\n```\n工作目录 `~/Developer/projects/DiscordLight`", components: approvalButtons(false) },
    { id: "m8", author: paper, timestamp: ts(30), content: "收到，我先检查一下构建脚本。" },
    { id: "m7", author: me, timestamp: ts(29), content: "<@1491193341612654642> 帮我重新构建并安装，抄送 <@&1510973611467608080> 和 <@666000666000666000> 以及 <#123456>", mentions: [paper, evil] },
    { id: "x4", author: web, timestamp: ts(26), content: "翻页 <b>bold?</b>", components: [{ type: 1, components: [
      { type: 2, style: 2, label: "下一页 '\"<>", custom_id: "pg:'\"<>&next" } ] }] },
    { id: "x3", author: evil, timestamp: ts(25), content: "链接 https://example.org/a?b=1&c=2, 还有 (https://example.org/paren). 尖括号 <https://example.org/angle> 结尾。\n```\ncurl https://example.org/in-code\n```\n行内 `https://example.org/inline` 和 **粗体 https://example.org/bold**" },
    { id: "x2", author: evil, timestamp: ts(24), content: "看这个", thread: { id: "t-evil", name: "x'); window.__pwned=1; //", message_count: 3 } },
    { id: "x1", author: lea, timestamp: ts(22), content: "<img src=x onerror=alert(1)> <script>window.__pwned=2</script> <a href=\"javascript:window.__pwned=3\">点我</a> `<svg onload=alert(2)>`\n```html\n<img src=y onerror=alert(3)>\n```" },
    { id: "m6", author: web, timestamp: ts(20), content: "抓取完成，共 **3** 个页面，详细日志放在线程里。", thread: { id: "t1", name: "构建日志排查", message_count: 12 } },
    { id: "m5", author: web, timestamp: ts(19), content: "请求访问 `https://example.org/docs`", components: approvalButtons(true) },
    { id: "m2", author: me, timestamp: ts(5), content: "早上好" }
  ];
  const guildChannels = {
    s1: [{ id: "c1", name: "hermes-lab", type: 0 }, { id: "c2", name: "reports", type: 0 }, { id: "v1", name: "voice", type: 2 }],
    s2: [{ id: "h1", name: "hub-general", type: 0 }, { id: "h2", name: "hub-bots", type: 0 }, { id: "h3", name: "hub-news", type: 5 }]
  };
  const stored = () => { try { return JSON.parse(sessionStorage.getItem("dl-config") || "{}"); } catch (e) { return {}; } };
  const responses = {
    getConfig: () => Object.assign({ hasToken: !window.__noToken, last_channel_id: "c1", pinned_channels: window.__empty ? [] : [
      { id: "c1", name: "# hermes-lab", server: "\u{1F4C1} Research", icon: "#" },
      { id: "g1", name: "论文小组", server: "多人群聊", icon: "\u{1F465}", type: 3, subtitle: "Léa, Marc · 3人" },
      { id: "t9", name: "\u{1F9F5} 旧版线程", server: "# hermes-lab", icon: "#" },
      { id: "c6", name: "# \u{1F916}-bots", server: "Hermes Hub" }
    ] }, stored()),
    fetchCurrentUser: () => ({ user: me }),
    fetchDMs: () => ({ dms: window.__empty ? [] : [
      { id: "g1", type: 3, name: "论文小组", last_message_id: "30", recipients: [lea, marc] },
      { id: "d1", type: 1, last_message_id: "20", recipients: [lea] },
      { id: "d2", type: 1, last_message_id: "10", recipients: [marc] }
    ] }),
    fetchGuilds: () => ({ guilds: window.__empty ? [] : [{ id: "s1", name: "Research", owner: true }, { id: "s2", name: "Hermes Hub" }] }),
    fetchGuildChannels: (d) => ({ channels: guildChannels[d.guildId] || [] }),
    fetchMessages: (d) => ({ messages: window.__empty ? [] : channelMessages.slice(0, d.limit) }),
    sendInteraction: () => ({ success: true }),
    sendMessage: () => ({ success: true }),
    saveConfig: (d) => {
      if (d.token) window.__noToken = false;
      const cfg = stored();
      ["ui", "pinned_channels", "last_channel_id"].forEach(k => { if (d[k]) cfg[k] = d[k]; });
      if (!window.__noPersist) sessionStorage.setItem("dl-config", JSON.stringify(cfg));
      return { success: true };
    },
    updateTouchBar: () => ({ success: true })
  };
  window.webkit = { messageHandlers: { discordBridge: { postMessage(msg) {
    calls.push(JSON.parse(JSON.stringify(msg)));
    const fn = responses[msg.action];
    const delay = msg.action === "fetchGuildChannels" ? (window.__slowChannels || 5) : 5;
    setTimeout(() => window[msg.callback] && window[msg.callback](fn ? fn(msg) : {}), delay);
  } } } };
}

module.exports = { mockBridge };
