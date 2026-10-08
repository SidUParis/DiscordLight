# DiscordLight 项目交接文档 (Handover Document)

> **文档版本**: v1.1.0  
> **更新时间**: 2026-10-08  
> **仓库地址**: [https://github.com/SidUParis/DiscordLight](https://github.com/SidUParis/DiscordLight)  
> **作者/维护团队**: SidUParis & AI Pair Programming  

---

## 1. 项目简介与背景 (Project Overview)

### 1.1 为什么做 DiscordLight？
- **传统客户端痛点**：官方 Discord 客户端基于 Electron 构建，常驻内存高达 800MB ~ 1.5GB，待机状态仍占用 5%~15% 的 CPU，MacBook 发热严重且电池消耗极快；对于深度使用 AI Agent / Bot 的开发者而言，界面充斥大量冗余社交功能，而针对 AI 交互的痛点（如 Touch Bar 艾特被输入法顶替、交互式按钮只发文字报错、线程管理混乱等）未能得到解决。
- **项目定位**：面向 AI 开发者与 Agent 工作流的**超轻量、高性能、原生 macOS** 客户端。
- **核心成果**：
  - **内存常驻 < 80 MB**（仅为 Electron 版的 1/15）。
  - **空闲 CPU 占用 0%**，纯本地直连，极佳电池续航。
  - **原生 Touch Bar 深度定制**：采用 Popover 架构，彻底解决输入法候选词挤占 Touch Bar 的系统级冲突。
  - **真实的交互式组件响应**：完整支持 AI Bot 的 `Allow Session`、`Allow Once` 等组件交互（发送 Discord 原生 Interaction Payload，而非文字回退）。
  - **全局搜索与群聊分类**：支持秒级检索多人群聊、成员、频道与私信，`⌘K` 直达搜索。
  - **Graphite Console 界面**：原生 macOS 深色外观，全套单色描边图标（界面中不使用 emoji）。
    智能体消息是一等公民：审批请求渲染为独立的审批卡片，智能体与人类用头像形状区分。

---

## 2. 代码仓库与文件结构 (Repository Structure)

```
DiscordLight/
├── Makefile                 # 自动化构建与系统安装脚本
├── build.sh                 # 快捷构建辅助脚本
├── LICENSE                  # MIT 开源许可证
├── README.md                # 英文说明文档
├── README_CN.md             # 中文说明文档
├── HANDOVER.md              # 本交接文档
├── assets/
│   ├── AppIcon.icns         # 原生应用图标（多分辨率圆角 icns）
│   └── touchbar_icon.png    # NSTouchBar 专用适配单色图标
├── src/
│   ├── main.m               # Objective-C 原生宿主：窗口、WebKit Bridge、导航策略、TouchBar
│   └── Info.plist           # macOS Bundle 元数据 (BundleID, 权限, 架构等)
└── web/
    ├── index.html           # 前端 UI 骨架：侧栏（搜索 + 三个可折叠分组）、聊天区、输入框
    ├── style.css            # Graphite Console 主题（原生 macOS 深色）
    └── app.js               # 前端核心业务逻辑（API 请求、组件交互、全局搜索、TouchBar 桥接）
```

### 关键路径说明
| 路径 | 说明 |
| :--- | :--- |
| **本地源码目录** | `/Users/xu/Developer/projects/DiscordLight/` |
| **系统安装目录** | `/Applications/DiscordLight.app` |
| **本地用户配置** | `~/.config/discordlight/config.json` |

`config.json` 目前包含的键：`token`、`pinned_channels`（关注列表）、`last_channel_id`、`ui`（界面状态，见 3.8）。

---

## 3. 技术架构与核心模块剖析 (Architecture & Deep Dive)

### 3.1 原生 Cocoa 宿主 (`src/main.m`)
- **WebKit 嵌入**：使用 `WKWebView` 加载本地 `file://.../web/index.html`。
- **双向通信 (Native Bridge)**：
  - **前端 -> 原生**：通过 `window.webkit.messageHandlers.discordBridge.postMessage({ action, callback, ... })` 调用（前端统一封装在 `callNative(action, data)`）。
  - **原生 -> 前端**：原生执行完毕后，通过 `evaluateJavaScript:` 回调前端指定的 `callback`（`respondToJS:data:`，数据经 JSON 序列化）。
- **原生 API 封装**：
  - `fetchCurrentUser` / `fetchGuilds` / `fetchGuildChannels` / `fetchDMs` / `fetchMessages` / `sendMessage`。
  - `sendInteraction`：向 Discord `/interactions` 端点发送原生交互式按钮组件点击。
  - `getConfig`：返回 `config.json` 的内容，**但不含 `token`**，只附带 `hasToken` 布尔值（见 4.3）。
  - `saveConfig`：接受 `token` / `pinned_channels` / `last_channel_id` / `ui` 四个键，写回 `config.json`。
  - `updateTouchBar`：接收 `{channelId, channelName, bots, pinned}` 并重建 Touch Bar。
- **原生调用前端的入口**（Touch Bar 按钮通过 `evaluateJavaScript:` 调用，改名即失效）：
  `window.touchBarAction('logo')`、`window.insertMentionFromTouchBar(name)`、`window.switchChannelById(id)`、`window.loadMessages()`。
- **开发者工具**：
  - 在 `main.m` 中开启了 `developerExtrasEnabled = YES`，在运行界面**右键即可选择「检查元素（Inspect Element）」**调出 WebKit Safari 开发者工具，极大降低前端与网络调试成本。

### 3.2 深度优化的 NSTouchBar 架构 (`src/main.m`)
#### 💡 解决了什么顽疾？
在 macOS 系统中，一旦用户在输入框打字，macOS 会强行将 Touch Bar 替换为系统的输入法候选字栏（Candidate List），导致所有自定义按钮瞬间被顶走，无法同时选词和点艾特。

#### 💡 解决方案：
1. **采用 `NSPopoverTouchBarItem`**：
   - 在 Touch Bar 常驻区注册 `@ 智能体`（Identifier: `com.discordlight.touchbar.agents_popover`）和 `# 频道`（Identifier: `com.discordlight.touchbar.channels_popover`）。
   - 即使输入法弹出候选词，Popover 气泡按钮依然常驻或只需轻触即可展开二级列表。
2. **动态感知与双向同步**：
   - 前端切换频道或接收到新消息时，分析当前群成员及 Bot 列表，调用 `notifyTouchBar()`（bridge action: `updateTouchBar`）传输给原生层。
   - 原生层动态重绘 Touch Bar 二级内容，确保“看什么频道，Touch Bar 就显示谁”。
   - **契约**：payload 为 `{channelId, channelName, bots, pinned}`；原生只读取 `pinned[].name` / `pinned[].id` 和 `bots[].name`。改前端时不要动这几个字段。

### 3.3 交互式组件（Component Interactions）机制 (`web/app.js`)
- **问题**：在很多第三方轻量客户端中，当 AI Agent（如 Hermes、AutoGPT）弹出 `[Allow Once]` / `[Allow Session]` 按钮时，点击通常只往输入框发一句话，导致 Bot 报 Invalid Interaction。
- **解决方案**：
  - 前端解析 Discord 消息结构中的 `components` 数组（`type: 1` 行，`type: 2` 按钮）。
  - 按钮渲染为 `<button data-act="component" data-app data-msg data-custom data-label>`，点击由 `#messagesList` 上的**一个委托监听器**分发给 `handleComponentClick(appId, messageId, customId, label, btnEl)`（不使用内联 `onclick`，见 4.3）。
  - 构造标准的 Discord Type 3 Component Interaction Payload，调用原生的 `sendInteraction` 接口直连 API，完美触发 Agent 后续任务流。
  - 按钮组如果是“批准 / 拒绝”类提示，会渲染成审批卡片（见 3.6）；其余按钮保持普通按钮行。
  - **链接按钮（style 5）不是交互**：它带 `url`、没有 `custom_id`，渲染为普通链接而不是 `data-act="component"` 按钮，永远不会调用 `sendInteraction`（见 3.6）。

### 3.4 全局搜索与多人群聊分组 (`web/app.js`)
- **多人群聊模型**：Discord API `/users/@me/channels` 会同时返回普通私聊（`type: 1`）和多人群聊（Group DM，`type: 3`）。
- **优化逻辑**：
  1. 会话拉取后，根据 `BigInt(last_message_id)` 严格按最新活跃时间降序排序。
  2. 多人群聊排在侧栏 **群聊与私信** 分组的最前面，显示群名、成员名字副标题以及人数角标（如 `5人`），其后是一对一私信。
  3. 全局搜索支持模糊匹配群名、群成员昵称（`global_name`）、用户名（`username`）及服务器频道；搜索时侧栏的三个分组被扁平的分类结果替换（多人群聊 / 常用关注 / 服务器频道 / 私信好友）。

### 3.5 UI 设计规范 (Graphite Console)
所有颜色、圆角、字体都是 `web/style.css` 顶部 `:root` 里的 CSS 变量，新增样式一律引用变量，不要写死色值。

**色彩 Token**

| 用途 | 变量 | 值 |
| :--- | :--- | :--- |
| 侧栏底色 | `--bg-sidebar` | `#232326` |
| 内容区底色 | `--bg-content` | `#1B1B1D` |
| 浮起表面（卡片、输入框、浮层） | `--bg-raised` | `#28282B` |
| 下沉表面（搜索框、代码块） | `--bg-inset` | `#151517` |
| 发丝线 | `--line` / `--line-strong` | `rgba(255,255,255,.08)` / `rgba(255,255,255,.14)` |
| 主文字 / 次文字 | `--text-1` / `--text-2` | `#ECECEE` / `#A1A1A8` |
| 强调色 | `--accent` | `#0A84FF` |
| 强调色浅底 / 强调色文字 | `--accent-tint` / `--accent-text` | `rgba(10,132,255,.16)` / `#8EC5FF` |
| 成功 | `--ok` | `#30D158` |
| 危险（文字用 `--danger-text`） | `--danger` / `--danger-text` | `#FF453A` / `#FF7B72` |
| 警示 / 等待 | `--warn` | `#FFD60A` |

**字号阶梯**（最小字号 11px，不要再往下加）

| 角色 | 规格 |
| :--- | :--- |
| 频道标题 | 14px / 600 |
| 消息正文 | 14px，行高 1.55 |
| 侧栏行 | 13px（选中行 500） |
| 作者名 | 13px / 600 |
| 说明文字（时间、角标、分组标题） | 11px |
| 代码 | 12.5px 等宽（`--font-mono`） |

**圆角**：6px 控件（按钮、侧栏行、输入框）/ 8px 代码块与智能体头像 / 10px 卡片与浮层 / 12px 窗口级（引导弹窗）。

**图标规则**：只用单色描边 SVG（`viewBox 0 0 24 24`、`stroke-width 1.75`、继承 `currentColor`）。图形集中在 `app.js` 的 `ICONS` 表里，通过 `iconSVG(name, size)` 输出；新增图标就往 `ICONS` 里加一条。**界面输出中禁止使用 emoji**（唯一允许出现 emoji 的地方是清洗旧数据的正则，见 3.8）。

**头像规则**：人类是圆形，智能体是圆角方形（`.message-avatar.bot`）；底色由作者 id 的哈希从 `AVATAR_PALETTE` 中确定性选取（`avatarStyle(id, isBot)`），同一个人永远同一个颜色。

**“智能体”标签**：作者名旁的描边小标签写“智能体”，取代旧版的“BOT”。

**连接状态**：在侧栏底部用户名下方的 `#statusIndicator`（一个状态点 + 一行文字），由 `setStatus(text, "green" | "amber" | "red")` 更新。聊天区顶栏不再显示状态。

### 3.6 审批卡片 (Approval Card)
智能体请求执行命令 / 访问资源时会发一条带按钮的消息。这类消息渲染成一张卡片，而不是散落的按钮行。

- **触发条件 `isApprovalPrompt(buttons)`**：消息里任意一个按钮的 label 命中 `允许 | 拒绝 | 不允许 | 确认 | 取消 | allow | deny | approve | reject | confirm | cancel`（不区分大小写）即视为审批提示。这是启发式规则：换了新的 Bot 文案不出卡片时，先来这里补关键词。
- **卡片结构**：
  - 头部 `.approval-head`：盾牌图标 + “{作者} 请求确认” + 状态标签 `.approval-state`。
  - 正文 `.approval-body`：消息内容（经 `parseMarkdown`，代码块照常渲染）。
  - 操作区 `.approval-actions`：按钮。Discord style 3（绿）渲染为唯一的实心强调色按钮；style 1/2 为中性描边按钮；style 4（红）为描边危险按钮并靠右。
- **状态**（`data-state` + 状态标签文字）：
  - `pending` “等待确认”：按钮可点。
  - `approved` “已 Allow Once” / “已允许…”：本次会话里点了 label 以 `allow` / `允许` 开头的按钮（`interactionVerdict(label)` 负责把 label 换算成状态）。
  - `denied` “已拒绝”：点了拒绝类按钮。判定函数 `isDenyLabel(label)`，命中 `拒绝 | 不允许 | 取消 | deny | reject | cancel | don't allow`。
  - `expired` “已处理”：Bot 自己把所有按钮置为 disabled（在别处处理过，或已超时）；或者点击的 label 既不是允许类也不是拒绝类（如 `Approve`、`确认`）。
  - 已回答的卡片，操作区收起为一行结果：对勾 / 叉 + “{label} · HH:MM”。
- **`state.resolvedInteractions`**：`messageId -> { label, time, customId }`。只记录**在审批卡片上**点击成功的交互，只存在内存里（重启后丢失，届时以 Bot 是否禁用按钮为准）。轮询重绘时用它恢复卡片状态；如果 Bot 之后换上了一组新的可用按钮（原 `customId` 不在其中），记录失效，卡片回到 `pending`。
- **普通按钮行不受影响**：翻页、菜单这类不命中关键词的按钮，仍渲染为正文下方的 `.components-row`，始终可点、点击后不锁定，800ms 后重新拉取消息，与改版前行为一致。
- **链接按钮（Discord style 5）**：渲染为 `<a class="btn-component style-link" href target="_blank" rel="noopener noreferrer">`，label 后带 `external` 图标，外观与中性描边按钮相同，点击后由原生导航策略交给系统浏览器（见 4.3 第 5 条）。只接受 `http://` / `https://` 开头的 `url`；其他协议（如 `javascript:`）或被 Bot 置为 disabled 的链接按钮，渲染为不带 `href` 的禁用按钮。链接按钮没有 `data-act`，委托监听器不会把它当作交互；它也**不计入** `isApprovalPrompt` 的关键词判定和“全部按钮已禁用”的统计（`linkCount` 与 `buttonCount` 分开计数），所以一个写着“Cancel”的链接按钮不会让消息变成审批卡片。只有链接按钮的消息走普通按钮行；与审批按钮同时出现时，链接按钮跟着显示在卡片操作区，卡片回答后随操作区一起收起。
- **状态栏文案**（`#statusIndicator`）：点击后“正在发送: {label}…”；审批卡片成功为“已授权: {label}”或“已拒绝: {label}”；普通按钮成功为“已发送: {label}”；失败为“操作失败: {原因}”并恢复按钮。已禁用的按钮带 `disabled` 属性且 CSS 为 `pointer-events: none`，正常情况下点不到；`handleComponentClick` 里“该按钮已失效或超时”只是兜底分支。

### 3.7 窗口 Chrome (`src/main.m`)
- 窗口样式带 `NSWindowStyleMaskFullSizeContentView`，并设置 `titlebarAppearsTransparent = YES` 与 `titleVisibility = NSWindowTitleHidden`：网页内容铺满整个窗口，红绿灯按钮直接悬浮在侧栏左上角。
- **`DLDragStripView`**：一条 240×38 的透明原生视图，盖在侧栏顶部（是 `contentView` 的子视图，叠在 `WKWebView` 之上）。原因是标题栏没有了，而 `WKWebView` 会吞掉所有 mouseDown，窗口将无法拖动。该视图把按下事件交还给窗口（`performWindowDragWithEvent:`），双击执行缩放（`performZoom:`），行为与真标题栏一致。
- **必须保持同步的两个数字**：`main.m` 里拖拽条的 `240 × 38`，与 `style.css` 里 `.sidebar { width: 240px }`、`.sidebar-header { padding-top: 38px }`。这 38px 的留白带里不能放任何可交互元素（会被拖拽条挡住点不到）。

### 3.8 侧栏结构 v2 (`web/index.html` + `web/app.js`)
侧栏自上而下：红绿灯留白 → 搜索框（右侧带 `⌘K` 提示，输入内容后提示隐藏）→ **一个**滚动列表，里面是三个可折叠分组，同时可见，不再有标签页。

| 分组 key | 标题 | 内容 |
| :--- | :--- | :--- |
| `pinned` | 常用关注 | `state.pinned`，每行右侧带服务器标签，行下嵌套该频道的活跃线程 |
| `dms` | 群聊与私信 | 先 `state.groups` 后 `state.dms`（均已按活跃度排序） |
| `servers` | 服务器 | 第一行是服务器选择器 `#serverSelect`，其下是所选服务器的文字频道（带嵌套线程，无服务器标签）。没有任何服务器时整个分组隐藏 |

- **渲染**：`renderChannelList()` 每次整体重绘。搜索框有内容时走“全局搜索模式”（扁平结果），否则用 `renderSection(key, label, count)` 生成三个分组，行由 `renderChannelItem(item, icon, allowThreads, showServerTag, container)` 生成。`#serverSelect` 在 `index.html` 里只有一个实例，每次重绘时被移动进“服务器”分组的第一行。
- **折叠**：分组标题是 `<button class="section-toggle" aria-expanded>`，点击调用 `setSectionCollapsed(key, collapsed)`，只隐藏行、不隐藏标题。折叠的 key 存在 `state.ui.collapsed`，通过 `saveConfig({ ui })` 写入 `config.json` 的 `ui.collapsed`，启动时在 `init()` 里恢复。
- **自动展开**：`switchChannel` / `openThread` 会调用 `revealActiveChannel()`：如果所有包含当前频道的分组都被折叠，展开其中第一个；如果频道属于另一个服务器（例如从搜索结果或 Touch Bar 打开），服务器选择器会切到那个服务器。
- **服务器频道的加载**：`ensureServerChannels(serverId)` 懒加载并缓存到 `state.channelsCache`，并发调用共享同一个请求。启动时后台预取前 6 个服务器的频道（供全局搜索用）。加载中的占位行只出现在“服务器”分组内部，不会清空整个列表。`renderChannelList` 因此是 `async` 的，用 `channelListRenderSeq` 丢弃过期的重绘。
- **键盘**：
  - `⌘K` / `⌘F`：聚焦搜索框并全选。**只认 Command**（且不能同时按 Ctrl / Option / Shift）：`Ctrl+K`（删除到行尾）和 `Ctrl+F`（光标前移一格）是 Cocoa 文本编辑的系统快捷键，必须留给输入框。引导弹窗打开时该快捷键不生效。
  - 搜索框内 `Esc`：有内容则清空；已为空则失焦并把焦点交回消息输入框。
  - 搜索框内 `Enter`：打开第一条搜索结果并清空搜索（输入法组字期间的回车不触发）。
- **旧版关注数据的兼容**：早期版本把 emoji 存进了配置（`icon: "👥"`、名字前缀 `🧵` / `⭐` 等）。现在的处理：
  - `legacyIconName(icon)` 把旧的 emoji 值和新的字符串值统一映射为图标名。
  - 显示名称时用带 `u` 标志的正则 `/^[#⭐👥👤🧵\s]+/u` 剥掉旧前缀（必须带 `u`，否则会把 emoji 的代理对切成半个字符）；服务器名前的旧图标由 `cleanServerName` 处理。
  - 新关注的条目保存 `icon: "channel" | "group" | "dm" | "thread"`，不再写入 emoji。旧数据不需要迁移。

---

## 4. 安全规范与凭据管理 (Security Protocols)

> **最高原则**：严禁将任何 Token、Cookie、Session 或私人账号凭证提交到 Git 仓库中。

### 4.1 Token 发现链条
客户端遵循严格的本地动态凭据查找顺序：
1. **系统环境变量**：优先读取 `DISCORD_TOKEN`。
2. **本地隔离配置文件**：读取 `~/.config/discordlight/config.json`（该文件位于系统用户目录下，与 Git 仓库完全隔离，已被 `.gitignore` 规避）。
3. **交互式首次引导弹窗**：如均未配置，应用启动时会优雅弹出原生配置引导框，由用户手动输入并安全写入本地 `config.json`。

### 4.2 提交流程安全守则
在执行 `git commit` 和 `git push` 前，请务必运行：
```bash
git diff | grep -iE 'token|secret|password|bearer|mfa'
```
确保差异中无硬编码字符串。

### 4.3 前端注入防护
> **v1.1.0 之前这里存在真实漏洞**：消息内容未经转义直接写入 `innerHTML`，多处内联 `onclick="..."` 把 `custom_id`、线程名、昵称拼进 JS 字符串；`getConfig` 还会把 token 原样返回给网页。也就是说，一条精心构造的消息就可能在 WebView 里执行脚本，进而读取 token、以用户身份发消息。v1.1.0 已全部修复，下面几条是今后改代码时必须守住的规则。

1. **先转义，再做 Markdown**：`parseMarkdown(text)` 第一步就是 `escapeHTML`，之后所有规则都在转义后的文本上匹配（所以提及的写法是 `&lt;@123&gt;`、`&lt;@&amp;123&gt;`、`&lt;#123&gt;`）。解析器自己生成的 HTML（代码块、行内代码、提及、链接）先用 NUL 分隔的占位符暂存、最后再放回，这样后面的规则不会改写前面生成的标签内部。新增 Markdown 规则时沿用同一模式：只在转义后的文本上匹配，生成的 HTML 交给 `hold()`。
2. **不写拼接数据的内联事件**：由数据生成的标记只带 `data-act` 和 `data-*` 属性（值一律过 `escapeHTML`），点击由 `#messagesList` 和 `#mentionItems` 上各一个委托监听器分发。`data-act` 取值：`component` / `thread` / `mention` / `channel` / `copy`（链接按钮和自动链接是普通 `<a>`，不带 `data-act`）。全仓库唯一保留的内联 `onclick` 是 `index.html` 里不带任何数据的 `returnToParentChannel()`。
3. **写入 `innerHTML` 的任何外部字符串都要 `escapeHTML`**（名字、标题、label、id、副标题……）。能用 `innerText` / `textContent` 的地方优先用它。
4. **`getConfig` 永不返回 `token`**：原生在响应前 `removeObjectForKey:@"token"`，前端只拿到 `hasToken`。token 只在原生层拼进请求头。
5. **导航策略**（`main.m`）：`decidePolicyForNavigationAction` 只放行 `file:` 和 `about:blank`；`http` / `https` / `mailto` 交给系统默认应用（`NSWorkspace openURL:`）并取消站内导航；其余协议一律取消。消息里的链接都带 `target="_blank"`：点击时 WebKit 先以“新窗口”动作询问同一个 `decidePolicyForNavigationAction`（此时已交给系统浏览器并取消）；`createWebViewWithConfiguration:…`（`WKUIDelegate`）兜住 `window.open()` 这类不经过上述回调的路径，同样只把 http(s) 交给系统浏览器并返回 `nil`，永不创建第二个 WebView。带 bridge 的 WebView 因此永远只显示本地页面。
6. **自动链接规则**：只识别 `http://` / `https://`。URL 取自已转义的文本，同时用作 `href` 和链接文字；URL 内允许出现 `&amp;`，遇到其他实体（引号、尖括号）即结束；结尾的 `.,;:!?*` 和未配对的 `)` 不算进链接。代码块、行内代码、提及内部的 URL 不会变成链接。输出固定为 `<a class="msg-link" target="_blank" rel="noopener noreferrer">`。
7. **原生拼 JS 时同样要转义**：Touch Bar 按钮调用 `insertMentionFromTouchBar` / `switchChannelById` 时，参数经 `jsStringLiteral:`（JSON 编码）再拼进脚本，Bot 名字里的引号、反斜杠、换行无法逃出字符串。`respondToJS:data:` 把 JSON 拼进 `window.<callback>(…)`：`callback` 只允许字母、数字和下划线（否则直接丢弃这次回调），JSON 文本和 `jsStringLiteral:` 的结果都再过一遍 `JSSafeJSON()`，把 `NSJSONSerialization` 不转义的 U+2028 / U+2029 换成 `\u2028` / `\u2029`（旧版 WebKit 会把它们当成换行，导致整段脚本语法错误）。
8. **链接按钮的 `url` 只接受 http(s)**：见 3.6。新增任何会生成 `href` 的地方，都要先校验协议，再 `escapeHTML`。

**调试用 eval 入口默认关闭**：`main.m` 里的 `handleTestNotification:` 监听分布式通知 `com.discordlight.test`，收到 `eval:` 前缀的内容会直接在 WebView 里执行（`snapshot` 则把截图写到 `/tmp/discordlight_webview_snapshot.png`）。这是早期的自动化测试入口。分布式通知本机任意进程都能发送，而这个 WebView 握着 bridge（能以用户身份发消息、能通过 `saveConfig` 改写配置），所以从 v1.1.0 起，**只有在启动时设置了非空的环境变量 `DISCORDLIGHT_DEBUG`，才会注册这个监听**；正常启动的应用里这个入口不存在。用法见 5.3。

**已知遗留项**（未在 v1.1.0 处理，接手后请评估）：`developerExtrasEnabled` 在发布构建中也是开启的（右键可打开 Web Inspector）；bridge action `takeSnapshot` 未加开关，会把 WebView 截图写到固定路径 `/tmp/discordlight_webview_snapshot.png`（只能由页面自身的 JS 触发）。建议把这两项也收进 `DISCORDLIGHT_DEBUG` 或 Debug 构建开关。

---

## 5. 编译、安装与日常调试 (Build & Operations)

### 5.1 环境要求
- 操作系统：macOS 10.15 及以上（支持 Apple Silicon 与 Intel）。
- 编译工具：Xcode Command Line Tools（自带 `clang`）。无需安装 Xcode 庞大完整包。

### 5.2 常用命令
```bash
# 1. 编译 App (输出到 ./DiscordLight.app)
make build

# 2. 编译并安装到 /Applications
make install

# 3. 清理编译产物
make clean

# 4. 直接运行已安装的应用
open /Applications/DiscordLight.app
```

### 5.3 调试方法
1. **控制台查看**：
   在应用中任意空白区域**右键 -> 检查元素**，即可打开 WebKit Web Inspector 查看 Console 日志、DOM 节点、Network 请求。
2. **热重载测试**：
   修改 `web/` 下的 HTML/CSS/JS 后，可直接在开发者工具中按 `Cmd + R` 刷新，无需重新编译 Objective-C 宿主。
   **`src/main.m` 的改动不会热重载**，必须 `make build && make install` 后重新打开应用（窗口样式、拖拽条、导航策略、`getConfig` / `saveConfig` 的字段都属于这一类）。
3. **无头冒烟测试（建议）**：
   前端只通过 `window.webkit.messageHandlers.discordBridge` 与原生通信，所以可以在普通浏览器里把它替换掉来测试，不需要启动 App，也不需要真实 token。做法是用 Playwright 打开 `web/index.html`，在页面脚本执行前注入一个假的 `discordBridge`：`postMessage(msg)` 里按 `msg.action` 返回固定的假数据，再调用 `window[msg.callback](response)`，同时把每次调用记进一个数组。之后就能断言界面和 bridge 调用，例如：含 `<img onerror>` 的消息只显示为文字、带引号的线程名和 `custom_id` 原样传回、折叠分组后收到 `saveConfig({ui})`、`updateTouchBar` 的 payload 字段不变。v1.1.0 的改动就是这样验证的；建议把这套脚本收进仓库的 `tests/` 目录。
4. **调试 eval 入口（需要 `DISCORDLIGHT_DEBUG`）**：
   分布式通知 `com.discordlight.test` 的监听只在带环境变量启动时才注册（原因见 4.3）。先完全退出应用，再从终端启动：
   ```bash
   DISCORDLIGHT_DEBUG=1 open /Applications/DiscordLight.app
   # 或者先 export DISCORDLIGHT_DEBUG=1，再 open
   ```
   `open` 会把当前 shell 的环境变量带给新启动的应用；如果应用已经在运行，`open` 只会激活旧实例，变量不会生效。从 Finder / Dock / Spotlight 启动的实例没有这个变量，入口不存在。启用后，向 `NSDistributedNotificationCenter` 发送名为 `com.discordlight.test` 的通知：`object` 为 `eval:<JS 代码>` 时在 WebView 里执行这段代码，为 `snapshot` 时把截图写到 `/tmp/discordlight_webview_snapshot.png`。日常使用不要带这个变量启动。
5. **提交前的静态自检**：
   ```bash
   node --check web/app.js
   grep -n 'onclick' web/app.js web/index.html   # 只应剩下 index.html 里的 returnToParentChannel()
   ```

---

## 6. 后续演进建议与待办事项 (Roadmap & Backlog)

为后续接手该项目的工程师提供以下规划参考：

1. **Gateway WebSocket 长连接支持**
   - 当前采用高频轮询模式；后续可在 `src/main.m` 或 `web/app.js` 中接入 Discord Gateway v10 WebSocket，支持真正的实时消息秒级推送与离线重连。
2. **通知与声音增强**
   - 接入 macOS 原生 `NSUserNotificationCenter` / `UNUserNotificationCenter`，当用户被 `@` 或有 Agent 回复时弹出系统级角标与气泡通知。
3. **下拉选择与 Modal 组件支持**
   - 当前已支持按钮（Button Components），后续可扩展支持 Select Menu（下拉选框）以及 Modal 文本输入弹窗。
4. **多账号快速切换**
   - 允许在配置中保存多个 Token，在设置菜单中实现一键无缝热切换。
5. **浅色模式 / 跟随系统外观**
   - 颜色已全部走 CSS 变量，补一套浅色取值加 `prefers-color-scheme` 即可；原生侧目前把窗口外观固定为 Dark Aqua，需要一并放开。
6. **系统强调色**
   - 通过 bridge 把 `NSColor.controlAccentColor` 传给前端，覆盖 `--accent` 系列变量，让强调色跟随系统设置。
7. **侧栏毛玻璃**
   - 侧栏下方垫 `NSVisualEffectView`，并把 `WKWebView` 设为透明背景，得到原生的 vibrancy 效果。
8. **Embeds 渲染**
   - 目前只渲染 `content`。如果 Bot 把要执行的命令放在 embed 里，审批卡片的正文会是空的，用户看不到自己在批准什么。这一项优先级较高。
9. **未读标记**
   - 侧栏的未读点 / 未读计数依赖实时事件，需要先完成第 1 项 Gateway。
10. **时区与日期**
    - 时间现在按本地时区显示（`fmtTime`），但只有 `HH:MM`；跨天的消息还没有日期分隔线。
11. **应用图标**
    - 当前 App 图标使用了 Discord 的 Clyde 标志，存在商标风险，建议换成原创图标。引导弹窗里的闪电标记可以作为基础图形。

---

## 7. 常见问题排查 (Troubleshooting FAQ)

- **Q: 为什么输入某个名字找不到好友或机器人？**  
  A: 部分 Bot 在 Discord 中使用数字或特殊别名（如纯数字 ID、无 `global_name` 的机器账户），输入框的 `@` 补全同时支持按显示名、`username`、`id` 以及 `KNOWN_BOTS` 里登记的别名检索；侧栏全局搜索按群名、成员显示名（`global_name`）、`username`、频道名和服务器名检索（不按 id）。确保该 Bot 曾在当前频道的消息或私信列表中出现过。
- **Q: 为什么 Touch Bar 没有显示？**  
  A: 确保在配备物理 Touch Bar 的 MacBook Pro 机型上运行，或在系统设置 -> 键盘 -> 触控栏显示设置为“App 控制”。若在虚拟机/无 Touch Bar 设备上，Touch Bar 逻辑将安全静默跳过，输入框下方的智能体快捷按钮仍可正常工作。
- **Q: 重新拉取代码后配置丢了吗？**  
  A: 不会。所有配置均存放在用户家目录 `~/.config/discordlight/config.json`，与 Git 代码目录解耦。
- **Q: 为什么旧版关注的频道名前面有图标残留 / 图标不对？**  
  A: 旧版把 emoji 写进了 `pinned_channels`（`icon` 字段和名字前缀）。新版在显示时会自动剥掉这些前缀并换成描边图标（见 3.8 的“旧版关注数据的兼容”），正常情况下不需要手动处理。如果某一条仍然不对，取消关注再重新关注一次，它会按新格式（`icon: "channel" | "group" | "dm" | "thread"`）保存。改动相关正则时务必保留 `u` 标志。
- **Q: 为什么窗口拖不动 / 拖拽条在哪？**  
  A: 标题栏是隐藏的，可拖动区域是侧栏最上方 240×38 的那一条（红绿灯所在的一带，搜索框上方），双击它可以缩放窗口。聊天区顶栏不能拖动。如果这一条也拖不动，检查 `main.m` 里的 `DLDragStripView` 是否仍加在 `WKWebView` 之上，以及它的尺寸是否与 CSS 的 38px 留白一致（见 3.7）。
- **Q: 点击消息里的链接没有在应用内打开？**  
  A: 这是有意为之。带 bridge 的 WebView 不加载任何外部页面，http(s) 链接一律交给系统浏览器（见 4.3）。

---

## 8. 变更记录 (Changelog)

### v1.1.0 (2026-10-08)
- **Pass 1：Graphite Console 视觉改版**。原生 macOS 深色主题与设计 Token；全套单色描边图标（移除界面中的 emoji）；人类圆形 / 智能体圆角方形头像；“智能体”标签；审批卡片；连接状态移到侧栏底部；隐藏标题栏并加入原生拖拽条。
- **Pass 2：侧栏结构 v2**。三个标签页换成一个列表里的三个可折叠分组（常用关注 / 群聊与私信 / 服务器），折叠状态持久化；服务器选择器移入“服务器”分组；`⌘K` / `⌘F` 聚焦搜索（只认 Command，`Ctrl+K` / `Ctrl+F` 留给文本编辑），搜索框支持 `Esc` / `Enter`。
- **安全修复**。消息内容先转义再做 Markdown；移除所有拼接数据的内联 `onclick`，改为 `data-act` 委托监听；`getConfig` 不再返回 token；新增导航策略，外部链接交给系统浏览器；Touch Bar 调用前端时对参数做 JSON 编码；新增安全的 URL 自动链接；Discord 链接按钮（style 5）渲染为只接受 http(s) 的普通链接，不再被当成交互按钮；调试用的 `com.discordlight.test` eval 入口改为仅在设置 `DISCORDLIGHT_DEBUG` 时注册；`respondToJS` 校验回调名并转义 U+2028 / U+2029。
- **Bug 修复**。消息时间由 UTC 改为本地时间；清洗旧 emoji 前缀的正则补上 `u` 标志（之前会把名字里的 emoji 截成半个字符）；首次保存 token 后事件监听被重复绑定的问题。

### v1.0.0 (2026-10-07)
- 首个交接版本。

---

*文档完结，祝开发顺利！*
