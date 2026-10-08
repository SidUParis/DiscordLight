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

// Stroke Icon Set (monochrome, 24x24 grid, inherits currentColor)
const ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const STAR_POINTS = "12,3.2 14.29,9.44 20.94,9.7 15.71,13.81 17.53,20.2 12,16.5 6.47,20.2 8.29,13.81 3.06,9.7 9.71,9.44";
const ICONS = {
  channel: '<path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3L8 21"/><path d="M16 3l-2 18"/>',
  group: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4"/><path d="M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  dm: '<circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/>',
  thread: '<path d="M7 5v7a3 3 0 0 0 3 3h7"/><path d="M14 12l3 3-3 3"/>',
  star: `<polygon points="${STAR_POINTS}"/>`,
  starFilled: `<polygon fill="currentColor" points="${STAR_POINTS}"/>`,
  refresh: '<path d="M20 12a8 8 0 1 1-2.34-5.66L20 8.5"/><path d="M20 3.5v5h-5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.4-4.4"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  x: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  arrowUp: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4L10 14"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  download: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>'
};

function iconSVG(name, size = 16) {
  const body = ICONS[name] || ICONS.channel;
  return `<svg class="icon" width="${size}" height="${size}" ${ICON_ATTRS}>${body}</svg>`;
}

// Icon values saved by older builds were emoji glyphs; map them (and the new string names) to icon names.
// Legacy values: U+1F465 (two people) -> group, U+1F464 (one person) -> dm, U+1F9F5 (spool) -> thread, "#" -> channel
function legacyIconName(icon) {
  const value = String(icon || "");
  if (value === "group" || value === "dm" || value === "thread" || value === "channel") return value;
  if (value.includes("\u{1F465}")) return "group";
  if (value.includes("\u{1F464}")) return "dm";
  if (value.includes("\u{1F9F5}")) return "thread";
  return "channel";
}

// Server labels saved by older builds carry a crown / folder glyph prefix (U+1F451 / U+1F4C1); strip it for display
function cleanServerName(name) {
  return String(name || "").replace(/^(?:\u{1F451}|\u{1F4C1}|\s)+/u, "");
}

// Deterministic Avatar Colors: flat [background, foreground] pairs picked by a hash of the author id
const AVATAR_PALETTE = {
  bot: [["#B9B2FF", "#1B1B1D"], ["#8FD3C7", "#1B1B1D"], ["#E6E6E6", "#1B1B1D"], ["#F4C7A1", "#1B1B1D"]],
  human: [["#D7B48A", "#1B1B1D"], ["#9FC2E8", "#1B1B1D"], ["#C9D7A3", "#1B1B1D"], ["#E8B4C8", "#1B1B1D"]]
};

function avatarStyle(id, isBot) {
  const key = String(id || "");
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  const palette = isBot ? AVATAR_PALETTE.bot : AVATAR_PALETTE.human;
  const pair = palette[hash % palette.length];
  return `background:${pair[0]};color:${pair[1]}`;
}

function isBotId(id) {
  const known = state.knownUsers[id];
  return !!(KNOWN_BOTS[id] || (known && known.bot));
}

// Client State
const state = {
  currentUser: null,
  activeChannel: { id: "", name: "加载中...", server: "" },
  parentChannel: null, // Set when inside a thread
  activeThreads: {},   // parentChannelId -> thread[]
  servers: [],
  groups: [], // Multi-person Group DMs (type 3)
  dms: [],    // 1-on-1 DMs (type 1)
  pinned: [],
  channelsCache: {}, // serverId -> channels[]
  messages: [],
  lastMessageId: null,
  knownUsers: {},
  mentionQuery: null,
  mentionIndex: 0,
  activeMentionCandidates: [],
  resolvedInteractions: {}, // messageId -> { label, time, customId } for approvals answered in this session
  ui: { collapsed: [] },    // Sidebar section keys the user has collapsed; persisted as config.ui
  // Message polling (see schedulePoll / pollMessages)
  visibility: document.hidden ? "hidden" : "active", // "hidden": window occluded, minimized or app hidden
  pollTimer: null,  // pending poll tick; null while polling is not running (token modal, init not done)
  polling: false,   // a poll request is in flight: ticks are skipped until it answers
  pollCount: 0,     // polls made in the current channel; every RESYNC_EVERY-th one re-reads the newest messages
  pollGen: 0,       // bumped on channel switch, so an answer for the previous channel is dropped
  resyncDue: false, // the next poll re-reads the newest messages (set when the window comes back)
  // Scroll-back history (see loadOlderMessages)
  historyLoading: false,   // a `before` page request is in flight
  historyExhausted: false, // nothing older than the oldest shown message (or it cannot be reached)
  historyLoaded: false,    // the user scrolled back and older pages were added: the cap is HISTORY_MAX, not MAX_MESSAGES
  historyRetryAt: 0,       // after a failed page request, wait until this time (ms) before asking again
  stickToBottom: true      // the viewport was at the bottom at the last render / scroll: image loads keep it there
};

// Sidebar sections, top to bottom: 常用关注 / 群聊与私信 / 服务器
const SECTION_KEYS = ["pinned", "dms", "servers"];

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
const historyStatus = document.getElementById("historyStatus");
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
  if (cfg.ui && Array.isArray(cfg.ui.collapsed)) {
    state.ui.collapsed = cfg.ui.collapsed.filter(key => SECTION_KEYS.includes(key));
  }

  // 2. Load User Profile
  const userRes = await callNative("fetchCurrentUser");
  if (userRes && userRes.user) {
    state.currentUser = userRes.user;
    const displayName = state.currentUser.global_name || state.currentUser.username;
    if (myUsername) myUsername.innerText = displayName;
    if (myAvatar) myAvatar.innerText = (displayName[0] || "U").toUpperCase();
    if (myAvatar) myAvatar.setAttribute("style", avatarStyle(state.currentUser.id, false));
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

  // Polling loop: every 2.5 s while the window is visible, every 15 s while it is hidden
  schedulePoll();
}

// Event Bindings
let eventsBound = false;

function bindEvents() {
  // init() runs again after the token is saved; the listeners must only be attached once
  if (eventsBound) return;
  eventsBound = true;

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

  // Sidebar: section headers collapse / expand their rows
  if (channelList) {
    channelList.addEventListener("click", (e) => {
      const toggle = e.target.closest(".section-toggle");
      if (!toggle) return;
      const key = toggle.dataset.section;
      setSectionCollapsed(key, !state.ui.collapsed.includes(key));
    });
  }

  // Server picker (first row of the 服务器 section)
  if (serverSelect) {
    serverSelect.addEventListener("change", () => {
      renderChannelList();
    });
  }

  if (channelSearch) {
    channelSearch.addEventListener("input", () => {
      searchClearBtn.style.display = channelSearch.value ? "block" : "none";
      renderChannelList();
      channelList.scrollTop = 0;
    });
    channelSearch.addEventListener("keydown", handleSearchKeyDown);
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener("click", () => {
      clearChannelSearch();
      renderChannelList();
      channelSearch.focus();
    });
  }

  // Cmd+K / Cmd+F: jump to the sidebar search. Command only: Ctrl+K (kill line) and Ctrl+F (forward char)
  // are Cocoa text-editing keys and must keep working in the composer.
  document.addEventListener("keydown", (e) => {
    if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const key = String(e.key || "").toLowerCase();
    if (key !== "k" && key !== "f") return;
    if (tokenModal && tokenModal.style.display !== "none") return;
    e.preventDefault();
    channelSearch.focus();
    channelSearch.select();
  });

  // Message stream: one delegated listener. Markup built from message data carries data-act / data-* attributes
  // and never inline handlers, so nothing from Discord is ever evaluated as script.
  if (messagesList) {
    messagesList.addEventListener("click", (e) => {
      const el = e.target.closest("[data-act]");
      if (!el || !messagesList.contains(el)) return;
      const d = el.dataset;
      switch (d.act) {
        case "component":
          handleComponentClick(d.app, d.msg, d.custom, d.label, el);
          break;
        case "thread":
          openThread(d.threadId, d.threadName, Number(d.count) || 0);
          break;
        case "mention":
          insertMentionFromTouchBar(d.name);
          break;
        case "channel":
          switchChannelById(d.id);
          break;
        case "copy":
          copyCode(el);
          break;
      }
    });

    // Images (attachments, embeds) finish loading after the render: if the view was at the bottom, keep it there.
    // `load` does not bubble, so the listener runs in the capture phase.
    messagesList.addEventListener("load", (e) => {
      if (e.target && e.target.tagName === "IMG" && state.stickToBottom) {
        messagesViewport.scrollTop = messagesViewport.scrollHeight;
      }
    }, true);
  }

  // Scrolling near the top fetches the previous page of history; the bottom flag drives the image re-pin above
  if (messagesViewport) {
    messagesViewport.addEventListener("scroll", () => {
      state.stickToBottom = isNearBottom();
      maybeLoadHistory();
    }, { passive: true });
  }

  // Mention popover rows
  if (mentionItems) {
    mentionItems.addEventListener("click", (e) => {
      const item = e.target.closest(".mention-item");
      if (item) selectMention(Number(item.dataset.index));
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

  // Fallback for the native occlusion / hide signal (main.m calls window.setAppVisible): the page's own visibility
  document.addEventListener("visibilitychange", () => window.setAppVisible(!document.hidden));

  // Mention Autocomplete & Keyboard Handling
  if (messageInput) {
    messageInput.addEventListener("keydown", handleInputKeyDown);
    messageInput.addEventListener("input", handleInputChange);
    messageInput.addEventListener("compositionstart", () => { state.composing = true; });
    messageInput.addEventListener("compositionend", () => { state.composing = false; state.compositionEndedAt = Date.now(); });
  }
}

// Auto-Expanding Textarea
function adjustTextareaHeight() {
  messageInput.style.height = "auto";
  const newHeight = Math.min(messageInput.scrollHeight, 180);
  messageInput.style.height = (newHeight > 24 ? newHeight : 24) + "px";
}

// Sidebar Search
function clearChannelSearch() {
  channelSearch.value = "";
  searchClearBtn.style.display = "none";
}

// Esc clears the field, or (when already empty) hands focus back to the composer; Enter opens the first result
function handleSearchKeyDown(e) {
  if (e.isComposing || e.keyCode === 229) return; // IME composition: Enter / Esc belong to the candidate window

  if (e.key === "Escape") {
    e.preventDefault();
    if (channelSearch.value) {
      clearChannelSearch();
      renderChannelList();
    } else {
      channelSearch.blur();
      messageInput.focus();
    }
    return;
  }

  if (e.key === "Enter") {
    e.preventDefault();
    if (!channelSearch.value.trim()) return;
    const first = channelList.querySelector(".channel-item, .thread-subitem");
    if (!first) return;
    clearChannelSearch();
    first.click(); // the row's own handler switches channel and re-renders the list (now back to the sections)
    messageInput.focus();
  }
}

// Sidebar Sections
function setSectionCollapsed(key, collapsed) {
  if (!SECTION_KEYS.includes(key) || state.ui.collapsed.includes(key) === collapsed) return;
  state.ui.collapsed = collapsed
    ? [...state.ui.collapsed, key]
    : state.ui.collapsed.filter(k => k !== key);

  // Flip the rendered section in place (keeps keyboard focus on the header button)
  const toggle = channelList.querySelector(`.section-toggle[data-section="${key}"]`);
  if (toggle) {
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    const body = toggle.nextElementSibling;
    if (body) body.hidden = collapsed;
  }
  callNative("saveConfig", { ui: state.ui });
}

// Sections that currently list a row for this channel id
function sectionsShowing(channelId) {
  const keys = [];
  if (state.pinned.some(p => p.id === channelId)) keys.push("pinned");
  if (state.groups.some(g => g.id === channelId) || state.dms.some(d => d.id === channelId)) keys.push("dms");
  if ((state.channelsCache[serverSelect.value] || []).some(c => c.id === channelId)) keys.push("servers");
  return keys;
}

// Keep the selected row visible: a thread sits under its parent row, a channel from another server moves the
// picker to that server, and if every section listing the row is collapsed the first of them opens.
function revealActiveChannel() {
  const target = state.parentChannel || state.activeChannel;
  if (!target || !target.id) return;

  let keys = sectionsShowing(target.id);
  if (keys.length === 0) {
    const serverId = Object.keys(state.channelsCache).find(sId => state.channelsCache[sId].some(c => c.id === target.id));
    if (serverId && state.servers.some(g => g.id === serverId)) {
      serverSelect.value = serverId;
      keys = ["servers"];
    }
  }
  if (keys.length > 0 && keys.every(k => state.ui.collapsed.includes(k))) {
    setSectionCollapsed(keys[0], false);
  }
}

// Text channels of one server: fetched once, cached in state.channelsCache, concurrent callers share the request
const pendingChannelFetches = {};

function ensureServerChannels(serverId) {
  if (state.channelsCache[serverId]) return Promise.resolve(state.channelsCache[serverId]);
  if (!pendingChannelFetches[serverId]) {
    const server = state.servers.find(g => g.id === serverId);
    const serverName = server ? server.name : "";
    pendingChannelFetches[serverId] = callNative("fetchGuildChannels", { guildId: serverId }).then(res => {
      delete pendingChannelFetches[serverId];
      if (!res || !Array.isArray(res.channels)) return [];
      state.channelsCache[serverId] = res.channels
        .filter(c => c.type === 0 || c.type === 5)
        .map(c => ({ id: c.id, name: `# ${c.name}`, server: serverName, type: c.type }));
      return state.channelsCache[serverId];
    });
  }
  return pendingChannelFetches[serverId];
}

// Render Channels & Threads
let channelListRenderSeq = 0;

async function renderChannelList() {
  const renderId = ++channelListRenderSeq;
  const keepScroll = channelList.scrollTop;
  const pickerHadFocus = document.activeElement === serverSelect;
  channelList.innerHTML = "";
  const filter = channelSearch.value.trim().toLowerCase();

  // 1. GLOBAL SEARCH MODE (Across Groups, Pinned, Channels, and DMs)
  if (filter) {
    const matchedGroups = state.groups.filter(g => 
      g.name.toLowerCase().includes(filter) ||
      g.rawName.toLowerCase().includes(filter) ||
      g.memberNames.some(n => n.toLowerCase().includes(filter)) ||
      g.memberUsernames.some(u => u.toLowerCase().includes(filter))
    );

    const matchedPinned = state.pinned.filter(p => 
      p.name.toLowerCase().includes(filter) || 
      (p.server && p.server.toLowerCase().includes(filter))
    );

    const matchedChannels = [];
    Object.entries(state.channelsCache).forEach(([sId, chs]) => {
      chs.forEach(c => {
        if (c.name.toLowerCase().includes(filter) || (c.server && c.server.toLowerCase().includes(filter))) {
          matchedChannels.push(c);
        }
      });
    });

    const matchedDMs = state.dms.filter(d => 
      d.name.toLowerCase().includes(filter) ||
      d.memberNames.some(n => n.toLowerCase().includes(filter)) ||
      d.memberUsernames.some(u => u.toLowerCase().includes(filter))
    );

    const totalMatches = matchedGroups.length + matchedPinned.length + matchedChannels.length + matchedDMs.length;
    if (totalMatches === 0) {
      channelList.innerHTML = `<div class="state-empty">未找到包含 “${escapeHTML(filter)}” 的群聊、频道或好友</div>`;
      return;
    }

    if (matchedGroups.length > 0) {
      renderSectionHeader(`多人群聊 (${matchedGroups.length})`);
      matchedGroups.forEach(g => renderChannelItem(g, "group"));
    }

    if (matchedPinned.length > 0) {
      renderSectionHeader(`常用关注 (${matchedPinned.length})`);
      matchedPinned.forEach(p => renderChannelItem(p, p.icon || "channel"));
    }

    if (matchedChannels.length > 0) {
      renderSectionHeader(`服务器频道 (${matchedChannels.length})`);
      matchedChannels.forEach(c => renderChannelItem(c, "channel"));
    }

    if (matchedDMs.length > 0) {
      renderSectionHeader(`私信好友 (${matchedDMs.length})`);
      matchedDMs.forEach(d => renderChannelItem(d, "dm"));
    }
    return;
  }

  // 2. SECTION VIEW (normal browsing): three collapsible sections in one scrolling list
  // 常用关注: pinned items with their active threads, server tag on the right
  const pinnedBody = renderSection("pinned", "常用关注", state.pinned.length);
  if (state.pinned.length === 0) {
    pinnedBody.innerHTML = `<div class="state-empty">还没有关注。点击右上角的星标，把常用频道加进来</div>`;
  } else {
    state.pinned.forEach(p => renderChannelItem(p, p.icon || "channel", true, true, pinnedBody));
  }

  // 群聊与私信: group DMs first, then 1-on-1 DMs (both already sorted by activity)
  const dmsBody = renderSection("dms", "群聊与私信", state.groups.length + state.dms.length);
  if (state.groups.length === 0 && state.dms.length === 0) {
    dmsBody.innerHTML = `<div class="state-empty">暂无群聊或私信</div>`;
  } else {
    state.groups.forEach(g => renderChannelItem(g, "group", false, false, dmsBody));
    state.dms.forEach(d => renderChannelItem(d, "dm", false, false, dmsBody));
  }

  // 服务器: the picker is the first row, then the selected server's text channels (hidden when there are no servers)
  if (state.servers.length > 0) {
    const serverId = serverSelect.value;
    let items = state.channelsCache[serverId];
    const serversBody = renderSection("servers", "服务器", items ? items.length : null);

    const pickerRow = document.createElement("div");
    pickerRow.className = "server-picker";
    pickerRow.appendChild(serverSelect);
    serversBody.appendChild(pickerRow);
    if (pickerHadFocus) serverSelect.focus();

    if (!items) {
      const loadingRow = document.createElement("div");
      loadingRow.className = "state-empty";
      loadingRow.innerText = "正在载入频道…";
      serversBody.appendChild(loadingRow);
      channelList.scrollTop = keepScroll;

      items = await ensureServerChannels(serverId);
      if (renderId !== channelListRenderSeq) return; // a newer render owns the list now
      loadingRow.remove();
      const badge = serversBody.previousElementSibling.querySelector(".channel-badge");
      if (badge) {
        badge.textContent = items.length;
        badge.hidden = false;
      }
    }

    if (items.length === 0) {
      const emptyRow = document.createElement("div");
      emptyRow.className = "state-empty";
      emptyRow.innerText = "这个服务器没有可见的文字频道";
      serversBody.appendChild(emptyRow);
    }
    items.forEach(c => renderChannelItem(c, "channel", true, false, serversBody));
  }

  channelList.scrollTop = keepScroll;
}

// One collapsible sidebar section: a header button (chevron, label, count) plus the body that holds its rows.
// Returns the body element. A null count hides the badge (the server's channels are still loading).
function renderSection(key, label, count) {
  const collapsed = state.ui.collapsed.includes(key);
  const section = document.createElement("div");
  section.className = "sidebar-section";
  section.innerHTML = `
    <button type="button" class="section-toggle" data-section="${key}" aria-expanded="${collapsed ? "false" : "true"}" aria-controls="sectionBody-${key}">
      <span class="section-chevron">${iconSVG("chevronDown", 12)}</span>
      <span class="section-label">${escapeHTML(label)}</span>
      <span class="channel-badge"${count === null ? " hidden" : ""}>${count === null ? "" : Number(count)}</span>
    </button>
    <div class="section-body" id="sectionBody-${key}"${collapsed ? " hidden" : ""}></div>
  `;
  channelList.appendChild(section);
  return section.querySelector(".section-body");
}

function renderSectionHeader(text) {
  const headerDiv = document.createElement("div");
  headerDiv.className = "channel-section-header";
  headerDiv.innerText = text;
  channelList.appendChild(headerDiv);
}

// `icon` is an icon name ("channel" | "group" | "dm" | "thread"); item.icon (new name or legacy glyph) wins when present.
// `allowThreads` nests the channel's active threads under the row, `showServerTag` adds the server label on the right,
// `container` is the element the rows go into (a section body, or the list itself for search results).
function renderChannelItem(item, icon, allowThreads = false, showServerTag = true, container = channelList) {
  const isChannelActive = state.activeChannel.id === item.id;
  const cleanDisplayName = item.name.replace(/^[#⭐👥👤🧵\s]+/u, "");
  const isLegacyThreadName = /^\s*\u{1F9F5}/u.test(item.name);
  const iconName = isLegacyThreadName ? "thread" : legacyIconName(item.icon || icon);
  const div = document.createElement("div");
  div.className = `channel-item ${isChannelActive ? "active" : ""}${item.subtitle ? " has-subtitle" : ""}`;

  let badgeHTML = "";
  if (item.type === 3 && item.memberCount) {
    badgeHTML = `<span class="channel-badge">${escapeHTML(item.memberCount)}人</span>`;
  } else if (item.server && showServerTag) {
    badgeHTML = `<span class="server-tag">${escapeHTML(cleanServerName(item.server))}</span>`;
  }

  let subtitleHTML = "";
  if (item.subtitle) {
    subtitleHTML = `<div class="channel-subtitle" title="${escapeHTML(item.subtitle)}">${escapeHTML(item.subtitle)}</div>`;
  }

  div.innerHTML = `
    <span class="channel-icon">${iconSVG(iconName)}</span>
    <div class="channel-text-group">
      <div class="channel-name" title="${escapeHTML(cleanDisplayName)}">${escapeHTML(cleanDisplayName)}</div>
      ${subtitleHTML}
    </div>
    ${badgeHTML}
  `;

  div.addEventListener("click", () => {
    state.parentChannel = null;
    switchChannel(item);
  });
  container.appendChild(div);

  // Active Threads if in channel
  if (allowThreads) {
    const threads = state.activeThreads[item.id] || [];
    threads.forEach(t => {
      const isThreadActive = state.activeChannel.id === t.id;
      const tDiv = document.createElement("div");
      tDiv.className = `thread-subitem ${isThreadActive ? "active" : ""}`;
      tDiv.innerHTML = `
        <span class="thread-sub-icon">${iconSVG("thread", 14)}</span>
        <span class="thread-sub-name" title="${escapeHTML(t.name)}">${escapeHTML(t.name)}</span>
      `;
      tDiv.addEventListener("click", (e) => {
        e.stopPropagation();
        openThread(t.id, t.name, t.messageCount, item);
      });
      container.appendChild(tDiv);
    });
  }
}

function switchChannel(channel) {
  state.parentChannel = null;
  state.activeChannel = channel;
  revealActiveChannel();
  updateHeader();
  renderChannelList();
  const namePrefix = (channel.type === 3 || channel.type === 1) ? "" : "#";
  messagesList.innerHTML = `<div class="state-empty">正在载入 ${namePrefix}${escapeHTML(channel.name.replace(/^[#⭐👥👤🧵\s]+/u, ""))}…</div>`;
  state.lastMessageId = null;
  state.messages = [];
  resetPolling();
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
    name: threadName,
    server: state.parentChannel ? state.parentChannel.name : "",
    isThread: true
  };

  revealActiveChannel();
  updateHeader();
  renderChannelList();
  messagesList.innerHTML = `<div class="state-empty">正在载入线程【${escapeHTML(threadName)}】…</div>`;
  state.lastMessageId = null;
  state.messages = [];
  resetPolling();
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
  const isGroup = state.activeChannel.type === 3;
  const isDM = state.activeChannel.type === 1;

  if (isThread) {
    if (threadBackBtn) {
      threadBackBtn.style.display = "inline-flex";
      const cleanParentName = state.parentChannel.name.replace(/^[#⭐👥👤🧵\s]+/u, "");
      document.getElementById("threadBackText").innerText = `#${cleanParentName}`;
    }
    if (channelHash) channelHash.innerHTML = iconSVG("thread");
    const cleanTitle = state.activeChannel.name.replace(/^[#⭐👥👤🧵\s]+/u, "");
    activeChannelTitle.innerText = cleanTitle;
    activeChannelServer.innerText = `子线程 · 来自 #${state.parentChannel.name.replace(/^[#⭐👥👤🧵\s]+/u, "")}`;
    messageInput.placeholder = "在线程中回复…";
  } else if (isGroup) {
    if (threadBackBtn) threadBackBtn.style.display = "none";
    if (channelHash) channelHash.innerHTML = iconSVG("group");
    activeChannelTitle.innerText = state.activeChannel.name;
    activeChannelServer.innerText = state.activeChannel.subtitle || "多人群聊";
    messageInput.placeholder = "在群聊中发言，@ 唤起成员";
  } else if (isDM) {
    if (threadBackBtn) threadBackBtn.style.display = "none";
    if (channelHash) channelHash.innerHTML = iconSVG("dm");
    activeChannelTitle.innerText = state.activeChannel.name;
    activeChannelServer.innerText = state.activeChannel.subtitle || "私信会话";
    messageInput.placeholder = `发送私信给 ${state.activeChannel.name}`;
  } else {
    if (threadBackBtn) threadBackBtn.style.display = "none";
    if (channelHash) channelHash.innerHTML = iconSVG("channel");
    const cleanTitle = state.activeChannel.name.replace(/^[#⭐👥👤🧵\s]+/u, "");
    activeChannelTitle.innerText = cleanTitle;
    activeChannelServer.innerText = cleanServerName(state.activeChannel.server);
    messageInput.placeholder = `给 #${cleanTitle} 发消息，@ 唤起智能体`;
  }

  // Hide the title / server divider when there is no server label (class toggle, so the CSS needs no relational selector)
  const chatHeader = activeChannelServer.closest(".chat-header");
  if (chatHeader) chatHeader.classList.toggle("no-server", !activeChannelServer.textContent.trim());

  const isPinned = state.pinned.some(p => p.id === state.activeChannel.id);
  const pinLabel = isPinned ? "已关注" : "关注";
  pinToggleBtn.innerHTML = iconSVG(isPinned ? "starFilled" : "star");
  pinToggleBtn.classList.toggle("pinned", isPinned);
  pinToggleBtn.title = pinLabel;
  pinToggleBtn.setAttribute("aria-label", pinLabel);
  pinToggleBtn.setAttribute("aria-pressed", isPinned ? "true" : "false");

  updateAgentChips();
}

// Quick Agent / Member Chips Bar: agents first (rounded-square avatars), then group DM members (round avatars)
function updateAgentChips() {
  if (!inputAgentChips) return;
  inputAgentChips.innerHTML = "";

  const { bots, members } = getMentionTargets();
  if (bots.length === 0 && members.length === 0) {
    inputAgentChips.style.display = "none";
    return;
  }

  inputAgentChips.style.display = "flex";
  const addChip = (item, isBot) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "agent-chip";
    chip.innerHTML = `
      <span class="agent-chip-avatar${isBot ? " bot" : ""}" style="${avatarStyle(item.id, isBot)}">${escapeHTML((Array.from(item.name || "")[0] || "U").toUpperCase())}</span>
      <span>@${escapeHTML(item.name)}</span>
    `;
    chip.addEventListener("click", () => {
      insertMentionFromTouchBar(item.name);
    });
    inputAgentChips.appendChild(chip);
  };
  bots.forEach(item => addChip(item, true));
  if (bots.length > 0 && members.length > 0) {
    const sep = document.createElement("span");
    sep.className = "agent-chip-sep";
    sep.setAttribute("aria-hidden", "true");
    inputAgentChips.appendChild(sep);
  }
  members.forEach(item => addChip(item, false));
}

// Who the composer chips and the Touch Bar offer for a quick @mention in the active channel.
// Returns { bots, members }, items { id, name, username }, deduplicated by id and by name across both lists.
//   bots:    bot recipients of a DM / group DM; bot authors and bot mentions in the loaded messages (newest first);
//            then, in server channels and threads only, the KNOWN_BOTS fallback. Never the fallback in DMs / group DMs.
//   members: group DMs (type 3) only: the human recipients, without the current user. Empty everywhere else.
function getMentionTargets() {
  const ch = state.activeChannel || {};
  // Pinned entries keep the type but not the recipients: take those (and a missing type) from the DM list
  const dmEntry = ch.isThread ? null : (state.groups.find(g => g.id === ch.id) || state.dms.find(d => d.id === ch.id) || null);
  const type = ch.type !== undefined ? ch.type : (dmEntry ? dmEntry.type : undefined);
  const isDirect = type === 1 || type === 3;
  const recipients = !isDirect ? [] : (Array.isArray(ch.recipients) ? ch.recipients : ((dmEntry && dmEntry.recipients) || []));
  const myId = state.currentUser ? state.currentUser.id : null;

  const bots = [];
  const members = [];
  const seenIds = new Set();
  const seenNames = new Set();
  const add = (list, user) => {
    if (!user || !user.id || user.id === myId || seenIds.has(user.id)) return;
    const known = KNOWN_BOTS[user.id];
    const name = known ? known.name : (user.global_name || user.username);
    if (!name || seenNames.has(name)) return;
    seenIds.add(user.id);
    seenNames.add(name);
    list.push({ id: user.id, name, username: user.username || (known ? known.username : "") });
  };
  const isBotUser = (u) => !!(u && (u.bot === true || isBotId(u.id)));

  recipients.forEach(r => { if (isBotUser(r)) add(bots, r); });
  (state.messages || []).forEach(m => {
    if (m.author && (m.author.bot || KNOWN_BOTS[m.author.id])) add(bots, m.author);
    (m.mentions || []).forEach(men => { if (men.bot || KNOWN_BOTS[men.id]) add(bots, men); });
  });
  if (!isDirect) Object.values(KNOWN_BOTS).forEach(b => add(bots, b));

  if (type === 3) recipients.forEach(r => { if (!isBotUser(r)) add(members, r); });
  return { bots, members };
}

// Kept for callers that only want the agents
function getChannelBots() {
  return getMentionTargets().bots;
}

async function togglePinCurrentChannel() {
  const isPinned = state.pinned.some(p => p.id === state.activeChannel.id);
  if (isPinned) {
    state.pinned = state.pinned.filter(p => p.id !== state.activeChannel.id);
  } else {
    const isGroup = state.activeChannel.type === 3;
    const isDM = state.activeChannel.type === 1;
    state.pinned.push({
      id: state.activeChannel.id,
      name: state.activeChannel.name,
      server: state.activeChannel.server || (isGroup ? "多人群聊" : (isDM ? "私信" : "")),
      icon: isGroup ? "group" : (isDM ? "dm" : (state.activeChannel.isThread ? "thread" : "channel")),
      type: state.activeChannel.type,
      subtitle: state.activeChannel.subtitle
    });
  }
  updateHeader();
  renderChannelList();
  await callNative("saveConfig", { pinned_channels: state.pinned });
}

// Fetch Servers, Groups & DMs
async function loadServersAndDMs() {
  const dmRes = await callNative("fetchDMs");
  if (dmRes && dmRes.dms) {
    const rawDms = dmRes.dms;

    // Sort all conversations by activity (most recent first)
    rawDms.sort((a, b) => {
      const idA = BigInt(a.last_message_id || "0");
      const idB = BigInt(b.last_message_id || "0");
      if (idB > idA) return 1;
      if (idB < idA) return -1;
      return 0;
    });

    state.groups = [];
    state.dms = [];

    rawDms.forEach(d => {
      const isGroup = d.type === 3;
      const recips = d.recipients || [];
      const memberNames = recips.map(r => r.global_name || r.username);
      const memberUsernames = recips.map(r => r.username);

      // Populate knownUsers for autocomplete @
      recips.forEach(r => {
        state.knownUsers[r.id] = {
          name: r.global_name || r.username,
          username: r.username,
          bot: !!r.bot
        };
      });

      let title = d.name;
      if (!title) {
        if (isGroup) {
          title = memberNames.join(", ") || "未命名群聊";
        } else {
          title = memberNames[0] || (recips[0] ? recips[0].username : "私信");
        }
      }

      const item = {
        id: d.id,
        name: title,
        rawName: d.name || "",
        type: d.type,
        icon: isGroup ? "group" : "dm",
        lastMessageId: d.last_message_id || "",
        recipients: recips,
        memberNames: memberNames,
        memberUsernames: memberUsernames,
        memberCount: recips.length + 1,
        subtitle: isGroup 
          ? (d.name ? `${memberNames.join(", ")} · ${recips.length + 1}人` : `多人群聊 · ${recips.length + 1}人`)
          : (recips[0] ? `@${recips[0].username}` : "私信会话"),
        server: isGroup ? "多人群聊" : "私信会话"
      };

      if (isGroup) {
        state.groups.push(item);
      } else {
        state.dms.push(item);
      }
    });
  }

  const guildRes = await callNative("fetchGuilds");
  if (guildRes && guildRes.guilds) {
    state.servers = guildRes.guilds;
    serverSelect.innerHTML = "";
    state.servers.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g.id;
      opt.innerText = g.name;
      serverSelect.appendChild(opt);
    });

    // Background pre-cache channels for the first servers for instant global search
    state.servers.slice(0, 6).forEach(g => { ensureServerChannels(g.id); });
  }
}

// Status Helper
function setStatus(text, type = "green") {
  const textEl = statusIndicator.querySelector(".status-text");
  const dotEl = statusIndicator.querySelector(".status-dot");
  if (textEl) textEl.innerText = text;
  statusIndicator.title = text;
  if (dotEl) {
    dotEl.style.backgroundColor = type === "amber" ? "var(--warn)" : (type === "red" ? "var(--danger)" : "var(--ok)");
  }
}

// Idle status text: says when polling has slowed down because the window cannot be seen
const STATUS_CONNECTED = "已连接";
const STATUS_CONNECTED_HIDDEN = "已连接 · 后台低频";

function setConnectedStatus() {
  setStatus(state.visibility === "hidden" ? STATUS_CONNECTED_HIDDEN : STATUS_CONNECTED, "green");
}

// Messages Loading & Rendering
const LOAD_LIMIT = 40;

// Channel load and full reloads (refresh, after sending, after a button click): the newest LOAD_LIMIT messages.
// When the user has scrolled back (state.historyLoaded), the answer is merged like a resync instead, so the older
// pages they loaded (and their scroll position) survive the reload.
async function loadMessages() {
  if (!state.activeChannel.id) return;
  const channelId = state.activeChannel.id;
  const gen = state.pollGen;
  const shownTop = state.lastMessageId;
  const res = await callNative("fetchMessages", { channelId, limit: LOAD_LIMIT });
  if (channelId !== state.activeChannel.id) return; // switched away while loading: this answer is for another channel
  if (res && res.messages) {
    setConnectedStatus();
    const latest = res.messages;
    if (state.historyLoaded && gen === state.pollGen && latest.length >= LOAD_LIMIT && state.lastMessageId &&
        compareSnowflakes(latest[latest.length - 1].id, state.lastMessageId) <= 0) {
      const merged = mergeLatest(latest, shownTop, LOAD_LIMIT);
      if (merged[0].id !== state.lastMessageId || messagesSignature(merged) !== messagesSignature(state.messages)) {
        renderMessages(merged);
      }
      return;
    }
    resetHistory(latest.length < LOAD_LIMIT);
    renderMessages(latest);
  } else {
    setStatus("加载失败", "red");
  }
}

// Scroll-back history: near the top of the viewport, fetch the page before the oldest shown message and add it to
// the end of state.messages (newest first). The view is re-anchored so what the user was reading does not move.
const HISTORY_PAGE = 40;
const HISTORY_MAX = 400;       // messages kept once the user has scrolled back (MAX_MESSAGES otherwise)
const HISTORY_TRIGGER_PX = 80; // distance from the top of the viewport that asks for the previous page
const HISTORY_RETRY_MS = 3000; // pause after a failed page request

// Every full load replaces the list: nothing scrolled back any more; `exhausted` when the load returned a short page
function resetHistory(exhausted) {
  state.historyLoaded = false;
  state.historyExhausted = !!exhausted;
  state.historyRetryAt = 0;
}

function isNearBottom() {
  return messagesViewport.scrollHeight - messagesViewport.scrollTop - messagesViewport.clientHeight < 90;
}

// The slim row above the list: loading, or the note that the HISTORY_MAX cap was reached. Nothing when exhausted.
function updateHistoryStatus() {
  if (!historyStatus) return;
  let text = "";
  if (state.historyLoading) text = "正在载入更早的消息…";
  else if (state.historyLoaded && state.messages.length >= HISTORY_MAX) text = `只显示最近 ${HISTORY_MAX} 条消息`;
  else if (state.historyExhausted && state.historyLoaded) text = "已经是最早的消息";
  else if (state.historyRetryAt && Date.now() < state.historyRetryAt) text = "载入更早的消息失败，稍后自动重试";
  if (historyStatus.textContent !== text) historyStatus.textContent = text;
  if (historyStatus.hidden !== !text) historyStatus.hidden = !text;
}

function maybeLoadHistory() {
  if (state.historyLoading || state.historyExhausted || !state.activeChannel.id) return;
  if (state.messages.length === 0 || state.messages.length >= HISTORY_MAX || !state.lastMessageId) return;
  if (messagesViewport.scrollTop >= HISTORY_TRIGGER_PX || Date.now() < state.historyRetryAt) return;
  loadOlderMessages();
}

async function loadOlderMessages() {
  const channelId = state.activeChannel.id;
  const gen = state.pollGen;
  const oldest = state.messages[state.messages.length - 1].id;
  state.historyLoading = true;
  updateHistoryStatus();
  const res = await callNative("fetchMessages", { channelId, limit: HISTORY_PAGE, before: oldest });
  // Switched channel meanwhile: the switch already reset the history flags; this answer belongs to the old channel
  if (gen !== state.pollGen || channelId !== state.activeChannel.id) return;
  state.historyLoading = false;

  // The native side answers { messages: [], error } when the request failed: try again a little later
  if (!res || !Array.isArray(res.messages) || res.error !== undefined) {
    state.historyRetryAt = Date.now() + HISTORY_RETRY_MS;
    updateHistoryStatus();
    return;
  }
  // A full reload replaced the list while this page was in flight: it no longer joins on, drop it (scroll again)
  const shownOldest = state.messages.length ? state.messages[state.messages.length - 1].id : null;
  if (shownOldest !== oldest) {
    updateHistoryStatus();
    return;
  }
  const known = new Set(state.messages.map(m => m.id));
  const older = res.messages
    .filter(m => m && m.id && !known.has(m.id) && compareSnowflakes(m.id, oldest) < 0)
    .sort((a, b) => compareSnowflakes(b.id, a.id));
  if (res.messages.length < HISTORY_PAGE || older.length === 0) state.historyExhausted = true;
  if (older.length === 0) {
    updateHistoryStatus();
    return;
  }
  state.historyLoaded = true;
  renderMessages([...state.messages, ...older].slice(0, HISTORY_MAX), { anchorId: oldest });
}

// Message polling. Idle cost is what matters here: a poll asks only for messages newer than the newest one shown
// (`after`), which is an empty array almost every time, so nothing is parsed or re-rendered. `after` cannot see
// edits (a bot disabling its approval buttons, a thread's reply count), so every RESYNC_EVERY-th poll re-reads the
// newest RESYNC_LIMIT messages and re-renders only if something in them changed.
const POLL_MS = { active: 2500, hidden: 15000 };
const POLL_AFTER_LIMIT = 50;
const RESYNC_LIMIT = 15;
const RESYNC_EVERY = 12;
const MAX_MESSAGES = 100;

function pollInterval() {
  const key = state.visibility === "hidden" ? "hidden" : "active";
  const override = window.__DL_POLL_MS; // test harness only; undefined in the app
  const ms = override ? Number(override[key]) : NaN;
  return ms > 0 ? ms : POLL_MS[key];
}

// One timer at a time; nothing is scheduled while the token modal is up
function schedulePoll() {
  clearTimeout(state.pollTimer);
  state.pollTimer = null;
  if (tokenModal && tokenModal.style.display !== "none") return;
  state.pollTimer = setTimeout(() => {
    state.pollTimer = null;
    pollMessages();
    schedulePoll();
  }, pollInterval());
}

// Called by main.m (window occlusion, app hide / unhide) and by the visibilitychange fallback
window.setAppVisible = function(visible) {
  const next = visible ? "active" : "hidden";
  if (state.visibility === next) return;
  state.visibility = next;
  if (statusIndicator.title === STATUS_CONNECTED || statusIndicator.title === STATUS_CONNECTED_HIDDEN) setConnectedStatus();
  if (state.pollTimer === null) return; // polling not running (token modal, or init still loading)
  if (next === "active") {
    // Back in front: poll now instead of waiting out the slow timer, and re-read the newest messages so edits made
    // while hidden show at once (if a request is still in flight, the next tick does it)
    state.resyncDue = true;
    pollMessages();
  }
  schedulePoll();
};

// A channel switch starts polling (and scroll-back history) over; an answer still in flight belongs to the previous channel
function resetPolling() {
  state.pollGen++;
  state.polling = false;
  state.pollCount = 0;
  state.resyncDue = false;
  state.historyLoading = false;
  state.stickToBottom = true;
  resetHistory(false);
  updateHistoryStatus();
  if (state.pollTimer !== null) schedulePoll(); // first poll one interval after the switch, not mid-load
}

async function pollMessages() {
  const channelId = state.activeChannel.id;
  if (!channelId || state.polling) return;
  const gen = state.pollGen;
  state.polling = true;
  try {
    state.pollCount++;

    // Nothing shown yet (empty channel, or the first load still running): the old full poll
    if (!state.lastMessageId) {
      const res = await callNative("fetchMessages", { channelId, limit: RESYNC_LIMIT });
      if (gen !== state.pollGen) return;
      if (res && res.messages && res.messages.length > 0 && res.messages[0].id !== state.lastMessageId) {
        resetHistory(res.messages.length < RESYNC_LIMIT);
        renderMessages(res.messages);
      }
      return;
    }

    // Periodic re-read of the newest messages: catches edits, deletions and reply counts that `after` cannot see
    if (state.resyncDue || state.pollCount % RESYNC_EVERY === 0) {
      state.resyncDue = false;
      const shownTop = state.lastMessageId; // anything newer that is shown when the answer comes was loaded meanwhile
      const res = await callNative("fetchMessages", { channelId, limit: RESYNC_LIMIT });
      if (gen !== state.pollGen || !res || !Array.isArray(res.messages) || res.messages.length === 0) return;
      const latest = res.messages;
      if (latest.length >= RESYNC_LIMIT && compareSnowflakes(latest[latest.length - 1].id, state.lastMessageId) > 0) {
        // So many new messages that the re-read does not reach the newest one shown: there may be a gap in between
        await pollReloadNewest(channelId, gen);
        return;
      }
      const merged = mergeLatest(latest, shownTop);
      if (merged[0].id !== state.lastMessageId || messagesSignature(merged) !== messagesSignature(state.messages)) {
        const prevShown = state.messages; // [WP2 notifications] hook
        renderMessages(merged);
        maybeNotify(arrivedSince(latest, shownTop, prevShown)); // [WP2 notifications] hook: new ids only
      }
      return;
    }

    // Incremental poll: only messages newer than the newest one shown (newest first, like a full fetch)
    const res = await callNative("fetchMessages", { channelId, limit: POLL_AFTER_LIMIT, after: state.lastMessageId });
    if (gen !== state.pollGen || !res || !Array.isArray(res.messages) || res.messages.length === 0) return;

    if (res.messages.length >= POLL_AFTER_LIMIT) {
      // A full page (e.g. after the Mac slept): more may be missing beyond it
      await pollReloadNewest(channelId, gen);
      return;
    }

    const known = new Set(state.messages.map(m => m.id));
    const fresh = res.messages.filter(m => m && m.id && !known.has(m.id));
    if (fresh.length === 0) return;
    renderMessages(capMessages([...fresh, ...state.messages])); // sets state.messages / lastMessageId
    maybeNotify(fresh); // [WP2 notifications] hook
  } finally {
    if (gen === state.pollGen) state.polling = false;
  }
}

// More new messages than one poll answer covers: show the newest ones, like a channel load (this drops any
// scrolled-back history: the gap in between cannot be shown)
async function pollReloadNewest(channelId, gen) {
  const prevTop = state.lastMessageId, prevShown = state.messages; // [WP2 notifications] hook
  const res = await callNative("fetchMessages", { channelId, limit: LOAD_LIMIT });
  if (gen === state.pollGen && res && Array.isArray(res.messages) && res.messages.length > 0) {
    resetHistory(res.messages.length < LOAD_LIMIT);
    renderMessages(res.messages);
    maybeNotify(arrivedSince(res.messages, prevTop, prevShown)); // [WP2 notifications] hook
  }
}

// Memory cap, applied when new messages come in: MAX_MESSAGES normally, HISTORY_MAX once the user has scrolled back
// (so the pages they loaded are not cut away by the next poll). Cutting the oldest ones makes older history
// reachable again.
function capMessages(list) {
  const cap = state.historyLoaded ? HISTORY_MAX : MAX_MESSAGES;
  if (list.length <= cap) return list;
  state.historyExhausted = false;
  return list.slice(0, cap);
}

// The re-read newest messages replace what is shown for their id range. Shown messages inside that range that the
// re-read no longer contains were deleted; older ones are kept. Shown messages newer than the re-read were deleted
// too (it is the newest of the channel), unless they are newer than `shownTop` (the top when the re-read was asked):
// a load that answered while the re-read was in flight added those, so they are kept.
// `limit` is what the re-read asked for (RESYNC_LIMIT for the poll resync, LOAD_LIMIT for a reload after scroll-back).
function mergeLatest(latest, shownTop, limit = RESYNC_LIMIT) {
  const ids = new Set(latest.map(m => m.id));
  const newestId = latest[0].id;
  const oldestId = latest[latest.length - 1].id;
  const wholeChannel = latest.length < limit; // fewer than asked for: there is nothing older
  const newer = state.messages.filter(m => !ids.has(m.id) && compareSnowflakes(m.id, newestId) > 0 && compareSnowflakes(m.id, shownTop) > 0);
  const older = wholeChannel ? [] : state.messages.filter(m => !ids.has(m.id) && compareSnowflakes(m.id, oldestId) < 0);
  return capMessages([...newer, ...latest, ...older]);
}

// Snowflake ids are decimal strings without leading zeros: a longer one is larger, equal lengths compare as text
function compareSnowflakes(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : (a > b ? 1 : 0);
}

// What a re-render would change: ids and their order, edits, button disabled flags, thread cards, and the number of
// embeds / attachments (Discord adds link previews to a message later without touching edited_timestamp)
function messagesSignature(messages) {
  return messages.map(m => {
    const buttons = (m.components || []).map(row =>
      (row.components || []).map(c => `${c.custom_id || c.url || ""}:${c.disabled ? 1 : 0}`).join(",")
    ).join(";");
    const thread = m.thread ? `${m.thread.id}:${m.thread.message_count || 0}:${m.thread.name || ""}` : "";
    const media = `${Array.isArray(m.embeds) ? m.embeds.length : 0}:${Array.isArray(m.attachments) ? m.attachments.length : 0}`;
    return `${m.id}|${m.edited_timestamp || ""}|${buttons}|${thread}|${media}`;
  }).join("\n");
}

// Bottom edge of a shown message's row (viewport coordinates), or null
function rowBottom(messageId) {
  const row = messagesList.querySelector(`.message-row[data-msg-id="${CSS.escape(String(messageId))}"]`);
  return row ? row.getBoundingClientRect().bottom : null;
}

// opts.anchorId (scroll-back): keep that message's row where it is on screen, instead of the bottom pinning. Its
// bottom edge is the anchor, so the rows below it stay put even if it now groups with an older message above it.
function renderMessages(messages, opts) {
  if (!messages || messages.length === 0) {
    messagesList.innerHTML = `<div class="state-empty">暂无历史消息</div>`;
    updateHistoryStatus();
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

  const isScrolledToBottom = isNearBottom();
  const anchorId = opts && opts.anchorId ? opts.anchorId : null;
  const anchorBefore = anchorId ? rowBottom(anchorId) : null;

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

  updateHistoryStatus();
  messagesList.innerHTML = htmlParts.join("");

  const anchorAfter = anchorBefore !== null ? rowBottom(anchorId) : null;
  if (anchorAfter !== null) {
    messagesViewport.scrollTop += anchorAfter - anchorBefore;
  } else if (isScrolledToBottom) {
    messagesViewport.scrollTop = messagesViewport.scrollHeight;
  }
  state.stickToBottom = isNearBottom();
  notifyTouchBar();
  updateAgentChips();
  // A list too short to scroll never sends a scroll event (and a view already at the top sends none either):
  // ask for older messages right away when the top is in reach
  maybeLoadHistory();
}

function createMessageHTML(m, isFollowUp) {
  const authorKnown = m.author ? (KNOWN_BOTS[m.author.id] || state.knownUsers[m.author.id]) : null;
  const rawAuthorName = String((authorKnown ? authorKnown.name : (m.author ? (m.author.global_name || m.author.username) : "")) || "Unknown");
  const authorName = escapeHTML(rawAuthorName);
  const isBot = !!(m.author && (m.author.bot || KNOWN_BOTS[m.author.id]));
  const isMe = !!(m.author && state.currentUser && m.author.id === state.currentUser.id);
  const avatarLetter = escapeHTML((Array.from(rawAuthorName)[0] || "U").toUpperCase());
  const timeStr = m.timestamp ? fmtTime(m.timestamp) : "";

  // Parse markdown
  const formattedContent = parseMarkdown(m.content || "");

  // Attachments and embeds, under the content (inside the approval card body for approval prompts)
  const accessoriesHTML = messageAccessoriesHTML(m, !formattedContent);

  // Parse True Discord Interaction Component Buttons
  let buttonsHTML = "";
  let buttonCount = 0;
  let disabledCount = 0;
  let linkCount = 0;
  let selectCount = 0;
  const buttonIds = [];
  const buttons = [];
  if (m.components && m.components.length > 0) {
    m.components.forEach(row => {
      if (row.components) {
        row.components.forEach(btn => {
          if (!btn) return;
          // Select menus (string / user / role / mentionable / channel) are not supported yet: a disabled-looking
          // placeholder with no data-act (the delegated listener ignores it), left out of the approval counts
          if (SELECT_MENU_TYPES.includes(btn.type)) {
            selectCount++;
            const placeholder = String(btn.placeholder || "") || "选择…";
            buttonsHTML += `
              <button type="button" class="btn-component style-secondary select-menu" aria-disabled="true" title="下拉选择暂不支持">${escapeHTML(placeholder)}${iconSVG("chevronDown", 13)}</button>
            `;
            return;
          }
          if (btn.type !== undefined && btn.type !== 2) return; // action rows hold only buttons (2) and select menus
          // Link button (style 5): carries a url and no custom_id. It is a plain link (opened in the system browser by
          // the native navigation policy), never an interaction: no data-act, and it is left out of the approval counts.
          if (btn.style === 5) {
            const url = String(btn.url || "");
            linkCount++;
            if (!btn.disabled && /^https?:\/\/[^\s/]\S*$/i.test(url)) {
              buttonsHTML += `
                <a class="btn-component style-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(btn.label)}${iconSVG("external", 13)}</a>
              `;
            } else {
              // Anything that is not http(s) (or a link the bot disabled) gets no href at all
              buttonsHTML += `
                <button type="button" class="btn-component style-link disabled" disabled>${escapeHTML(btn.label)}</button>
              `;
            }
            return;
          }

          let styleClass = "style-secondary";
          if (btn.style === 3) styleClass = "style-success"; // Green (Allow Once)
          if (btn.style === 4) styleClass = "style-danger";  // Red (Deny)
          if (btn.style === 1 || btn.style === 2) styleClass = "style-primary"; // Blurple (Allow Session)

          const isDisabled = !!btn.disabled;
          const appId = m.application_id || (m.author ? m.author.id : '');
          buttonCount++;
          if (isDisabled) disabledCount++;
          buttonIds.push(String(btn.custom_id == null ? "" : btn.custom_id));
          buttons.push(btn);
          // The click is routed by the delegated listener on #messagesList (see bindEvents); ids and labels travel as data-* only
          buttonsHTML += `
            <button type="button" class="btn-component ${styleClass} ${isDisabled ? 'disabled' : ''}"
                    ${isDisabled ? 'disabled' : ''}
                    data-act="component" data-app="${escapeHTML(appId)}" data-msg="${escapeHTML(m.id)}"
                    data-custom="${escapeHTML(btn.custom_id)}" data-label="${escapeHTML(btn.label)}">
              ${escapeHTML(btn.label)}
            </button>
          `;
        });
      }
    });
  }

  // Approval Card: a message whose buttons read like an approve / deny prompt renders as one card (head / body / actions)
  let bodyHTML = `<div class="message-content">${formattedContent}</div>${accessoriesHTML}`;
  // An approval answered in this session stays resolved, unless the bot has since swapped in a fresh set of live buttons
  // (only clicks made on an approval card are recorded, see handleComponentClick)
  const answered = state.resolvedInteractions[m.id];
  const resolved = (answered && (disabledCount === buttonCount || buttonIds.includes(answered.customId))) ? answered : null;
  if (buttonCount + linkCount + selectCount > 0 && !resolved && !isApprovalPrompt(buttons)) {
    // Any other component buttons (pagination, menus, link buttons): plain row under the content, always live
    bodyHTML += `<div class="components-row">${buttonsHTML}</div>`;
  } else if (buttonCount > 0 || resolved) {
    let stateKey = "pending";
    let stateText = "等待确认";
    let actionsHTML = buttonsHTML;
    if (resolved) {
      const verdict = interactionVerdict(resolved.label);
      stateKey = verdict.key;
      stateText = verdict.text;
      actionsHTML = approvalResultHTML(resolved);
    } else if (disabledCount === buttonCount) {
      // The bot edited the message and disabled every button
      stateKey = "expired";
      stateText = "已处理";
    }
    bodyHTML = `
      <div class="approval-card" data-message-id="${escapeHTML(m.id)}" data-state="${stateKey}">
        <div class="approval-head">
          <span class="approval-icon">${iconSVG("shield")}</span>
          <span class="approval-title">${authorName} 请求确认</span>
          <span class="approval-state state-${stateKey}">${escapeHTML(stateText)}</span>
        </div>
        <div class="approval-body">${formattedContent}${accessoriesHTML}</div>
        <div class="approval-actions ${resolved ? 'resolved' : ''}">${actionsHTML}</div>
      </div>
    `;
  }

  // Parse Thread Card
  let threadHTML = "";
  if (m.thread) {
    const threadName = escapeHTML(m.thread.name || "查看线程");
    const count = Number(m.thread.message_count) || 0;
    threadHTML = `
      <button type="button" class="message-thread-card" data-act="thread" data-thread-id="${escapeHTML(m.thread.id)}"
              data-thread-name="${escapeHTML(m.thread.name || "线程")}" data-count="${count}">
        <span class="thread-card-left">
          <span class="thread-card-icon">${iconSVG("thread")}</span>
          <span class="thread-card-name">${threadName}</span>
          <span class="thread-card-count">${count} 条回复</span>
        </span>
        <span class="thread-card-arrow">${iconSVG("chevronRight")}</span>
      </button>
    `;
  }

  // Follow-up consecutive message (compact)
  const rowId = escapeHTML(m.id);
  if (isFollowUp) {
    return `
      <div class="message-row follow-up" data-msg-id="${rowId}">
        <span class="follow-up-time">${timeStr}</span>
        <div class="message-body">
          ${bodyHTML}
          ${threadHTML}
        </div>
      </div>
    `;
  }

  // Full message row with avatar
  return `
    <div class="message-row" data-msg-id="${rowId}">
      <div class="message-avatar ${isBot ? 'bot' : ''}" style="${avatarStyle(m.author ? m.author.id : '', isBot)}">${avatarLetter}</div>
      <div class="message-body">
        <div class="message-meta">
          <span class="author-name ${isMe ? 'is-me' : ''}">${authorName}</span>
          ${isBot ? '<span class="bot-tag">智能体</span>' : ''}
          <span class="message-time">${timeStr}</span>
        </div>
        ${bodyHTML}
        ${threadHTML}
      </div>
    </div>
  `;
}

// Message Accessories: attachments and embeds
// Same rules as the rest of the stream: every string is escaped, every href / src must be http(s) (anything else
// gets no link and no image), embed text goes through parseMarkdown. Links and images open in the system browser
// through the native navigation policy (target=_blank). Images load lazily and keep their box size while loading.
const SELECT_MENU_TYPES = [3, 5, 6, 7, 8]; // string, user, role, mentionable, channel select
const MAX_EMBEDS = 4;
const MAX_EMBED_FIELDS = 10;
const MAX_ATTACHMENTS = 10;
const IMAGE_MAX = { w: 400, h: 300 };
const THUMB_MAX = 64;

function safeHttpUrl(url) {
  const s = String(url == null ? "" : url);
  return /^https?:\/\/[^\s/]\S*$/i.test(s) ? s : "";
}

// An image object (attachment, embed image / thumbnail) -> { src, href, width, height }, or null without an http(s) url.
// src prefers Discord's media proxy; the link opens the original.
function mediaRef(media) {
  if (!media || typeof media !== "object") return null;
  const url = safeHttpUrl(media.url);
  const proxy = safeHttpUrl(media.proxy_url);
  if (!url && !proxy) return null;
  return { src: proxy || url, href: url || proxy, width: media.width, height: media.height };
}

// Scale (w, h) down into maxW x maxH, keeping the ratio; null when the size is unknown
function fitBox(w, h, maxW, maxH) {
  w = Number(w);
  h = Number(h);
  if (!(w > 0 && h > 0 && isFinite(w) && isFinite(h))) return null;
  const k = Math.min(1, maxW / w, maxH / h);
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

function imageLinkHTML(ref, alt, max = IMAGE_MAX, linkClass = "msg-image-link", imgClass = "msg-image") {
  const box = fitBox(ref.width, ref.height, max.w, max.h);
  const dims = box ? ` width="${box.w}" height="${box.h}"` : "";
  return `<a class="${linkClass}" href="${escapeHTML(ref.href)}" target="_blank" rel="noopener noreferrer">` +
    `<img class="${imgClass}" src="${escapeHTML(ref.src)}" alt="${escapeHTML(alt)}" loading="lazy" decoding="async"${dims}></a>`;
}

function formatBytes(n) {
  const b = Number(n);
  if (!(b >= 0) || !isFinite(b)) return "";
  if (b < 1024) return `${Math.round(b)} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageAttachment(a) {
  return String(a.content_type || "").toLowerCase().startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(String(a.filename || ""));
}

// Discord embed color: an integer 0xRRGGBB -> "#rrggbb"; anything else -> "" (the CSS default border)
function embedColor(color) {
  return Number.isInteger(color) && color >= 0 && color <= 0xFFFFFF ? "#" + color.toString(16).padStart(6, "0") : "";
}

// Images as one wrapping row, then one compact row per other file (no autoplay: video / audio are file rows too)
function attachmentsHTML(list) {
  const images = [];
  const files = [];
  list.slice(0, MAX_ATTACHMENTS).forEach(a => {
    if (!a || typeof a !== "object") return;
    const name = String(a.filename || "") || "附件";
    const ref = mediaRef(a);
    if (ref && isImageAttachment(a)) {
      images.push(imageLinkHTML(ref, name));
      return;
    }
    const size = formatBytes(a.size);
    const link = ref
      ? `<a class="msg-file-download" href="${escapeHTML(ref.href)}" target="_blank" rel="noopener noreferrer" title="下载" aria-label="下载 ${escapeHTML(name)}">${iconSVG("download", 16)}</a>`
      : "";
    files.push(`<div class="msg-file">` +
      `<span class="msg-file-icon">${iconSVG("file", 20)}</span>` +
      `<span class="msg-file-text"><span class="msg-file-name" title="${escapeHTML(name)}">${escapeHTML(name)}</span>` +
      (size ? `<span class="msg-file-size">${size}</span>` : "") + `</span>` +
      link +
    `</div>`);
  });
  return (images.length ? `<div class="msg-images">${images.join("")}</div>` : "") + files.join("");
}

// One embed as a quiet card: author, title (linked when http(s)), description, fields (2 columns; inline: false spans
// both), thumbnail on the right, image, footer + time. video / provider are ignored. A bare image / GIF link
// (type image / gifv without text) is shown as just the picture.
function embedHTML(e) {
  if (!e || typeof e !== "object") return "";
  const type = String(e.type || "rich");
  const title = String(e.title || "");
  const description = String(e.description || "");
  const fields = (Array.isArray(e.fields) ? e.fields : []).filter(f => f && (f.name || f.value)).slice(0, MAX_EMBED_FIELDS);
  const image = mediaRef(e.image);
  const thumb = mediaRef(e.thumbnail);

  if ((type === "image" || type === "gifv") && !title && !description && fields.length === 0) {
    const pic = image || thumb;
    return pic ? `<div class="msg-images">${imageLinkHTML(pic, "")}</div>` : "";
  }

  const parts = [];
  const authorName = e.author && e.author.name ? String(e.author.name) : "";
  if (authorName) parts.push(`<div class="embed-author">${escapeHTML(authorName)}</div>`);
  if (title) {
    const url = safeHttpUrl(e.url);
    parts.push(url
      ? `<div class="embed-title"><a class="msg-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(title)}</a></div>`
      : `<div class="embed-title">${escapeHTML(title)}</div>`);
  }
  if (description) parts.push(`<div class="embed-description">${parseMarkdown(description)}</div>`);
  if (fields.length > 0) {
    parts.push(`<div class="embed-fields">${fields.map(f =>
      `<div class="embed-field${f.inline === true ? "" : " wide"}">` +
        `<div class="embed-field-name">${escapeHTML(f.name)}</div>` +
        `<div class="embed-field-value">${parseMarkdown(String(f.value == null ? "" : f.value))}</div>` +
      `</div>`).join("")}</div>`);
  }
  const footerText = e.footer && e.footer.text ? String(e.footer.text) : "";
  const time = e.timestamp ? fmtTime(e.timestamp) : "";
  if (parts.length === 0 && !thumb && !image && !footerText && !time) return "";

  const color = embedColor(e.color);
  let html = `<div class="embed"${color ? ` style="border-left-color:${color}"` : ""}>`;
  if (parts.length > 0 || thumb) {
    html += `<div class="embed-top"><div class="embed-main">${parts.join("")}</div>` +
      (thumb ? imageLinkHTML(thumb, "", { w: THUMB_MAX, h: THUMB_MAX }, "embed-thumb-link", "embed-thumb") : "") + `</div>`;
  }
  if (image) html += imageLinkHTML(image, title, IMAGE_MAX, "msg-image-link embed-image-link");
  if (footerText || time) {
    html += `<div class="embed-footer">${escapeHTML(footerText)}${footerText && time ? " · " : ""}${time}</div>`;
  }
  return html + `</div>`;
}

// `lead`: the message has no text above, so the block starts right under the author line
function messageAccessoriesHTML(m, lead) {
  const files = Array.isArray(m.attachments) ? attachmentsHTML(m.attachments) : "";
  const embeds = Array.isArray(m.embeds) ? m.embeds.slice(0, MAX_EMBEDS).map(embedHTML).join("") : "";
  if (!files && !embeds) return "";
  return `<div class="msg-accessories${lead ? " lead" : ""}">${files}${embeds}</div>`;
}

// Markdown Parser
// Security: the raw text is HTML-escaped FIRST and every later step works on the escaped string, so message content
// can never introduce markup. Each piece of generated HTML (code, mentions, links) is parked behind a NUL-delimited
// placeholder until the end, so later rules cannot rewrite the inside of a tag that an earlier rule produced.
function parseMarkdown(text) {
  if (!text) return "";

  const stash = [];
  const hold = (html) => {
    stash.push(html);
    return `\u0000${stash.length - 1}\u0000`;
  };

  // NUL is the placeholder delimiter: it is dropped from everything that comes from outside (the message text and
  // the display names pulled in for mentions) before escaping, so a placeholder can only ever be one made by hold()
  const esc = (value) => escapeHTML(String(value == null ? "" : value).replace(/\u0000/g, ""));
  text = esc(text);

  // Terminal & Code blocks (the captured code is already escaped)
  text = text.replace(/```([a-zA-Z0-9_-]*)[ \t]*\r?\n?([\s\S]*?)```/g, (match, lang, code) => {
    const langLabel = lang ? lang.toLowerCase() : "shell";
    return hold(`<div class="terminal-block-wrapper">` +
      `<div class="terminal-header">` +
        `<span class="terminal-lang">${langLabel}</span>` +
        `<button type="button" class="btn-copy" data-act="copy">${iconSVG("copy", 13)}<span>复制</span></button>` +
      `</div>` +
      `<pre class="code-block"><code>${code.trim()}</code></pre>` +
    `</div>`);
  });

  // Inline code: `code`
  text = text.replace(/`([^`]+)`/g, (match, code) => hold(`<code class="inline-code">${code}</code>`));

  // Role mentions: <@&123456789> (escaped form: &lt;@&amp;123456789&gt;)
  text = text.replace(/&lt;@&amp;(\d+)&gt;/g, (match, id) => {
    const roleName = esc(KNOWN_ROLES[id] || "Role");
    return hold(`<span class="mention-pill role-pill" title="Role ID: ${id}" data-act="mention" data-name="${roleName}">@${roleName}</span>`);
  });

  // User / Bot Mentions: <@123456789> or <@!123456789>
  text = text.replace(/&lt;@!?(\d+)&gt;/g, (match, id) => {
    const user = KNOWN_BOTS[id] || state.knownUsers[id];
    const name = esc(user ? user.name : id);
    return hold(`<span class="mention-pill" title="ID: ${id}" data-act="mention" data-name="${name}">@${name}</span>`);
  });

  // Channel Mentions: <#123456789>
  text = text.replace(/&lt;#(\d+)&gt;/g, (match, id) => {
    return hold(`<span class="mention-pill channel-pill" data-act="channel" data-id="${id}">#${id}</span>`);
  });

  // Autolink: http(s) URLs only. The URL is already-escaped text, so it is safe both as href and as link text.
  // "&amp;" may appear inside a URL; any other entity (an escaped quote or angle bracket) ends it.
  text = text.replace(/https?:\/\/(?:[^\s<&\u0000]|&amp;)+/g, (match) => {
    let url = match;
    let tail = "";
    // Trailing sentence punctuation (and a closing ** of bold) belongs to the prose, not the link;
    // a closing paren stays when the URL opened one
    for (;;) {
      if (url.endsWith("&amp;")) {
        url = url.slice(0, -5);
        tail = "&amp;" + tail;
        continue;
      }
      const last = url[url.length - 1];
      if (".,;:!?*".includes(last) || (last === ")" && !url.includes("("))) {
        url = url.slice(0, -1);
        tail = last + tail;
        continue;
      }
      break;
    }
    if (!/^https?:\/\/[^/]/.test(url)) return match;
    return hold(`<a class="msg-link" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`) + tail;
  });

  // Bold: **text**
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Newlines to <br>
  text = text.replace(/\n/g, '<br>');

  // Put the parked HTML back. An inline-code span may itself hold an earlier code-block placeholder, hence the
  // recursion; a parked piece may only refer to pieces parked before it, which also guarantees termination.
  const restore = (html, limit) => html.replace(/\u0000(\d+)\u0000/g, (match, index) => {
    const i = Number(index);
    return i < limit ? restore(stash[i], i) : "";
  });
  return restore(text, stash.length);
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

// Approval Card State: which chip an answered approval gets, derived from the clicked button's label
// Only button sets that read like an approve / deny prompt get the approval card; everything else stays a plain button row
function isApprovalPrompt(buttons) {
  return (buttons || []).some(b => /允许|拒绝|不允许|确认|取消|allow|deny|approve|reject|confirm|cancel/i.test(String((b && b.label) || "")));
}

function isDenyLabel(label) {
  return /拒绝|不允许|取消|deny|reject|cancel|don.?t\s*allow/i.test(String(label || ""));
}

function interactionVerdict(label) {
  const text = String(label || "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  if (isDenyLabel(text)) return { key: "denied", text: "已拒绝" };
  if (/^(?:always\s+)?allow|^(?:始终|总是)?允许/i.test(text)) {
    const gap = /^[\x00-\x7F]/.test(text) ? " " : "";
    return { key: "approved", text: `已${gap}${text}` };
  }
  return { key: "expired", text: "已处理" };
}

function approvalResultHTML(resolved) {
  const icon = isDenyLabel(resolved.label) ? "x" : "check";
  return `<div class="approval-result">${iconSVG(icon, 14)}<span>${escapeHTML(resolved.label)} · ${fmtTime(resolved.time)}</span></div>`;
}

function applyResolvedState(card, resolved) {
  const verdict = interactionVerdict(resolved.label);
  card.dataset.state = verdict.key;
  const chip = card.querySelector(".approval-state");
  if (chip) {
    chip.className = `approval-state state-${verdict.key}`;
    chip.textContent = verdict.text;
  }
  const actions = card.querySelector(".approval-actions");
  if (actions) {
    actions.classList.add("resolved");
    actions.innerHTML = approvalResultHTML(resolved);
  }
}

// Component Click Handler
window.handleComponentClick = async function(appId, messageId, customId, label, btnEl) {
  if (btnEl && (btnEl.disabled || btnEl.classList.contains("disabled"))) {
    setStatus("该按钮已失效或超时", "amber");
    return;
  }

  // Read before the await: a poll may re-render the list and detach the button while the request is in flight
  const fromApproval = !!(btnEl && btnEl.closest(".approval-card"));
  setStatus(`正在发送: ${label}…`, "amber");
  if (btnEl) btnEl.disabled = true;

  const res = await callNative("sendInteraction", {
    applicationId: appId,
    channelId: state.activeChannel.id,
    messageId: messageId,
    customId: customId
  });

  if (res && res.success) {
    if (fromApproval) {
      setStatus(isDenyLabel(label) ? `已拒绝: ${label}` : `已授权: ${label}`, "green");
      state.resolvedInteractions[messageId] = { label, time: new Date(), customId: String(customId) };
      const card = (btnEl && btnEl.isConnected && btnEl.closest(".approval-card")) ||
                   messagesList.querySelector(`.approval-card[data-message-id="${CSS.escape(String(messageId))}"]`);
      if (card) applyResolvedState(card, state.resolvedInteractions[messageId]);
    } else {
      // Plain component buttons keep the original behavior: no lockout, the reload below re-enables them
      setStatus(`已发送: ${label}`, "green");
    }
    setTimeout(loadMessages, 800);
  } else {
    const errMsg = (res && res.error) ? res.error : "交互未被接受或已过期";
    setStatus(`操作失败: ${errMsg}`, "amber");
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
      <div class="mention-item ${i === 0 ? 'selected' : ''}" data-index="${i}">
        <div class="mention-item-avatar ${u.role ? 'role' : (u.bot ? 'bot' : '')}"${u.role ? '' : ` style="${avatarStyle(u.id, u.bot)}"`}>${escapeHTML((u.name[0] || 'U').toUpperCase())}</div>
        <div class="mention-item-name">${escapeHTML(u.name)}</div>
        ${u.bot ? '<span class="bot-tag">智能体</span>' : ''}
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
  // IME composition (Chinese / Japanese / Korean input): Enter and Space confirm candidates there, they never send.
  // WebKit can deliver the confirming Enter as a plain keydown right after compositionend, hence the short grace period.
  if (e.isComposing || e.keyCode === 229 || state.composing ||
      (e.key === "Enter" && Date.now() - (state.compositionEndedAt || 0) < 150)) return;
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
    setConnectedStatus();
    loadMessages();
  } else {
    setStatus("发送失败", "red");
  }
}

// Dynamic Touch Bar Sync: bots feed the "@ 智能体" popover, members (group DMs only) the "@ 成员" popover
function notifyTouchBar() {
  const { bots, members } = getMentionTargets();

  callNative("updateTouchBar", {
    channelId: state.activeChannel.id,
    channelName: state.activeChannel.name.replace(/^[#⭐👥👤🧵\s]+/u, ""),
    bots,
    members,
    pinned: state.pinned
  });
}

window.switchChannelById = function(channelId) {
  const found = state.pinned.find(p => p.id === channelId) ||
                state.dms.find(d => d.id === channelId) ||
                state.groups.find(g => g.id === channelId); // [WP2 notifications] a clicked notification may come from an unpinned group DM
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

// ===== [WP2 notifications] BEGIN: system notifications & Dock badge =====
// main.m calls window.setAppFocused(true / false) from windowDidBecomeKey: / windowDidResignKey: (and once when the
// page has loaded). maybeNotify() is only called by the polling paths, with messages that just arrived (never for a
// channel load, never for ids already shown): while the window is not key or cannot be seen, a message that mentions
// the current user (or @everyone), any message in a DM / group DM, and any approval prompt posts a system notification
// (bridge `notify`), and the Dock badge (bridge `setBadge`) counts them until the window is focused again.
state.focused = document.hasFocus();
state.unreadNotified = 0;
const NOTIFY_MAX_PER_TICK = 5;
const NOTIFY_BODY_CHARS = 140;

window.setAppFocused = function(f) {
  state.focused = !!f;
  if (f) {
    state.unreadNotified = 0;
    callNative("setBadge", { count: 0 });
  }
};

// Messages of `list` newer than `sinceId` that `prevShown` (the list shown before the re-render) did not contain
function arrivedSince(list, sinceId, prevShown) {
  if (!sinceId || !Array.isArray(list)) return [];
  const shown = new Set((prevShown || []).map(m => m.id));
  return list.filter(m => m && m.id && compareSnowflakes(m.id, sinceId) > 0 && !shown.has(m.id));
}

function maybeNotify(newMessages) {
  if (state.focused && state.visibility !== "hidden") return;
  const me = state.currentUser;
  const ch = state.activeChannel || {};
  const type = notifChannelType(ch);
  const direct = type === 1 || type === 3;
  const wanted = (newMessages || []).filter(m => {
    if (!m || !m.id || !m.author || (me && m.author.id === me.id)) return false;
    const mentioned = !!m.mention_everyone || !!(me && (m.mentions || []).some(u => u && u.id === me.id));
    return mentioned || direct || notifIsApproval(m);
  });
  if (wanted.length === 0) return;
  state.unreadNotified += wanted.length; // the badge counts every one of them; banners are capped per poll tick
  callNative("setBadge", { count: state.unreadNotified });
  const where = direct ? "" : ` · #${String(ch.name || "").replace(/^[#⭐👥👤🧵\s]+/u, "")}`;
  // The newest few, posted oldest first so the latest one ends up on top
  [...wanted].sort((a, b) => compareSnowflakes(b.id, a.id)).slice(0, NOTIFY_MAX_PER_TICK).reverse().forEach(m => {
    callNative("notify", { title: notifUserName(m.author.id, m.author) + where, body: notifBody(m), channelId: ch.id, tag: m.id });
  });
}

// Pinned entries saved by older versions may lack the type: the DM lists have it (same rule as getMentionTargets)
function notifChannelType(ch) {
  if (ch.type !== undefined || ch.isThread) return ch.type;
  const dm = state.groups.find(g => g.id === ch.id) || state.dms.find(d => d.id === ch.id);
  return dm ? dm.type : undefined;
}

function notifIsApproval(m) {
  const buttons = [];
  (m.components || []).forEach(row => (row.components || []).forEach(b => { if (b && b.style !== 5) buttons.push(b); }));
  return buttons.some(b => !b.disabled) && isApprovalPrompt(buttons);
}

// Display name, resolved like the message list does (KNOWN_BOTS, then known users, then the user object itself)
function notifUserName(id, user) {
  const known = KNOWN_BOTS[id] || state.knownUsers[id];
  if (known && known.name) return String(known.name);
  return String((user && (user.global_name || user.username)) || id);
}

// Plain text (never HTML: the native side shows it as is), mention tags turned into @name, cut to 140 characters
function notifBody(m) {
  const mentions = m.mentions || [];
  const text = String(m.content || "")
    .replace(/<@!?(\d+)>/g, (s, id) => "@" + notifUserName(id, mentions.find(u => u && u.id === id)))
    .replace(/<@&(\d+)>/g, (s, id) => "@" + (KNOWN_ROLES[id] || "Role"))
    .replace(/<#(\d+)>/g, (s, id) => "#" + notifChannelName(id))
    .replace(/<a?:(\w+):\d+>/g, ":$1:")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return notifIsApproval(m) ? "[审批请求]" : "[附件]";
  const chars = Array.from(text);
  return chars.length > NOTIFY_BODY_CHARS ? chars.slice(0, NOTIFY_BODY_CHARS).join("") + "…" : text;
}

function notifChannelName(id) {
  for (const sId in state.channelsCache) {
    const c = state.channelsCache[sId].find(x => x.id === id);
    if (c) return c.name.replace(/^[#⭐👥👤🧵\s]+/u, "");
  }
  return id;
}
// ===== [WP2 notifications] END =====

// Utilities
// Local wall-clock HH:MM for an ISO timestamp (or a Date)
function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function escapeHTML(str) {
  return String(str || "").replace(/[&<>'"]/g, tag => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[tag] || tag));
}

function escapeRegExp(str) {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Launch
init();
