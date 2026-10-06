// DiscordLight - Native macOS Discord Client
// 100% Local & Privacy-Preserving

const KNOWN_BOTS = {
  "1510971308589191218": {
    id: "1510971308589191218",
    name: "Web Hermes",
    username: "Web Hermes",
    displayName: "Web Hermes",
    aliases: ["web hermes", "web", "hermes"],
    bot: true
  },
  "1491193341612654642": {
    id: "1491193341612654642",
    name: "Paper Hermes",
    username: "bot1491193341612654642",
    displayName: "Paper Hermes",
    rawUsername: "bot1491193341612654642",
    aliases: ["bot1491193341612654642", "bot", "paper hermes", "paper", "hermes", "6", "149", "654642"],
    bot: true
  },
  "1391943462852755536": {
    id: "1391943462852755536",
    name: "Notion",
    username: "Notion",
    displayName: "Notion",
    aliases: ["notion"],
    bot: true
  }
};

const KNOWN_ROLES = {
  "1510973611467608080": "Hermes"
};

// Client State
const state = {
  currentUser: null,
  activeChannel: { id: "", name: "加载中...", server: "" },
  parentChannel: null, // Set when inside a thread
  activeThreads: {},   // parentChannelId -> thread[]
  currentTab: "pinned", // "pinned" | "servers" | "dms"
  servers: [],
  dms: [],
  pinned: [],
  channelsCache: {}, // serverId -> channels[]
  messages: [],
  lastMessageId: null,
  knownUsers: {},
  mentionQuery: null,
  mentionIndex: 0,
  activeMentionCandidates: []
};

// Native Cocoa Bridge Helper
function callNative(action, data = {}) {
  return new Promise((resolve) => {
    const callbackId = "cb_" + Math.random().toString(36).substr(2, 9);
    window[callbackId] = (response) => {
      delete window[callbackId];
      resolve(response);
    };
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.discordBridge) {
      window.webkit.messageHandlers.discordBridge.postMessage({
        action,
        callback: callbackId,
        ...data
      });
    } else {
      resolve({ success: false, error: "No native bridge" });
    }
  });
}

// DOM Elements
const workspaceTabs = document.getElementById("workspaceTabs");
const serverPickerRow = document.getElementById("serverPickerRow");
const serverSelect = document.getElementById("serverSelect");
const channelSearch = document.getElementById("channelSearch");
const searchClearBtn = document.getElementById("searchClearBtn");
const channelList = document.getElementById("channelList");
const activeChannelTitle = document.getElementById("activeChannelTitle");
const activeChannelServer = document.getElementById("activeChannelServer");
const statusIndicator = document.getElementById("statusIndicator");
const pinToggleBtn = document.getElementById("pinToggleBtn");
const refreshBtn = document.getElementById("refreshBtn");
const messagesList = document.getElementById("messagesList");
const messagesViewport = document.getElementById("messagesViewport");
const inputAgentChips = document.getElementById("inputAgentChips");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const mentionPopover = document.getElementById("mentionPopover");
const mentionItems = document.getElementById("mentionItems");
const threadBackBtn = document.getElementById("threadBackBtn");
const channelHash = document.getElementById("channelHash");
const myAvatar = document.getElementById("myAvatar");
const myUsername = document.getElementById("myUsername");
const tokenModal = document.getElementById("tokenModal");
const tokenInput = document.getElementById("tokenInput");
const saveTokenBtn = document.getElementById("saveTokenBtn");

// Initialize Application
async function init() {
  bindEvents();

  // 1. Check local config & token
  const cfg = await callNative("getConfig");
  if (!cfg || !cfg.hasToken) {
    if (tokenModal) tokenModal.style.display = "flex";
    return;
  }

  if (cfg.pinned_channels && cfg.pinned_channels.length > 0) {
    state.pinned = cfg.pinned_channels;
  }

  // 2. Load User Profile
  const userRes = await callNative("fetchCurrentUser");
  if (userRes && userRes.user) {
    state.currentUser = userRes.user;
    const displayName = state.currentUser.global_name || state.currentUser.username;
    if (myUsername) myUsername.innerText = displayName;
    if (myAvatar) myAvatar.innerText = (displayName[0] || "U").toUpperCase();
    state.knownUsers[state.currentUser.id] = {
      name: displayName,
      username: state.currentUser.username,
      bot: false
    };
  }

  // 3. Load Servers & DMs
  await loadServersAndDMs();

  // 4. Setup Initial Active Channel
  if (cfg.last_channel_id) {
    const found = state.pinned.find(p => p.id === cfg.last_channel_id);
    if (found) state.activeChannel = found;
  }
  if (!state.activeChannel.id && state.pinned.length > 0) {
    state.activeChannel = state.pinned[0];
  } else if (!state.activeChannel.id && state.servers.length > 0) {
    // Fallback: fetch first server's channels
    const s1 = state.servers[0];
    const chRes = await callNative("fetchGuildChannels", { guildId: s1.id });
    if (chRes && chRes.channels) {
      const firstText = chRes.channels.find(c => c.type === 0);
      if (firstText) {
        state.activeChannel = { id: firstText.id, name: `# ${firstText.name}`, server: s1.name };
        if (state.pinned.length === 0) {
          state.pinned.push(state.activeChannel);
        }
      }
    }
  }

  updateHeader();
  renderChannelList();
  notifyTouchBar();
  loadMessages();

  // Polling loop (every 2.5s)
  setInterval(pollMessages, 2500);
}

// Event Bindings
function bindEvents() {
  // Setup Modal Token Save
  if (saveTokenBtn) {
    saveTokenBtn.addEventListener("click", async () => {
      const tok = tokenInput.value.trim();
      if (!tok) return;
      saveTokenBtn.innerText = "连接中...";
      await callNative("saveConfig", { token: tok });
      tokenModal.style.display = "none";
      init();
    });
  }

  // Workspace Tabs
  if (workspaceTabs) {
    workspaceTabs.addEventListener("click", (e) => {
      const tabBtn = e.target.closest(".ws-tab");
      if (!tabBtn) return;
      document.querySelectorAll(".ws-tab").forEach(t => t.classList.remove("active"));
      tabBtn.classList.add("active");
      state.currentTab = tabBtn.dataset.tab;

      if (state.currentTab === "servers") {
        serverPickerRow.style.display = "block";
      } else {
        serverPickerRow.style.display = "none";
      }

      channelSearch.value = "";
      renderChannelList();
    });
  }

  if (serverSelect) {
    serverSelect.addEventListener("change", () => {
      channelSearch.value = "";
      renderChannelList();
    });
  }

  if (channelSearch) {
    channelSearch.addEventListener("input", () => {
      searchClearBtn.style.display = channelSearch.value ? "block" : "none";
      renderChannelList();
    });
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener("click", () => {
      channelSearch.value = "";
      searchClearBtn.style.display = "none";
      renderChannelList();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      setStatus("刷新中...", "amber");
      loadMessages();
    });
  }

  if (pinToggleBtn) pinToggleBtn.addEventListener("click", togglePinCurrentChannel);
  if (sendBtn) sendBtn.addEventListener("click", handleSendMessage);

  // Mention Autocomplete & Keyboard Handling
  if (messageInput) {
    messageInput.addEventListener("keydown", handleInputKeyDown);
    messageInput.addEventListener("input", handleInputChange);
  }
}

// Auto-Expanding Textarea
function adjustTextareaHeight() {
  messageInput.style.height = "auto";
  const newHeight = Math.min(messageInput.scrollHeight, 180);
  messageInput.style.height = (newHeight > 24 ? newHeight : 24) + "px";
}

// Render Channels & Threads
async function renderChannelList() {
  channelList.innerHTML = "";
  const filter = channelSearch.value.trim().toLowerCase();
  let items = [];

  if (state.currentTab === "pinned") {
    items = state.pinned.map(p => ({ ...p, icon: "#" }));
  } else if (state.currentTab === "dms") {
    items = state.dms.map(d => ({ ...d, icon: d.type === 3 ? "👥" : "👤" }));
  } else {
    // Specific Server Channels
    const serverId = serverSelect.value;
    if (!state.channelsCache[serverId]) {
      channelList.innerHTML = `<div style="padding:12px;color:var(--text-muted);font-size:12px;">⏳ 加载频道中...</div>`;
      const res = await callNative("fetchGuildChannels", { guildId: serverId });
      state.channelsCache[serverId] = (res.channels || [])
        .filter(c => c.type === 0 || c.type === 5)
        .map(c => ({ id: c.id, name: `# ${c.name}`, server: serverSelect.options[serverSelect.selectedIndex]?.text || "" }));
    }
    items = (state.channelsCache[serverId] || []).map(c => ({ ...c, icon: "#" }));
  }

  if (filter) {
    items = items.filter(i => i.name.toLowerCase().includes(filter) || (i.server && i.server.toLowerCase().includes(filter)));
  }

  if (items.length === 0) {
    channelList.innerHTML = `<div style="padding:16px;color:var(--text-muted);font-size:12px;text-align:center;">未找到匹配频道</div>`;
    return;
  }

  const headerDiv = document.createElement("div");
  headerDiv.className = "channel-section-header";
  headerDiv.innerText = state.currentTab === "pinned" ? "常用工作频道" : (state.currentTab === "dms" ? "私聊与群聊" : "文字频道");
  channelList.appendChild(headerDiv);

  items.forEach(item => {
    const isChannelActive = state.activeChannel.id === item.id;
    const cleanDisplayName = item.name.replace(/^[#⭐👥👤\s]+/, "").replace(/\s*\([^)]*\)/, "");
    const div = document.createElement("div");
    div.className = `channel-item ${isChannelActive ? "active" : ""}`;
    div.innerHTML = `
      <span class="channel-icon">${item.icon || "#"}</span>
      <span class="channel-name" title="${escapeAttr(cleanDisplayName)}">${escapeHTML(cleanDisplayName)}</span>
      ${item.server ? `<span class="server-tag">${escapeHTML(item.server)}</span>` : ""}
    `;
    div.addEventListener("click", () => {
      state.parentChannel = null;
      switchChannel(item);
    });
    channelList.appendChild(div);

    // Threads under this channel
    const threads = state.activeThreads[item.id] || [];
    threads.forEach(t => {
      const isThreadActive = state.activeChannel.id === t.id;
      const tDiv = document.createElement("div");
      tDiv.className = `thread-subitem ${isThreadActive ? "active" : ""}`;
      tDiv.innerHTML = `
        <span class="thread-sub-icon">↳ 🧵</span>
        <span class="thread-sub-name" title="${escapeAttr(t.name)}">${escapeHTML(t.name)}</span>
      `;
      tDiv.addEventListener("click", (e) => {
        e.stopPropagation();
        openThread(t.id, t.name, t.messageCount, item);
      });
      channelList.appendChild(tDiv);
    });
  });
}

function switchChannel(channel) {
  state.parentChannel = null;
  state.activeChannel = channel;
  updateHeader();
  renderChannelList();
  messagesList.innerHTML = `<div style="padding:30px;color:var(--text-muted);text-align:center;">⏳ 正在载入 #${escapeHTML(channel.name.replace(/^[#⭐👥👤\s]+/, ""))}...</div>`;
  state.lastMessageId = null;
  state.messages = [];
  notifyTouchBar();
  loadMessages();
  callNative("saveConfig", { last_channel_id: channel.id });
}

window.openThread = function(threadId, threadName, replyCount, optParent) {
  if (optParent) {
    state.parentChannel = optParent;
  } else if (!state.parentChannel) {
    state.parentChannel = { ...state.activeChannel };
  }

  state.activeChannel = {
    id: threadId,
    name: `🧵 ${threadName}`,
    server: state.parentChannel ? state.parentChannel.name : "",
    isThread: true
  };

  updateHeader();
  renderChannelList();
  messagesList.innerHTML = `<div style="padding:30px;color:var(--text-muted);text-align:center;">⏳ 正在载入线程【${escapeHTML(threadName)}】...</div>`;
  state.lastMessageId = null;
  state.messages = [];
  notifyTouchBar();
  loadMessages();
};

window.returnToParentChannel = function() {
  if (state.parentChannel) {
    const parent = state.parentChannel;
    state.parentChannel = null;
    switchChannel(parent);
  }
};

function updateHeader() {
  const isThread = !!state.parentChannel;

  if (isThread) {
    if (threadBackBtn) {
      threadBackBtn.style.display = "inline-flex";
      const cleanParentName = state.parentChannel.name.replace(/^[#⭐👥👤🧵\s]+/, "");
      document.getElementById("threadBackText").innerText = `#${cleanParentName}`;
    }
    if (channelHash) channelHash.innerText = "🧵";
    const cleanTitle = state.activeChannel.name.replace(/^[#⭐👥👤🧵\s]+/, "");
    activeChannelTitle.innerText = cleanTitle;
    activeChannelServer.innerText = `子线程 · 来自 #${state.parentChannel.name.replace(/^[#⭐👥👤🧵\s]+/, "")}`;
    messageInput.placeholder = `在线程【${cleanTitle}】中发言... (@ 唤起机器人，回车发送)`;
  } else {
    if (threadBackBtn) threadBackBtn.style.display = "none";
    if (channelHash) channelHash.innerText = "#";
    const cleanTitle = state.activeChannel.name.replace(/^[#⭐👥👤🧵\s]+/, "");
    activeChannelTitle.innerText = cleanTitle;
    activeChannelServer.innerText = state.activeChannel.server || "";
    messageInput.placeholder = `发送消息到 #${cleanTitle}... (@ 唤起机器人，回车发送)`;
  }

  const isPinned = state.pinned.some(p => p.id === state.activeChannel.id);
  pinToggleBtn.innerText = isPinned ? "★ 已关注" : "☆ 关注";

  updateAgentChips();
}

// Quick Agent Chips Bar (AI Developer First)
function updateAgentChips() {
  if (!inputAgentChips) return;
  inputAgentChips.innerHTML = "";

  const bots = getChannelBots();
  if (bots.length === 0) {
    inputAgentChips.style.display = "none";
    return;
  }

  inputAgentChips.style.display = "flex";
  bots.forEach(bot => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "agent-chip";
    chip.innerHTML = `
      <span class="agent-chip-dot"></span>
      <span>@${escapeHTML(bot.name)}</span>
    `;
    chip.addEventListener("click", () => {
      insertMentionFromTouchBar(bot.name);
    });
    inputAgentChips.appendChild(chip);
  });
}

function getChannelBots() {
  const activeBots = [];
  const seenBotIds = new Set();

  if (state.messages && state.messages.length > 0) {
    state.messages.forEach(m => {
      if (m.author && m.author.bot && !seenBotIds.has(m.author.id)) {
        seenBotIds.add(m.author.id);
        const known = KNOWN_BOTS[m.author.id] || state.knownUsers[m.author.id];
        activeBots.push({
          id: m.author.id,
          name: known ? known.name : (m.author.global_name || m.author.username),
          username: m.author.username
        });
      }
      if (m.mentions) {
        m.mentions.forEach(men => {
          if (men.bot && !seenBotIds.has(men.id)) {
            seenBotIds.add(men.id);
            const known = KNOWN_BOTS[men.id] || state.knownUsers[men.id];
            activeBots.push({
              id: men.id,
              name: known ? known.name : (men.global_name || men.username),
              username: men.username
            });
          }
        });
      }
    });
  }

  // Dynamic fallback from known bots
  Object.values(KNOWN_BOTS).forEach(b => {
    if (b && !seenBotIds.has(b.id)) {
      // include top bots
      seenBotIds.add(b.id);
      activeBots.push(b);
    }
  });

  const uniqueBots = [];
  const seenNames = new Set();
  activeBots.forEach(b => {
    if (b && b.name && !seenNames.has(b.name)) {
      seenNames.add(b.name);
      uniqueBots.push(b);
    }
  });
  return uniqueBots;
}

async function togglePinCurrentChannel() {
  const isPinned = state.pinned.some(p => p.id === state.activeChannel.id);
  if (isPinned) {
    state.pinned = state.pinned.filter(p => p.id !== state.activeChannel.id);
  } else {
    state.pinned.push({
      id: state.activeChannel.id,
      name: state.activeChannel.name,
      server: state.activeChannel.server
    });
  }
  updateHeader();
  if (state.currentTab === "pinned") renderChannelList();
  await callNative("saveConfig", { pinned_channels: state.pinned });
}

// Fetch Servers & DMs
async function loadServersAndDMs() {
  const dmRes = await callNative("fetchDMs");
  if (dmRes && dmRes.dms) {
    state.dms = dmRes.dms.map(d => {
      let name = d.name;
      if (!name && d.recipients) {
        name = d.recipients.map(r => r.username).join(", ");
      }
      return {
        id: d.id,
        name: name || "Group DM",
        server: d.type === 3 ? "多人群聊" : "私信",
        type: d.type
      };
    });
  }

  const guildRes = await callNative("fetchGuilds");
  if (guildRes && guildRes.guilds) {
    state.servers = guildRes.guilds;
    serverSelect.innerHTML = "";
    state.servers.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g.id;
      opt.innerText = (g.owner ? "👑 " : "📁 ") + g.name;
      serverSelect.appendChild(opt);
    });
  }
}

// Status Helper
function setStatus(text, type = "green") {
  const textEl = statusIndicator.querySelector(".status-text");
  const dotEl = statusIndicator.querySelector(".status-dot");
  if (textEl) textEl.innerText = text;
  if (dotEl) {
    dotEl.style.backgroundColor = type === "amber" ? "var(--status-amber)" : (type === "red" ? "var(--btn-danger)" : "var(--status-green)");
  }
}

// Messages Loading & Rendering
async function loadMessages() {
  if (!state.activeChannel.id) return;
  const res = await callNative("fetchMessages", { channelId: state.activeChannel.id, limit: 40 });
  if (res && res.messages) {
    setStatus("连接正常 · 0% CPU", "green");
    renderMessages(res.messages);
  } else {
    setStatus("加载失败", "red");
  }
}

async function pollMessages() {
  if (!state.activeChannel.id) return;
  const res = await callNative("fetchMessages", { channelId: state.activeChannel.id, limit: 15 });
  if (res && res.messages && res.messages.length > 0) {
    const topId = res.messages[0].id;
    if (topId !== state.lastMessageId) {
      renderMessages(res.messages);
    }
  }
}

function renderMessages(messages) {
  if (!messages || messages.length === 0) {
    messagesList.innerHTML = `<div style="padding:40px;color:var(--text-muted);text-align:center;font-size:13px;">暂无历史消息</div>`;
    return;
  }
  state.lastMessageId = messages[0].id;
  state.messages = messages;

  // Track unique users for @ autocomplete
  messages.forEach(m => {
    if (m.author) {
      const isKnownBot = KNOWN_BOTS[m.author.id];
      state.knownUsers[m.author.id] = {
        name: isKnownBot ? isKnownBot.name : (m.author.global_name || m.author.username),
        username: m.author.username,
        bot: !!m.author.bot
      };
    }
    if (m.mentions) {
      m.mentions.forEach(men => {
        const isKnownBot = KNOWN_BOTS[men.id];
        state.knownUsers[men.id] = {
          name: isKnownBot ? isKnownBot.name : (men.global_name || men.username),
          username: men.username,
          bot: !!men.bot
        };
      });
    }
  });

  // Track threads in this channel
  const pId = state.parentChannel ? state.parentChannel.id : state.activeChannel.id;
  if (!state.activeThreads[pId]) state.activeThreads[pId] = [];
  messages.forEach(m => {
    if (m.thread) {
      const existing = state.activeThreads[pId].find(t => t.id === m.thread.id);
      if (!existing) {
        state.activeThreads[pId].push({
          id: m.thread.id,
          name: m.thread.name || "线程",
          messageCount: m.thread.message_count || 0
        });
      } else {
        existing.messageCount = m.thread.message_count || existing.messageCount;
        existing.name = m.thread.name || existing.name;
      }
    }
  });

  const isScrolledToBottom = messagesViewport.scrollHeight - messagesViewport.scrollTop - messagesViewport.clientHeight < 90;

  // Render in chronological order with grouping
  const sorted = [...messages].reverse();
  let prevMsg = null;
  const htmlParts = [];

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    const isFollowUp = prevMsg &&
                       prevMsg.author && m.author &&
                       prevMsg.author.id === m.author.id &&
                       !prevMsg.thread && !m.thread &&
                       (!prevMsg.components || prevMsg.components.length === 0) &&
                       (new Date(m.timestamp) - new Date(prevMsg.timestamp) < 5 * 60 * 1000);

    htmlParts.push(createMessageHTML(m, isFollowUp));
    prevMsg = m;
  }

  messagesList.innerHTML = htmlParts.join("");

  if (isScrolledToBottom) {
    messagesViewport.scrollTop = messagesViewport.scrollHeight;
  }
  notifyTouchBar();
  updateAgentChips();
}

function createMessageHTML(m, isFollowUp) {
  const authorKnown = m.author ? (KNOWN_BOTS[m.author.id] || state.knownUsers[m.author.id]) : null;
  const authorName = escapeHTML(authorKnown ? authorKnown.name : (m.author ? (m.author.global_name || m.author.username) : "Unknown"));
  const isBot = !!(m.author && (m.author.bot || KNOWN_BOTS[m.author.id]));
  const isMe = !!(m.author && state.currentUser && m.author.id === state.currentUser.id);
  const avatarLetter = (authorName[0] || "U").toUpperCase();
  const timeStr = m.timestamp ? m.timestamp.substr(11, 5) : "";

  // Parse markdown
  const formattedContent = parseMarkdown(m.content || "");

  // Parse True Discord Interaction Component Buttons
  let componentsHTML = "";
  if (m.components && m.components.length > 0) {
    componentsHTML = `<div class="components-row">`;
    m.components.forEach(row => {
      if (row.components) {
        row.components.forEach(btn => {
          let styleClass = "style-secondary";
          if (btn.style === 3) styleClass = "style-success"; // Green (Allow Once)
          if (btn.style === 4) styleClass = "style-danger";  // Red (Deny)
          if (btn.style === 1 || btn.style === 2) styleClass = "style-primary"; // Blurple (Allow Session)

          const isDisabled = !!btn.disabled;
          const appId = m.application_id || (m.author ? m.author.id : '');
          componentsHTML += `
            <button class="btn-component ${styleClass} ${isDisabled ? 'disabled' : ''}" 
                    ${isDisabled ? 'disabled' : ''}
                    onclick="handleComponentClick('${appId}', '${m.id}', '${btn.custom_id}', '${escapeHTML(btn.label)}', this)">
              ${escapeHTML(btn.label)}
            </button>
          `;
        });
      }
    });
    componentsHTML += `</div>`;
  }

  // Parse Thread Card
  let threadHTML = "";
  if (m.thread) {
    const threadName = escapeHTML(m.thread.name || "查看线程");
    const count = m.thread.message_count || 0;
    threadHTML = `
      <div class="message-thread-card" onclick="openThread('${m.thread.id}', '${escapeAttr(m.thread.name || '线程')}', ${count})">
        <div class="thread-card-left">
          <svg class="thread-card-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
          <span class="thread-card-name">${threadName}</span>
          <span class="thread-card-count">${count} 条回复</span>
        </div>
        <div class="thread-card-arrow">进入线程 ›</div>
      </div>
    `;
  }

  // Follow-up consecutive message (compact)
  if (isFollowUp) {
    return `
      <div class="message-row follow-up">
        <span class="follow-up-time">${timeStr}</span>
        <div class="message-body">
          <div class="message-content">${formattedContent}</div>
          ${componentsHTML}
          ${threadHTML}
        </div>
      </div>
    `;
  }

  // Full message row with avatar
  return `
    <div class="message-row">
      <div class="message-avatar ${isBot ? 'bot' : ''}">${avatarLetter}</div>
      <div class="message-body">
        <div class="message-meta">
          <span class="author-name ${isMe ? 'is-me' : ''}">${authorName}</span>
          ${isBot ? '<span class="bot-tag">BOT</span>' : ''}
          <span class="message-time">${timeStr}</span>
        </div>
        <div class="message-content">${formattedContent}</div>
        ${componentsHTML}
        ${threadHTML}
      </div>
    </div>
  `;
}

// Markdown Parser
function parseMarkdown(text) {
  if (!text) return "";

  // Terminal & Code blocks
  text = text.replace(/```([a-zA-Z0-9_-]*)[ \t]*\r?\n?([\s\S]*?)```/g, (match, lang, code) => {
    const langLabel = lang ? lang.toUpperCase() : "TERMINAL";
    return `
      <div class="terminal-block-wrapper">
        <div class="terminal-header">
          <div class="terminal-dots">
            <span class="terminal-dot"></span>
            <span class="terminal-dot"></span>
            <span class="terminal-dot"></span>
          </div>
          <span class="terminal-lang">${escapeHTML(langLabel)}</span>
          <button class="btn-copy" onclick="copyCode(this)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
            <span>复制</span>
          </button>
        </div>
        <pre class="code-block"><code>${escapeHTML(code.trim())}</code></pre>
      </div>
    `;
  });

  // Inline code: `code`
  text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Role mentions: <@&123456789>
  text = text.replace(/<@&(\d+)>/g, (match, id) => {
    const roleName = KNOWN_ROLES[id] || "Role";
    return `<span class="mention-pill role-pill" title="Role ID: ${id}" onclick="insertMentionFromTouchBar('${escapeAttr(roleName)}')">@${escapeHTML(roleName)}</span>`;
  });

  // User / Bot Mentions: <@123456789> or <@!123456789>
  text = text.replace(/<@!?(\d+)>/g, (match, id) => {
    const user = KNOWN_BOTS[id] || state.knownUsers[id];
    const name = user ? user.name : id;
    return `<span class="mention-pill" title="ID: ${id}" onclick="insertMentionFromTouchBar('${escapeAttr(name)}')">@${escapeHTML(name)}</span>`;
  });

  // Channel Mentions: <#123456789>
  text = text.replace(/<#(\d+)>/g, (match, id) => {
    return `<span class="mention-pill channel-pill" onclick="switchChannelById('${id}')">#${id}</span>`;
  });

  // Bold: **text**
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Newlines to <br>
  text = text.replace(/\n/g, '<br>');

  return text;
}

// Copy Code Block
window.copyCode = function(btn) {
  const code = btn.closest(".terminal-block-wrapper").querySelector("code").innerText;
  const doFeedback = () => {
    const span = btn.querySelector("span");
    if (span) span.innerText = "已复制";
    setTimeout(() => { if (span) span.innerText = "复制"; }, 2000);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(doFeedback).catch(() => {
      fallbackCopy(code);
      doFeedback();
    });
  } else {
    fallbackCopy(code);
    doFeedback();
  }
};

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (e) {}
  document.body.removeChild(ta);
}

// Component Click Handler
window.handleComponentClick = async function(appId, messageId, customId, label, btnEl) {
  if (btnEl && (btnEl.disabled || btnEl.classList.contains("disabled"))) {
    setStatus("该授权已失效或超时", "amber");
    return;
  }

  setStatus(`正在授权: ${label}...`, "amber");
  if (btnEl) btnEl.disabled = true;

  const res = await callNative("sendInteraction", {
    applicationId: appId,
    channelId: state.activeChannel.id,
    messageId: messageId,
    customId: customId
  });

  if (res && res.success) {
    setStatus(`已成功授权: ${label}`, "green");
    setTimeout(loadMessages, 800);
  } else {
    const errMsg = (res && res.error) ? res.error : "授权未通过或已过期";
    setStatus(`授权失败: ${errMsg}`, "amber");
    if (btnEl) btnEl.disabled = false;
  }
};

// Autocomplete @ Mention
function handleInputChange(e) {
  adjustTextareaHeight();

  const val = messageInput.value;
  const cursor = messageInput.selectionStart;
  const textBefore = val.slice(0, cursor);
  const match = textBefore.match(/(?:^|\s)@([a-zA-Z0-9_\u4e00-\u9fa5]*)$/);

  if (match) {
    const query = match[1].toLowerCase();
    showMentionPopover(query);
  } else {
    hideMentionPopover();
  }
}

function showMentionPopover(query) {
  const map = { ...state.knownUsers, ...KNOWN_BOTS };
  const candidates = [];
  const seenIds = new Set();

  Object.entries(map).forEach(([id, u]) => {
    if (seenIds.has(id)) return;
    seenIds.add(id);
    const known = KNOWN_BOTS[id];
    candidates.push({
      id,
      name: (known && known.name) || u.name,
      displayName: (known && known.displayName) || u.name,
      username: (known && known.username) || u.username,
      rawUsername: (known && known.rawUsername) || u.username,
      aliases: (known && known.aliases) || [],
      bot: !!u.bot,
      role: false
    });
  });

  Object.entries(KNOWN_ROLES).forEach(([id, roleName]) => {
    candidates.push({
      id,
      name: roleName,
      displayName: roleName,
      username: "role",
      aliases: [roleName.toLowerCase()],
      bot: false,
      role: true
    });
  });

  const q = (query || "").trim().toLowerCase();
  const filtered = candidates.filter(u => {
    if (!q) return true;
    if (u.name.toLowerCase().includes(q)) return true;
    if (u.displayName && u.displayName.toLowerCase().includes(q)) return true;
    if (u.username && u.username.toLowerCase().includes(q)) return true;
    if (u.rawUsername && u.rawUsername.toLowerCase().includes(q)) return true;
    if (u.id.includes(q)) return true;
    if (u.aliases && u.aliases.some(a => a.toLowerCase().includes(q))) return true;
    return false;
  });

  filtered.sort((a, b) => {
    if (a.bot && !b.bot) return -1;
    if (!a.bot && b.bot) return 1;
    return a.name.localeCompare(b.name);
  });

  state.activeMentionCandidates = filtered;
  state.mentionIndex = 0;

  if (filtered.length === 0) {
    hideMentionPopover();
    return;
  }

  mentionItems.innerHTML = filtered.map((u, i) => {
    const subText = u.role ? "身份组" : (u.rawUsername ? `@${u.rawUsername}` : `@${u.username}`);
    return `
      <div class="mention-item ${i === 0 ? 'selected' : ''}" onclick="selectMention(${i})">
        <div class="mention-item-avatar">${(u.name[0] || 'U').toUpperCase()}</div>
        <div class="mention-item-name">${escapeHTML(u.name)}</div>
        ${u.bot ? '<span class="bot-tag">BOT</span>' : ''}
        <div class="mention-item-sub">${escapeHTML(subText)}</div>
      </div>
    `;
  }).join("");

  mentionPopover.style.display = "block";
}

function hideMentionPopover() {
  mentionPopover.style.display = "none";
  state.activeMentionCandidates = [];
}

window.selectMention = function(index) {
  const candidate = state.activeMentionCandidates[index];
  if (!candidate) return;

  const val = messageInput.value;
  const cursor = messageInput.selectionStart;
  const textBefore = val.slice(0, cursor);
  const textAfter = val.slice(cursor);

  const insertTag = `@${candidate.name} `;
  const replacedBefore = textBefore.replace(/@([a-zA-Z0-9_\u4e00-\u9fa5]*)$/, insertTag);
  messageInput.value = replacedBefore + textAfter;
  messageInput.focus();
  messageInput.selectionStart = messageInput.selectionEnd = replacedBefore.length;

  adjustTextareaHeight();
  hideMentionPopover();
};

function handleInputKeyDown(e) {
  if (mentionPopover.style.display !== "none" && state.activeMentionCandidates.length > 0) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      state.mentionIndex = (state.mentionIndex + 1) % state.activeMentionCandidates.length;
      updateMentionSelection();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      state.mentionIndex = (state.mentionIndex - 1 + state.activeMentionCandidates.length) % state.activeMentionCandidates.length;
      updateMentionSelection();
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      selectMention(state.mentionIndex);
      return;
    }
    if (e.key === "Escape") {
      hideMentionPopover();
      return;
    }
  }

  // Enter to send (Shift+Enter for newline)
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
}

function updateMentionSelection() {
  const items = mentionItems.querySelectorAll(".mention-item");
  items.forEach((it, i) => {
    it.classList.toggle("selected", i === state.mentionIndex);
  });
}

// Send Message
async function handleSendMessage() {
  let text = messageInput.value.trim();
  if (!text) return;

  // Convert @Name / @Username / @Alias to <@ID> or <@&RoleID>
  Object.entries(KNOWN_BOTS).forEach(([id, b]) => {
    const namesToMatch = new Set([b.name, b.username, b.displayName, b.rawUsername, ...(b.aliases || [])]);
    namesToMatch.forEach(nm => {
      if (!nm) return;
      const pattern = new RegExp(`@${escapeRegExp(nm)}(\\s|$)`, "gi");
      text = text.replace(pattern, `<@${id}> `);
    });
  });
  Object.entries(KNOWN_ROLES).forEach(([id, roleName]) => {
    const pattern = new RegExp(`@${escapeRegExp(roleName)}(\\s|$)`, "gi");
    text = text.replace(pattern, `<@&${id}> `);
  });
  Object.entries(state.knownUsers).forEach(([id, u]) => {
    const pattern = new RegExp(`@${escapeRegExp(u.name)}(\\s|$)`, "g");
    text = text.replace(pattern, `<@${id}> `);
  });

  messageInput.value = "";
  adjustTextareaHeight();
  setStatus("发送中...", "amber");
  sendBtn.disabled = true;

  const res = await callNative("sendMessage", {
    channelId: state.activeChannel.id,
    content: text
  });

  sendBtn.disabled = false;
  if (res && res.success) {
    setStatus("连接正常 · 0% CPU", "green");
    loadMessages();
  } else {
    setStatus("发送失败", "red");
  }
}

// Dynamic Touch Bar Sync
function notifyTouchBar() {
  const activeBots = getChannelBots();

  callNative("updateTouchBar", {
    channelId: state.activeChannel.id,
    channelName: state.activeChannel.name.replace(/^[#⭐👥👤🧵\s]+/, ""),
    bots: activeBots,
    pinned: state.pinned
  });
}

window.switchChannelById = function(channelId) {
  const found = state.pinned.find(p => p.id === channelId) ||
                state.dms.find(d => d.id === channelId);
  if (found) {
    switchChannel(found);
    return;
  }
  for (const sId in state.channelsCache) {
    const c = state.channelsCache[sId].find(ch => ch.id === channelId);
    if (c) {
      switchChannel(c);
      return;
    }
  }
};

window.insertMentionFromTouchBar = function(botName) {
  const input = messageInput;
  if (!input) return;
  const currentVal = input.value;
  if (!currentVal.includes(`@${botName}`)) {
    const cursor = input.selectionStart || currentVal.length;
    const before = currentVal.slice(0, cursor);
    const after = currentVal.slice(cursor);
    const prefixSpace = before.length > 0 && !before.endsWith(" ") ? " " : "";
    const mentionText = `${prefixSpace}@${botName} `;
    input.value = before + mentionText + after;
    input.focus();
    const newPos = before.length + mentionText.length;
    input.selectionStart = input.selectionEnd = newPos;
  } else {
    input.focus();
    input.selectionStart = input.selectionEnd = input.value.length;
  }
  adjustTextareaHeight();
  hideMentionPopover();
};

window.touchBarAction = function(action) {
  if (action === "logo") {
    messagesViewport.scrollTop = messagesViewport.scrollHeight;
    messageInput.focus();
  }
};

// Utilities
function escapeHTML(str) {
  return String(str || "").replace(/[&<>'"]/g, tag => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[tag] || tag));
}

function escapeAttr(str) {
  return String(str || "").replace(/"/g, "&quot;");
}

function escapeRegExp(str) {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Launch
init();
