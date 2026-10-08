# DiscordLight 项目交接文档 (Handover Document)

> **文档版本**: v1.2.0  
> **更新时间**: 2026-10-08  
> **仓库地址**: [https://github.com/SidUParis/DiscordLight](https://github.com/SidUParis/DiscordLight)  
> **作者/维护团队**: SidUParis & AI Pair Programming  

---

## 1. 项目简介与背景 (Project Overview)

### 1.1 为什么做 DiscordLight？
- **传统客户端痛点**：官方 Discord 客户端基于 Electron 构建，常驻内存高达 800MB ~ 1.5GB，待机状态仍占用 5%~15% 的 CPU，MacBook 发热严重且电池消耗极快；对于深度使用 AI Agent / Bot 的开发者而言，界面充斥大量冗余社交功能，而针对 AI 交互的痛点（如 Touch Bar 艾特被输入法顶替、交互式按钮只发文字报错、线程管理混乱等）未能得到解决。
- **项目定位**：面向 AI 开发者与 Agent 工作流的**超轻量、高性能、原生 macOS** 客户端。
- **核心成果**：
  - **实测内存约 120 MB**（宿主进程约 58 MB + WebKit 辅助进程约 60 MB；Intel MacBook Pro、macOS 15.8.1、v1.2.0、真实账号轮询 90 秒，见 5.2 的 `scripts/run-debug.command`）。
  - **空闲 CPU 0.1–1.2%**（窗口可见、每 2.5 s 轮询；后台 15 s 一次），纯本地直连。
  - **原生 Touch Bar 深度定制**：采用 Popover 架构，彻底解决输入法候选词挤占 Touch Bar 的系统级冲突。
  - **真实的交互式组件响应**：完整支持 AI Bot 的 `Allow Session`、`Allow Once` 等组件交互（发送 Discord 原生 Interaction Payload，而非文字回退）。
  - **全局搜索与群聊分类**：支持秒级检索多人群聊、成员、频道与私信，`⌘K` 直达搜索。
  - **轻量轮询**：增量轮询只请求比当前最新消息更新的内容，没有新消息时不做任何 DOM 工作；窗口看不见时自动降频（见 3.9）。
  - **Graphite Console 界面**：原生 macOS 深色外观，全套单色描边图标（界面中不使用 emoji）。
    智能体消息是一等公民：审批请求渲染为独立的审批卡片，智能体与人类用头像形状区分。

---

## 2. 代码仓库与文件结构 (Repository Structure)

```
DiscordLight/
├── Makefile                 # 构建 / 安装 / 清理 / 冒烟测试（make build | install | clean | test）
├── build.sh                 # 快捷构建辅助脚本
├── LICENSE                  # MIT 开源许可证
├── README.md                # 英文说明文档
├── README_CN.md             # 中文说明文档
├── HANDOVER.md              # 本交接文档
├── AGENTS.md                # AI 代理执行清单
├── assets/
│   ├── AppIcon.icns         # 应用图标（原创：石墨色圆角方块 + 琥珀色闪电，多分辨率 icns）
│   ├── AppIcon.png          # 1024×1024 图标母版
│   ├── touchbar_icon.png    # Touch Bar 图标（琥珀色闪电，36×36）
│   └── make_icon.py         # 图标生成脚本（Pillow + numpy），重新生成上面三个文件，见 5.5
├── scripts/
│   ├── build-and-run.command  # 双击即 make build && make install 并重启应用，见 5.2
│   └── run-debug.command      # 前台运行已安装的 App 90 秒，采样 RSS/CPU，抓 stderr 与崩溃报告，见 5.2
├── src/
│   ├── main.m               # Objective-C 原生宿主：窗口、WebKit Bridge、导航策略、TouchBar（ARC，见 3.7）、Keychain（见 3.10）、系统通知与 Dock 角标（见 3.11）
│   └── Info.plist           # macOS Bundle 元数据 (BundleID, 权限, 架构等)
├── web/
│   ├── index.html           # 前端 UI 骨架：侧栏（搜索 + 三个可折叠分组）、聊天区、输入框
│   ├── style.css            # Graphite Console 主题（原生 macOS 深色）
│   └── app.js               # 前端核心业务逻辑（API 请求、轮询、组件交互、全局搜索、TouchBar 桥接）
└── tests/                   # 仅开发用的无头冒烟测试，不进 App 包，见 5.4
    ├── package.json         # 只有一个 devDependency：playwright
    ├── README.md            # 测试说明（覆盖范围、运行方法、如何加用例）
    └── smoke/
        ├── run-all.cjs      # 依次运行全部套件（npm test / make test）
        ├── harness.cjs      # 公共部分：加载 Playwright、web 目录、PASS / FAIL 输出
        ├── mock-bridge.cjs  # 假 discordBridge 与固定数据
        ├── run-ui.cjs  run-links.cjs  run-mentions.cjs  run-polling.cjs  run-polling-edge.cjs
        ├── run-notify.cjs  run-content.cjs  fuzz-markdown.cjs
        └── .shots/          # 截图输出（gitignored）
```

### 关键路径说明
| 路径 | 说明 |
| :--- | :--- |
| **本地源码目录** | `/Users/xu/Developer/projects/DiscordLight/` |
| **系统安装目录** | `/Applications/DiscordLight.app` |
| **本地用户配置** | `~/.config/discordlight/config.json` |
| **双击构建日志** | `scripts/last-build.log`（被 `.gitignore` 的 `*.log` 忽略） |

`config.json` 目前包含的键：`pinned_channels`（关注列表）、`last_channel_id`、`ui`（界面状态，见 3.8）。从 v1.2.0 起 token 存在 Keychain 里，不再写进 `config.json`；旧版本留下的 `token` 键会在启动时迁移进 Keychain 并从文件中删除（见 3.10）。

---

## 3. 技术架构与核心模块剖析 (Architecture & Deep Dive)

### 3.1 原生 Cocoa 宿主 (`src/main.m`)
- **WebKit 嵌入**：使用 `WKWebView` 加载本地 `file://.../web/index.html`。
- **双向通信 (Native Bridge)**：
  - **前端 -> 原生**：通过 `window.webkit.messageHandlers.discordBridge.postMessage({ action, callback, ... })` 调用（前端统一封装在 `callNative(action, data)`）。
  - **原生 -> 前端**：原生执行完毕后，通过 `evaluateJavaScript:` 回调前端指定的 `callback`（`respondToJS:data:`，数据经 JSON 序列化）。
- **原生 API 封装**：
  - `fetchCurrentUser` / `fetchGuilds` / `fetchGuildChannels` / `fetchDMs` / `fetchMessages` / `sendMessage`。
  - `fetchMessages` 接受 `{channelId, limit}` 和可选的 `after` 或 `before`（snowflake id）。两者都只有在全部是 ASCII 数字、长度 1~20 时才拼进请求 URL（`&after=` / `&before=`），否则直接忽略。Discord 一次只接受其中一个：有合法的 `after` 时用 `after`，否则才看 `before`。请求失败时回答 `{messages: [], error}`。轮询怎么用 `after` 见 3.9，向上翻历史怎么用 `before` 见 3.12。
  - `sendInteraction`：向 Discord `/interactions` 端点发送原生交互式按钮组件点击。
  - `getConfig`：返回 `config.json` 的内容，**但不含 `token`**，只附带 `hasToken` 布尔值（见 4.3）。
  - `saveConfig`：接受 `token` / `pinned_channels` / `last_channel_id` / `ui` 四个键。`token` 只写进 Keychain（空字符串则删除 Keychain 条目），永远不写进 `config.json`；其余三个键写回 `config.json`（见 3.10）。
  - `clearToken`：退出登录用，删除 Keychain 里的 token 并清掉内存里的 token（`config.json` 里如果还有旧的 `token` 键也一并删除）。目前前端还没有调用它的入口（见 3.10）。
  - `notify`：接收 `{title, body, channelId, tag}`，发一条系统通知；`tag` 是消息 id，用作通知的 identifier。是否该发由前端的 `maybeNotify` 决定（见 3.11）。
  - `setBadge`：接收 `{count}`，设置 Dock 图标角标；`count` 为 0 时清除角标（见 3.11）。
  - `updateTouchBar`：接收 `{channelId, channelName, bots, members, pinned}` 并重建 Touch Bar（`bots` 是智能体，`members` 是多人群聊里的真人成员，分类规则见 3.2）。
- **原生调用前端的入口**（原生通过 `evaluateJavaScript:` 调用，改名即失效）：
  - Touch Bar 按钮：`window.touchBarAction('logo')`、`window.insertMentionFromTouchBar(name)`、`window.switchChannelById(id)`、`window.loadMessages()`。
  - 点击系统通知：`window.switchChannelById(id)`（`id` 来自通知的 `channelId`，经 `jsStringLiteral:` 编码，见 3.11）。
  - 窗口可见性：`window.setAppVisible(true | false)`，由 `windowDidChangeOcclusionState:`、`applicationDidHide:`、`applicationDidUnhide:` 调用，决定轮询间隔（见 3.9）。
  - 窗口焦点：`window.setAppFocused(true | false)`，由 `windowDidBecomeKey:` / `windowDidResignKey:` 调用，页面加载完成时（`didFinishNavigation:`）再按当前状态调用一次，决定是否发系统通知（见 3.11）。
- **开发者工具**：
  - 在 `main.m` 中开启了 `developerExtrasEnabled = YES`，在运行界面**右键即可选择「检查元素（Inspect Element）」**调出 WebKit Safari 开发者工具，极大降低前端与网络调试成本。

### 3.2 深度优化的 NSTouchBar 架构 (`src/main.m`)
#### 💡 解决了什么顽疾？
在 macOS 系统中，一旦用户在输入框打字，macOS 会强行将 Touch Bar 替换为系统的输入法候选字栏（Candidate List），导致所有自定义按钮瞬间被顶走，无法同时选词和点艾特。

#### 💡 解决方案：
1. **采用 `NSPopoverTouchBarItem`**：
   - 在 Touch Bar 常驻区注册 `@ 智能体`（Identifier: `com.discordlight.touchbar.agents_popover`）、`@ 成员`（Identifier: `com.discordlight.touchbar.members_popover`）和 `# 频道`（Identifier: `com.discordlight.touchbar.channels_popover`）。
   - 即使输入法弹出候选词，Popover 气泡按钮依然常驻或只需轻触即可展开二级列表。
   - `@ 智能体 (n)`：只在 `bots` 非空时出现，旁边另有第一个智能体的直达按钮；展开后每个按钮插入 `@名字`。
   - `@ 成员 (n)`：只在 `members` 非空时出现（也就是只在多人群聊里），紧跟在智能体之后；展开后每个按钮插入 `@名字`（`touchBarPopoverMemberClicked:`），点完自动收起，和智能体按钮一样。
   - 两类按钮的二级 Identifier 分别是 `com.discordlight.touchbar.popover.bot.<i>` 和 `com.discordlight.touchbar.popover.member.<i>`，直达按钮是 `com.discordlight.touchbar.bot.<i>`；新增 Identifier 时注意不要让一个前缀成为另一个的前缀（`touchBar:makeItemForIdentifier:` 用 `hasPrefix:` 分派）。
2. **智能体与成员的分类**（`getMentionTargets()`，`web/app.js`；输入框下方的快捷芯片用同一份结果，先智能体、后成员，两组之间有一条细分隔线）：
   - **智能体（`bots`）**：私信 / 多人群聊里带 `bot` 标记（或登记在 `KNOWN_BOTS`）的成员；已载入消息里 `bot` 为真或登记在 `KNOWN_BOTS` 的作者与被 @ 的人（最新的在前）；只有在**服务器频道和线程**里，才把 `KNOWN_BOTS` 中还没出现的智能体作为兜底补在后面。私信和多人群聊里**永远不加**兜底。
   - **成员（`members`）**：只在多人群聊（`type === 3`）里有：不带 `bot` 标记的成员，去掉自己（`state.currentUser.id`）。私信和服务器频道里为空。
   - 两个列表按 id、再按显示名去重；每项是 `{id, name, username}`。关注列表里保存的群聊条目不带成员名单，按 id 去 `state.groups` / `state.dms` 里取。
   - `getChannelBots()` 保留为只返回 `bots` 的别名。输入框里的 `@` 补全（`showMentionPopover`）不受影响，仍然列出所有已知用户和智能体。
3. **动态感知与双向同步**：
   - 前端切换频道或接收到新消息时，按上面的规则算出智能体与成员，调用 `notifyTouchBar()`（bridge action: `updateTouchBar`）传输给原生层。轮询没有新内容时不会重绘消息，也不会发 `updateTouchBar`。
   - 原生层动态重绘 Touch Bar 二级内容，确保“看什么频道，Touch Bar 就显示谁”。
   - **契约**：payload 为 `{channelId, channelName, bots, members, pinned}`；原生只读取 `pinned[].name` / `pinned[].id`、`bots[].name` 和 `members[].name`。改前端时不要动这几个字段。

### 3.3 交互式组件（Component Interactions）机制 (`web/app.js`)
- **问题**：在很多第三方轻量客户端中，当 AI Agent（如 Hermes、AutoGPT）弹出 `[Allow Once]` / `[Allow Session]` 按钮时，点击通常只往输入框发一句话，导致 Bot 报 Invalid Interaction。
- **解决方案**：
  - 前端解析 Discord 消息结构中的 `components` 数组（`type: 1` 行，`type: 2` 按钮）。
  - 按钮渲染为 `<button data-act="component" data-app data-msg data-custom data-label>`，点击由 `#messagesList` 上的**一个委托监听器**分发给 `handleComponentClick(appId, messageId, customId, label, btnEl)`（不使用内联 `onclick`，见 4.3）。
  - 构造标准的 Discord Type 3 Component Interaction Payload，调用原生的 `sendInteraction` 接口直连 API，完美触发 Agent 后续任务流。
  - 按钮组如果是“批准 / 拒绝”类提示，会渲染成审批卡片（见 3.6）；其余按钮保持普通按钮行。
  - **链接按钮（style 5）不是交互**：它带 `url`、没有 `custom_id`，渲染为普通链接而不是 `data-act="component"` 按钮，永远不会调用 `sendInteraction`（见 3.6）。
  - **下拉选择菜单（select menu）暂不支持**：显示为一个禁用样式的占位按钮，不带 `data-act`，也不计入审批判定（见 3.12）。

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
  - `expired` “已处理”：Bot 自己把所有按钮置为 disabled（在别处处理过，或已超时）；或者点击的 label 既不是允许类也不是拒绝类（如 `Approve`、`确认`）。Bot 禁用按钮属于“编辑消息”，增量轮询看不到，要等下一次 resync 才会显示（见 3.9）。
  - 已回答的卡片，操作区收起为一行结果：对勾 / 叉 + “{label} · HH:MM”。
- **`state.resolvedInteractions`**：`messageId -> { label, time, customId }`。只记录**在审批卡片上**点击成功的交互，只存在内存里（重启后丢失，届时以 Bot 是否禁用按钮为准）。轮询重绘时用它恢复卡片状态；如果 Bot 之后换上了一组新的可用按钮（原 `customId` 不在其中），记录失效，卡片回到 `pending`。
- **普通按钮行不受影响**：翻页、菜单这类不命中关键词的按钮，仍渲染为正文下方的 `.components-row`，始终可点、点击后不锁定，800ms 后重新拉取消息，与改版前行为一致。
- **链接按钮（Discord style 5）**：渲染为 `<a class="btn-component style-link" href target="_blank" rel="noopener noreferrer">`，label 后带 `external` 图标，外观与中性描边按钮相同，点击后由原生导航策略交给系统浏览器（见 4.3 第 5 条）。只接受 `http://` / `https://` 开头的 `url`；其他协议（如 `javascript:`）或被 Bot 置为 disabled 的链接按钮，渲染为不带 `href` 的禁用按钮。链接按钮没有 `data-act`，委托监听器不会把它当作交互；它也**不计入** `isApprovalPrompt` 的关键词判定和“全部按钮已禁用”的统计（`linkCount` 与 `buttonCount` 分开计数），所以一个写着“Cancel”的链接按钮不会让消息变成审批卡片。只有链接按钮的消息走普通按钮行；与审批按钮同时出现时，链接按钮跟着显示在卡片操作区，卡片回答后随操作区一起收起。
- **状态栏文案**（`#statusIndicator`）：点击后“正在发送: {label}…”；审批卡片成功为“已授权: {label}”或“已拒绝: {label}”；普通按钮成功为“已发送: {label}”；失败为“操作失败: {原因}”并恢复按钮。已禁用的按钮带 `disabled` 属性且 CSS 为 `pointer-events: none`，正常情况下点不到；`handleComponentClick` 里“该按钮已失效或超时”只是兜底分支。

### 3.7 窗口 Chrome (`src/main.m`)
- 窗口样式带 `NSWindowStyleMaskFullSizeContentView`，并设置 `titlebarAppearsTransparent = YES` 与 `titleVisibility = NSWindowTitleHidden`：网页内容铺满整个窗口，红绿灯按钮直接悬浮在侧栏左上角。
- **`DLDragStripView`**：一条 240×38 的透明原生视图，盖在侧栏顶部（是 `contentView` 的子视图，叠在 `WKWebView` 之上）。原因是标题栏没有了，而 `WKWebView` 会吞掉所有 mouseDown，窗口将无法拖动。该视图把按下事件交还给窗口（`performWindowDragWithEvent:`），双击执行缩放（`performZoom:`），行为与真标题栏一致。
- **必须保持同步的两个数字**：`main.m` 里拖拽条的 `240 × 38`，与 `style.css` 里 `.sidebar { width: 240px }`、`.sidebar-header { padding-top: 38px }`。这 38px 的留白带里不能放任何可交互元素（会被拖拽条挡住点不到）。
- **窗口 delegate**：`AppDelegate` 现在同时是窗口的 delegate（`self.window.delegate = self`），用来接收 `windowDidChangeOcclusionState:`，把窗口是否可见告诉前端（见 3.9）；v1.2.0 起还接收 `windowDidBecomeKey:` / `windowDidResignKey:`，把窗口是否有焦点告诉前端（见 3.11）。

> **⚠️ 内存管理：`main.m` 现在用 ARC 编译，请保持**
>
> v1.1.0 之前 `make build` 没有带 `-fobjc-arc`，也就是手动引用计数（MRC）。而 `main.m` 从一开始就是按 ARC 风格写的（没有任何 `retain` / `release` / `autorelease` / `dealloc`），结果是每次 bridge 回调（也就是每次轮询）里 `[[NSString alloc] initWithData:…]` 之类的 +1 对象都在泄漏，Touch Bar 每次刷新也泄漏一整套 item。对一个以“轻量”为卖点的客户端来说这是实打实的问题。
>
> v1.1.0 开发期间还出过一次真实崩溃：评审时把 `respondToJS:` 里的 `NSCharacterSet` 缓存进了一个 `static` 变量，在 MRC 下 pool 一排空它就成了悬空指针，下一次在 NSURLSession 的 delegate 队列上调用时 `EXC_BAD_ACCESS`。
>
> 因此 v1.1.0 做了两件事：
> - Makefile 改为 `clang -fmodules -fobjc-arc -framework Cocoa -framework WebKit -O2 -Wall`，整个文件切到 ARC；审查确认文件里没有手动引用计数调用、没有 Core Foundation bridge 转换，`-Wall` 零警告。
> - `self.window.releasedWhenClosed = NO`：窗口由 `AppDelegate` 的 strong 属性持有，ARC 下必须关掉 `releasedWhenClosed`，否则关窗时会 over-release。
>
> 实测（`scripts/run-debug.command`，连接真实账号、每 2.5s 轮询）：宿主进程 RSS 在启动后稳定在 51 MB 左右，90 秒内不再增长，CPU 0.0–0.1%。
>
> 规则：
> - **不要去掉 `-fobjc-arc`**；也不要在 `main.m` 里写 `retain` / `release` / `autorelease`（ARC 下不编译）。
> - 新增 `static` 缓存对象在 ARC 下是安全的，但仍然建议避免（Touch Bar、bridge 回调都在不同队列上）。
> - 用到 Core Foundation 对象时记得 `__bridge` / `CFRelease`。

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

### 3.9 轻量轮询机制 (`web/app.js` + `src/main.m`)
还没有接 Gateway（见第 6 节），新消息靠轮询。设计目标是空闲时几乎不做事：绝大多数轮询的回答是空数组，前端不解析、不重绘、不发 `updateTouchBar`。

| 状态 | 间隔 | 请求（bridge `fetchMessages`） |
| :--- | :--- | :--- |
| 打开频道 / 整页重载 | 一次 | `{channelId, limit: 40}` |
| 窗口可见，普通轮询 | 2.5 s | `{channelId, limit: 50, after: <当前最新消息 id>}` |
| 每第 12 次轮询（resync） | 可见时约每 30 s，后台约每 3 min | `{channelId, limit: 15}`（不带 `after`） |
| 窗口不可见（完全被遮挡、最小化、在别的桌面，或应用被隐藏） | 15 s | 同上两行 |
| 从不可见变为可见 | 立即一次 | resync `{channelId, limit: 15}`，之后回到 2.5 s |
| 引导弹窗（填 token）打开时 | 不轮询 | — |
| 向上翻历史（不属于轮询，见 3.12） | 滚到顶部附近时一次 | `{channelId, limit: 40, before: <当前最旧消息 id>}` |

- **增量轮询**：`after` 是当前显示的最新消息 id（`state.lastMessageId`）。空回答直接返回。有新消息时先去掉已经显示过的 id（防止与整页重载竞争而重复），再合并到最上面重绘，并把这些新消息交给 `maybeNotify`（见 3.11）。频道里还没有任何消息时，轮询直接读最新 15 条。
- **resync**：`after` 看不到编辑，比如 Bot 禁用审批按钮、线程回复数变化、消息被删除。所以每第 12 次轮询改为重读最新 15 条，用 `messagesSignature` 与当前显示的比较（id 与顺序、`edited_timestamp`、组件的 `disabled`、线程的 id / 回复数 / 名称、embed 与附件的数量），**只有变了才重绘**。合并由 `mergeLatest` 完成：重读范围内消失的消息视为已删除，比范围更早的保留；显示中比重读结果还新的消息也视为已删除，除非它是 resync 请求发出之后才由一次整页重载显示出来的。重绘时只有此前没显示过、且比 resync 发出时的最新 id 更新的消息才交给 `maybeNotify`（`arrivedSince`，见 3.11）。
- **整页重载**：`after` 回答满 50 条（例如 Mac 睡眠后醒来），或者 resync 的 15 条够不到当前显示的最新消息时，中间可能有缺口，改为 `limit: 40` 整页重载（`pollReloadNewest`）。中间的缺口无法显示，所以这条路径会丢掉已经向上翻出来的历史（见 3.12）；通知同样只针对新 id。
- **内存上限**：平时前端最多保留 100 条消息（`MAX_MESSAGES`）；用户向上翻过历史之后（`state.historyLoaded`）上限放宽到 400 条（`HISTORY_MAX`），这样下一次轮询不会把刚翻出来的几页截掉。截断统一由 `capMessages` 完成，截掉最旧的消息后更早的历史又可以重新翻到（见 3.12）。
- **并发与过期回答**：同一时间只有一个轮询请求在途，上一个还没回来时定时器这一拍直接跳过。切换频道时 `pollGen` 加一并重置计数，旧频道迟到的回答一律丢弃。
- **可见性**：原生在 `windowDidChangeOcclusionState:`、`applicationDidHide:`、`applicationDidUnhide:`（取消隐藏时窗口仍在 Dock 里则算不可见）里调用 `window.setAppVisible(bool)`；网页自己的 `document.visibilitychange` 作为后备。值没变时是空操作。变为可见时立即做一次 resync，所以后台期间的编辑一回到前台就能看到。
- **状态栏文字**：可见时 `已连接`，不可见时 `已连接 · 后台低频`。
- **常量**都在 `app.js` 的轮询段：`POLL_MS = { active: 2500, hidden: 15000 }`、`POLL_AFTER_LIMIT = 50`、`RESYNC_LIMIT = 15`、`RESYNC_EVERY = 12`、`MAX_MESSAGES = 100`；向上翻历史的常量（`LOAD_LIMIT`、`HISTORY_PAGE`、`HISTORY_MAX` 等）在它前面的消息加载段（见 3.12）。`window.__DL_POLL_MS` 只给冒烟测试缩短间隔用，应用里不存在。
- **代价**：别人编辑消息要等下一次 resync 才看得到（可见时最多约 30 s，后台最多约 3 min）；没有向上翻过历史时，整页重载会把列表换成最新 40 条，滚动位置保不住。改这一段逻辑后务必跑 `make test`（`polling` 与 `polling-edge` 两个套件专门测它，`notify` 测轮询路径上的通知，`content` 测与向上翻历史的配合）。

### 3.10 Token 存储（Keychain）(`src/main.m`)
从 v1.2.0 起 token 不再明文写在 `config.json` 里，而是存进 macOS 钥匙串：login keychain 里的一条通用密码（generic password），service 为 `com.sidney.DiscordLight`，account 为 `discord-token`。在“钥匙串访问”App 里搜 `com.sidney.DiscordLight` 可以找到。

- **查找顺序**（启动时，`applicationDidFinishLaunching:`）：
  1. **环境变量 `DISCORD_TOKEN`**：非空就直接使用，**完全不读写 Keychain**（开发用）。
  2. **Keychain 条目**。
  3. **旧版 `config.json` 的 `token` 键**：Keychain 里没有而文件里有时，先写进 Keychain（迁移）；只要 Keychain 里有了 token（原来就有，或刚迁移成功），就从 `config.json` 删掉 `token` 键并保存。Keychain 不可用（例如用户在系统弹窗里点了拒绝）时，继续使用文件里的旧 token，下次启动再尝试迁移。
  4. 都没有：前端收到 `hasToken: false`，弹出引导弹窗；用户填的 token 经 `saveConfig` 写进 Keychain。
- **写入**：`saveConfig {token}` 只写 Keychain（先 `SecItemUpdate`，没有条目时 `SecItemAdd`），空字符串则删除条目；`config.json` 里的 `token` 键无论如何都会被删掉。Keychain 写入失败时，token 只在本次运行中有效，下次启动会重新出现引导弹窗。
- **`clearToken`**：删除 Keychain 条目，清空内存里的 token，并删掉 `config.json` 里残留的 `token` 键。设置了 `DISCORD_TOKEN` 时，下次启动仍会使用环境变量。前端目前还没有“退出登录”的入口，这个 action 是为它预留的。
- **API 选择**：用的是传统的（基于文件的）Keychain API，查询里不带 `kSecUseDataProtectionKeychain`，所以不需要 entitlement，也不需要开发者签名证书。读取结果用 `__bridge_transfer` 交给 ARC，符合 3.7 的规则。
- **⚠️ 每次重新编译后 macOS 会再问一次**：钥匙串条目的访问控制记住的是写入它的那个程序的签名。`make build` 只做 ad-hoc 签名（见 5.2），每次编译出来的签名都不一样，所以重新编译、安装后第一次启动，系统会弹窗询问是否允许 DiscordLight 访问钥匙串。选“始终允许”即可，直到下一次重新编译；点“拒绝”则本次读不到 token，会出现引导弹窗。
  - **开发时不想反复弹窗**：用环境变量 `DISCORD_TOKEN` 启动。方法与 5.3 的 `DISCORDLIGHT_DEBUG` 相同：先完全退出应用，再在终端里带着这个变量 `open /Applications/DiscordLight.app`。这条路径完全不碰 Keychain，所以不会弹窗。不要把 token 写进脚本、shell 配置或任何会被提交的文件（见 4.2）。
- **测试**：Keychain 与系统通知都要在 app bundle 里测，也就是 `make install` 之后运行 `/Applications/DiscordLight.app`，不要直接运行裸二进制（AGENTS.md 第 8 条）。

### 3.11 系统通知与 Dock 角标 (`web/app.js` + `src/main.m`)
该不该发、发什么，全部由前端的 `maybeNotify(newMessages)` 决定（`app.js` 里 `// ===== [WP2 notifications] BEGIN … END =====` 之间的一段）；原生只负责显示通知、设置角标、处理点击。

- **只看轮询新到的消息**：只有轮询路径会调用 `maybeNotify`，传入的也只是这次轮询新到的消息：
  - 增量轮询（`after`）：去掉已显示 id 之后的新消息。
  - resync 与整页重载（`pollReloadNewest`）：经 `arrivedSince(list, sinceId, prevShown)` 过滤，只留下比请求发出时的最新 id 更新、且重绘前没有显示过的消息，所以同一条消息不会通知两次。
  - 打开 / 切换频道、刷新与发送后的重载（`loadMessages`）、向上翻历史（`loadOlderMessages`）**永远不通知**；频道里还没有任何消息时的那种轮询（直接读最新 15 条）也不通知。
- **条件**：窗口不是 key window（`state.focused` 为假）**或**窗口看不见（`state.visibility === "hidden"`，见 3.9）；并且消息满足下面任意一条：
  - @ 了当前用户（`mentions` 里有自己），或 `mention_everyone` 为真（@everyone）。@ 自己所在的角色不算（没有检查 `mention_roles`）。
  - 当前频道是私信（`type 1`）或多人群聊（`type 3`）：其中任何一条消息都通知。关注列表里旧版保存的条目不带 `type` 时，按 id 去 `state.groups` / `state.dms` 里查。
  - 是审批请求：有未禁用的非链接按钮，且 `isApprovalPrompt` 命中（见 3.6）。
  - 自己发的消息永远不通知。
- **标题**：作者显示名（与消息列表同一规则：`KNOWN_BOTS` → 已知用户 → `global_name` / `username`）；服务器频道和线程在后面加 ` · #频道名`，私信与多人群聊不加。
- **正文**（`notifBody`）：纯文本，不做 HTML 转义（原生原样显示，不会被当作标记）。`<@id>` 换成 `@名字`，`<@&id>` 换成 `@角色名`（`KNOWN_ROLES` 里没有的写 `@Role`），`<#id>` 换成 `#频道名`（找不到时是 id），自定义表情换成 `:name:`；连续空白合并为一个空格；超过 140 个字符截断并加 `…`。没有文字时，审批请求写 `[审批请求]`，其他一律写 `[附件]`（只有 embed 的消息也是这一类）。
- **数量**：每次轮询最多发 5 条横幅（`NOTIFY_MAX_PER_TICK`）：取最新的 5 条，从旧到新依次发，最新的一条在最上面。角标计数包含所有符合条件的消息，不受这 5 条的限制。
- **Dock 角标**：`state.unreadNotified` 累计自上次获得焦点以来符合条件的消息数，每次通过 `setBadge {count}` 更新（原生设置 `NSApp.dockTile.badgeLabel`）。窗口重新成为 key window 时，原生在 `windowDidBecomeKey:` 里先清掉角标，前端的 `setAppFocused(true)` 再把计数归零并发 `setBadge {count: 0}`。
- **点击通知**：`didReceiveNotificationResponse:` 激活应用、把窗口提到最前，再调用 `window.switchChannelById(channelId)`。`switchChannelById` 依次在关注列表、私信、多人群聊（`state.groups`，所以没关注的群聊也能打开）、已加载的服务器频道里找；线程 id 不在这些列表里，找不到（见 6.1）。
- **应用在前台时也显示横幅**：`willPresentNotification:` 返回 banner + sound（macOS 11 以下用 alert），前端已经判断过该不该发，原生不再过滤。
- **原生要求**：
  - `UNUserNotificationCenter` 需要 app bundle。没有 bundle identifier 的裸二进制里调用它会抛异常，所以所有通知路径都经过 `notificationCenterOrNil`：裸二进制下 `notify` 什么也不做，回答 `{success: false}`。
  - 启动时 `setupNotifications` 请求通知权限（提醒、声音、角标），首次启动系统会弹一次授权框。`Info.plist` 里 `NSUserNotificationAlertStyle` 为 `banner`。
  - Makefile 因此多链接了 `UserNotifications` 框架（见 5.2）。
- **横幅一直不出现时，按顺序查**：
  1. **系统设置 → 通知 → DiscordLight**：是否允许通知、提醒样式是否为“横幅”或“提示”。首次授权框里点了“不允许”，就会在这里关着。
  2. **专注模式 / 勿扰模式**是否打开。
  3. 是否从 `/Applications/DiscordLight.app` 启动（裸二进制没有通知，见上）。
  4. 消息是否在**当前打开的频道**里：只有当前频道在轮询，其他频道的消息不会通知（见 6.1）。
  5. 窗口是否真的失去了焦点：右键 → 检查元素，在 Console 里看 `state.focused` 和 `state.visibility`。窗口是 key window 且可见时，前端本来就不发通知。
  6. 看 Dock 角标：角标有数字而没有横幅，说明前端已经发了 `notify`，问题在系统通知设置一侧；角标也没有，说明前端没有判定为需要通知（对照上面的条件）。

### 3.12 Embeds、附件与历史回溯 (`web/app.js` + `web/style.css` + `web/index.html`)
- **位置**：附件与 embed 放在消息正文下方的 `.msg-accessories` 里，由 `messageAccessoriesHTML(m)` 生成；审批请求则放在审批卡片的 `.approval-body` 里，所以 Bot 把要执行的命令放在 embed 里时，用户在卡片里也能看到自己在批准什么。消息没有文字时加 `.lead`，紧贴作者行。
- **安全规则与正文相同**（见 4.3）：所有字符串都过 `escapeHTML`；所有 `href` / `src` 必须是 http(s)（`safeHttpUrl`），否则不出链接、不出图片；embed 的描述与字段值走 `parseMarkdown`；链接和图片都带 `target="_blank"`，由原生导航策略交给系统浏览器。
- **Embed 卡片**（`embedHTML`）：左边框颜色取 `embed.color`（0xRRGGBB 整数，其他值用默认边框色）。自上而下：作者、标题（`url` 是 http(s) 时为链接）、描述、字段（两列，`inline` 不为 `true` 的独占一行）、右侧缩略图（缩进 64×64）、大图、页脚 + 时间（`fmtTime`）。`video` / `provider` 忽略。没有文字的 `image` / `gifv` 类 embed（例如只贴了一个图片或 GIF 链接）只显示图片。上限：每条消息 4 个 embed（`MAX_EMBEDS`），每个 embed 10 个字段（`MAX_EMBED_FIELDS`）。
- **附件**（`attachmentsHTML`）：图片（`content_type` 以 `image/` 开头，或扩展名为 png / jpg / jpeg / gif / webp）排成一行可换行的图片，按比例缩进 400×300（`IMAGE_MAX`）；其他文件（视频、音频也一样，不自动播放）每个一行：文件图标、文件名、大小、下载链接。每条消息最多 10 个附件（`MAX_ATTACHMENTS`）。
- **图片加载**：`<img loading="lazy" decoding="async">`，宽高属性按原图尺寸事先算好，图片加载前就占好位置。`src` 优先用 Discord 的媒体代理地址 `proxy_url`（通常是 `media.discordapp.net`），点击打开原图 `url`（通常是 `cdn.discordapp.com`）。图片在渲染之后才加载完：如果当时视图贴在底部（`state.stickToBottom`），`#messagesList` 上捕获阶段的 `load` 监听会把它重新贴到底部。
- **下拉选择菜单**：组件 type 3 / 5 / 6 / 7 / 8（字符串、用户、角色、可提及对象、频道选择）显示为禁用样式的占位按钮（显示 `placeholder`，没有就写“选择…”；悬停提示“下拉选择暂不支持”）。它不带 `data-act`，点击无效果，也不计入审批判定和“全部按钮已禁用”的统计；只有下拉菜单的消息走普通按钮行。
- **向上翻历史**（`maybeLoadHistory` / `loadOlderMessages`）：
  - 视口滚到离顶部 80 px 以内（`HISTORY_TRIGGER_PX`）时，请求 `fetchMessages {limit: 40, before: <当前最旧消息 id>}`（`HISTORY_PAGE`），把更早的一页接到 `state.messages` 末尾（列表是新消息在前）。列表太短、没有滚动条时，每次渲染后直接检查，不等滚动事件。
  - **锚定**：翻页后的渲染带 `anchorId`（翻页前最旧的那条），保持这一行的底边在屏幕上的位置不变，用户正在看的内容不会跳。
  - **状态行**：列表上方的 `#historyStatus` 显示“正在载入更早的消息…”，或到上限时显示“只显示最近 400 条消息”；翻到头时什么也不显示。
  - **上限**：没翻过历史时 100 条（`MAX_MESSAGES`），翻过之后（`state.historyLoaded`）400 条（`HISTORY_MAX`）；到了 400 条就不再往上翻。
  - **`historyExhausted`**：一页回答不满 40 条，或者回答里没有比当前最旧消息更早的消息时置为真，之后不再请求；打开频道或整页重载的回答不满 40 条时同样置为真。`capMessages` 截掉最旧的消息时置回假（被截掉的部分又可以翻到）。
  - **失败与过期**：请求失败（回答带 `error`）时等 3 s（`HISTORY_RETRY_MS`）再试。切换频道时（`resetPolling`）历史状态全部复位；迟到的回答（频道已经切换，或一次整页重载已经换掉了列表）直接丢弃。
  - **与轮询和重载的配合**：增量轮询和 resync 只在最新的一端合并，已经翻出来的历史保留。翻过历史之后的 `loadMessages`（发送后、点普通按钮后、Touch Bar 刷新）如果回答能接上当前显示的最新消息，就按 resync 的方式合并（`mergeLatest(latest, shownTop, LOAD_LIMIT)`），历史和滚动位置都保留；接不上时按普通整页重载处理。轮询发现缺口时的 `pollReloadNewest` 会丢掉已翻出来的历史（见 3.9）。翻出来的旧消息永远不会触发通知（见 3.11）。
- **`messagesSignature` 包含 embed 与附件的数量**：Discord 常在消息发出之后才补上链接预览，而且不改 `edited_timestamp`。不把数量算进签名的话，resync 看不出变化，预览就一直不显示。
- **Masked link 还不解析**：`[文字](url)` 的方括号部分原样显示，括号里的 URL 按自动链接规则（4.3 第 6 条）变成链接。Bot 的 embed 描述里常用这种写法（见 6.1）。

---

## 4. 安全规范与凭据管理 (Security Protocols)

> **最高原则**：严禁将任何 Token、Cookie、Session 或私人账号凭证提交到 Git 仓库中。

### 4.1 Token 发现链条
客户端遵循严格的本地动态凭据查找顺序（v1.2.0 起，细节见 3.10）：
1. **系统环境变量**：优先读取 `DISCORD_TOKEN`（这条路径不读写 Keychain）。
2. **macOS 钥匙串（Keychain）**：service `com.sidney.DiscordLight`、account `discord-token` 的通用密码条目。
3. **旧版配置文件**：`~/.config/discordlight/config.json` 里旧版本留下的 `token` 键（该文件位于系统用户目录下，与 Git 仓库完全隔离，已被 `.gitignore` 规避）。读到后迁移进 Keychain，并从文件中删除。
4. **交互式首次引导弹窗**：如均未配置，应用启动时会弹出配置引导框，由用户手动输入，token 只写进 Keychain，不再写进 `config.json`。

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
8. **链接按钮的 `url` 只接受 http(s)**：见 3.6。embed 与附件的 `href` / `src` 同样只接受 http(s)（`safeHttpUrl`，见 3.12）。新增任何会生成 `href` / `src` 的地方，都要先校验协议，再 `escapeHTML`。
9. **通知正文是纯文本**：`notify` 的 `title` / `body` 不做 HTML 转义，原生原样交给系统通知显示；它们永远不能被写进 `innerHTML`（见 3.11）。

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

# 5. 前端冒烟测试（需要 Node 18+，见 5.4）
make test
```

**`make build` 做了什么**（v1.2.0）：`clang -fmodules -fobjc-arc -framework Cocoa -framework WebKit -framework Security -framework UserNotifications -O2 -Wall` 编译 `src/main.m`（`Security` 用于 Keychain，见 3.10；`UserNotifications` 用于系统通知，见 3.11），再拷入 `Info.plist`、图标和 `web/*`，最后执行 `codesign --force --deep --sign - DiscordLight.app` 做 ad-hoc 签名（没有签名身份；`|| true`，签名失败不会让构建失败）。签名必须是最后一步，因为它会封存包内的文件，之后再往包里拷东西签名就失效了。ad-hoc 签名能降低把 App 打成 zip 分享给别人时出现“已损坏”提示的概率，但它不是正式签名与公证（正式签名与公证仍在规划中）；副作用是每次重新编译签名都会变，Keychain 会重新询问访问权限（见 3.10）。

**双击构建：`scripts/build-and-run.command`**。在 Finder 里双击（或在终端运行）即执行 `make build && make install`，然后重新启动 `/Applications/DiscordLight.app`。输出写到 `scripts/last-build.log`，构建失败时先看这个文件；它被 `.gitignore` 里的 `*.log` 忽略，不会被提交。

**资源采样：`scripts/run-debug.command`**。前台运行 `/Applications/DiscordLight.app` 90 秒，每隔一段时间记录宿主进程的 RSS 与 CPU（`ps`），把 stderr 写到 `scripts/last-stderr.log`，并列出 `~/Library/Logs/DiagnosticReports` 里最新的 DiscordLight 崩溃报告，结果在 `scripts/last-run.log`。改了 `main.m` 之后跑一次，确认没有崩溃、内存不随轮询增长。

### 5.3 调试方法
1. **控制台查看**：
   在应用中任意空白区域**右键 -> 检查元素**，即可打开 WebKit Web Inspector 查看 Console 日志、DOM 节点、Network 请求。
2. **热重载测试**：
   修改 `web/` 下的 HTML/CSS/JS 后，可直接在开发者工具中按 `Cmd + R` 刷新，无需重新编译 Objective-C 宿主。
   **`src/main.m` 的改动不会热重载**，必须 `make build && make install` 后重新打开应用（窗口样式、拖拽条、导航策略、`getConfig` / `saveConfig` 的字段都属于这一类）。
3. **无头冒烟测试**：
   前端只通过 `window.webkit.messageHandlers.discordBridge` 与原生通信，所以可以在普通浏览器里把它替换掉来测试，不需要启动 App，也不需要真实 token。这套脚本已收进仓库的 `tests/` 目录，改完前端跑 `make test`，详见 5.4。
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

### 5.4 冒烟测试 (`tests/`)
- **只供开发**：`Makefile` 只把 `web/*` 拷进 App 包，`tests/` 永远不会出现在 `DiscordLight.app` 里；生产代码也不依赖 Node。
- **原理**：Playwright 在无头 Chromium 里打开 `web/index.html`，页面脚本运行前注入假的 `discordBridge`（每次调用记进 `window.__calls`，按 `action` 返回固定数据）。不启动 App、不需要 token、不访问 Discord。
- **运行**（Node 18+）：
  ```bash
  # 首次（在仓库根目录执行）
  (cd tests && npm install && npx playwright install chromium)
  # 之后每次
  make test        # 等同于 cd tests && npm test
  ```
  `npm test` 运行 `tests/smoke/run-all.cjs`，依次跑八个套件，最后打印每个套件一行汇总，任何一个失败退出码就非 0。单个套件可以直接 `node tests/smoke/run-ui.cjs [web 目录]`。
- **套件**：`ui`（侧栏、搜索、注入防护、审批卡片、Touch Bar payload、空状态与首次引导）、`links`（Command 快捷键、链接按钮）、`mentions`（智能体与群聊成员的划分：Touch Bar 的 `bots` / `members` 与输入框芯片，见 3.2）、`polling` 与 `polling-edge`（3.9 的轻量轮询）、`notify`（3.11 的系统通知与 Dock 角标：`notify` / `setBadge` 的调用与 payload、`setAppFocused`）、`content`（3.12 的 embed、附件、下拉选择占位与 `before` 向上翻历史）、`fuzz-markdown`（30000 条随机恶意输入喂给 `parseMarkdown`）。
- **测不到的部分**：冒烟测试只覆盖前端。Keychain、系统通知的实际显示、Dock 角标、通知点击这些原生行为，需要 `make install` 后用安装好的应用手动验证（AGENTS.md 第 8 条）。
- **截图**写到 `tests/smoke/.shots/<套件>/`（已 gitignore）。失败时打印 INFO（实测数值），`DL_TEST_VERBOSE=1` 时通过也打印。
- 轮询套件把间隔缩短到 150 ms 测计时，机器负载很高时可能误报，重跑一次再判断。加用例的方法见 `tests/README.md`。

### 5.5 应用图标
图标是原创图形（石墨色圆角方块 + 琥珀色闪电），取代了之前基于 Discord 标志的图标（商标风险）；旧图标仍在 git 历史里。三个文件都由脚本生成，只依赖 Pillow + numpy：
```bash
python3 assets/make_icon.py                    # 重新生成 assets/AppIcon.png、AppIcon.icns、touchbar_icon.png
python3 assets/make_icon.py --preview /tmp/dl  # 另外把预览拼图和 18px 参考图写到 /tmp/dl（不要写进仓库）
```
脚本是确定性的，重复运行得到逐字节相同的文件；它会把生成的 ICNS 重新解析一遍并打印校验结果。改配色或闪电形状就改脚本顶部的常量，然后重新运行并 `make build`。

---

## 6. 后续演进建议与待办事项 (Roadmap & Backlog)

### 6.1 当前已知限制（v1.2.0）
- **没有 Gateway**：所以没有“正在输入”、在线状态和未读标记；别人编辑消息要等下一次 resync 才看得到（可见时最多约 30 s，后台最多约 3 min，见 3.9）。
- **系统通知只覆盖当前打开的频道**：只有当前频道在轮询，其他频道、其他私信里的 @ 和消息都不会通知，也不计入 Dock 角标（见 3.11）。要覆盖所有频道，需要先完成下方第 1 项 Gateway。
- **点击来自线程的通知打不开线程**：`switchChannelById` 只在关注列表、私信、多人群聊和已加载的服务器频道里找，线程 id 不在其中（已关注的线程除外），点击后只会把窗口提到前面（见 3.11）。
- **Masked link（`[文字](url)`）还不解析**：方括号原样显示，只有括号里的 URL 变成链接（见 3.12）。
- **整页重载的滚动位置**：没有向上翻过历史时，发送消息后、点普通按钮后的刷新、Touch Bar 刷新都会重新只取最新 40 条，往上看的位置保不住；轮询发现可能有缺口时（`pollReloadNewest`），即使翻过历史也会丢掉已翻出来的部分（见 3.9、3.12）。
- **窗口拖动只靠原生的 240×38 拖拽条**（侧栏顶部，双击缩放），聊天区顶栏不能拖（见 3.7）。
- **浅色模式未实现**：颜色 Token 已经就绪（见 3.5），缺的是浅色取值与原生外观切换。
- **Discord 服务条款风险不变**：用用户 token 驱动的第三方客户端本身就有被 Discord 限制或封号的风险，v1.2.0 没有改变这一点。

### 6.2 后续规划
为后续接手该项目的工程师提供以下规划参考：

1. **Gateway WebSocket 长连接（方案）**
   - 原生层用 `NSURLSessionWebSocketTask`（macOS 10.15+，与当前最低系统版本一致，不需要第三方库）连接 Gateway v10，`main.m` 负责连接与协议，前端不直接接触 token。
   - 收到 `HELLO` 后按 `heartbeat_interval` 发心跳（首次加随机抖动），检查 `HEARTBEAT_ACK`，超时就断开重连。
   - 首次连接发 `IDENTIFY`；保存 `session_id`、`resume_gateway_url` 和最新序号 `s`，断线后先 `RESUME`，收到 `INVALID_SESSION` 再重新 `IDENTIFY`。
   - 只转发前端需要的事件：`MESSAGE_CREATE` / `MESSAGE_UPDATE` / `MESSAGE_DELETE`，通过 `evaluateJavaScript:` 调用前端的新入口（例如 `window.onGatewayEvent(type, payload)`，JSON 照样过 `JSSafeJSON()`），前端按当前频道合并进 `state.messages`，复用 3.9 的去重与 `MAX_MESSAGES`。
   - 连接正常时把轮询降到很低的频率，只保留 resync 作为兜底；连接断开或多次重连失败时回到现在的轮询（3.9），状态栏写明当前模式。
   - 需要声明的 intents、事件的字段以 Discord 官方 Gateway 文档为准；这是计划，尚未实现。
2. **通知与声音增强**
   - v1.2.0 已接入 `UNUserNotificationCenter` 系统通知与 Dock 角标，但只覆盖当前打开的频道（见 3.11、6.1）。接上第 1 项 Gateway 后，可以对所有频道的 @ 与私信发通知；通知点击时能解析线程 id。
3. **下拉选择与 Modal 组件支持**
   - 当前已支持按钮（Button Components）；下拉选择菜单目前只显示为禁用的占位按钮（见 3.12）。后续可扩展为真正可选的 Select Menu（下拉选框）以及 Modal 文本输入弹窗。
4. **多账号快速切换**
   - 允许在配置中保存多个 Token，在设置菜单中实现一键无缝热切换。
5. **浅色模式 / 跟随系统外观**
   - 颜色已全部走 CSS 变量，补一套浅色取值加 `prefers-color-scheme` 即可；原生侧目前把窗口外观固定为 Dark Aqua，需要一并放开。
6. **系统强调色**
   - 通过 bridge 把 `NSColor.controlAccentColor` 传给前端，覆盖 `--accent` 系列变量，让强调色跟随系统设置。
7. **侧栏毛玻璃**
   - 侧栏下方垫 `NSVisualEffectView`，并把 `WKWebView` 设为透明背景，得到原生的 vibrancy 效果。
8. **Embeds 渲染**（v1.2.0 已完成，见 3.12）
   - embed 与附件已渲染，审批卡片正文里也会显示 embed。剩下的是 masked link（`[文字](url)`）的解析（见 6.1）。
9. **未读标记**
   - 侧栏的未读点 / 未读计数依赖实时事件，需要先完成第 1 项 Gateway。
10. **时区与日期**
    - 时间现在按本地时区显示（`fmtTime`），但只有 `HH:MM`；跨天的消息还没有日期分隔线。
11. **内存管理**
    - 已切到 ARC（见 3.7）。后续可用 Instruments（Leaks / Allocations）跑一轮长时间使用，确认 WebKit 内容进程那一侧也没有累积。
12. **向上翻历史**（v1.2.0 已完成，见 3.12）
    - `before` 分页、400 条上限、锚定滚动位置都已实现。剩下的是轮询发现缺口时（`pollReloadNewest`）保住已翻出来的历史（见 6.1）。

---

## 7. 常见问题排查 (Troubleshooting FAQ)

- **Q: 为什么输入某个名字找不到好友或机器人？**  
  A: 部分 Bot 在 Discord 中使用数字或特殊别名（如纯数字 ID、无 `global_name` 的机器账户），输入框的 `@` 补全同时支持按显示名、`username`、`id` 以及 `KNOWN_BOTS` 里登记的别名检索；侧栏全局搜索按群名、成员显示名（`global_name`）、`username`、频道名和服务器名检索（不按 id）。确保该 Bot 曾在当前频道的消息或私信列表中出现过。
- **Q: 为什么 Touch Bar 没有显示？**  
  A: 确保在配备物理 Touch Bar 的 MacBook Pro 机型上运行，或在系统设置 -> 键盘 -> 触控栏显示设置为“App 控制”。若在虚拟机/无 Touch Bar 设备上，Touch Bar 逻辑将安全静默跳过，输入框下方的智能体快捷按钮仍可正常工作。
- **Q: 重新拉取代码后配置丢了吗？**  
  A: 不会。配置存放在用户家目录 `~/.config/discordlight/config.json`，token 存在 macOS 钥匙串里（见 3.10），都与 Git 代码目录解耦。
- **Q: 每次重新编译安装后，启动时都弹窗问能不能访问钥匙串？**  
  A: 这是 ad-hoc 签名的预期行为：每次编译签名都会变，钥匙串把新版本当成另一个程序（见 3.10、5.2）。选“始终允许”即可。开发时频繁重编译，可以用 `DISCORD_TOKEN` 环境变量启动，这条路径不碰钥匙串。
- **Q: 被 @ 了却没有系统通知？**  
  A: 先确认消息在当前打开的频道里，并且窗口当时不在前台（只有当前频道在轮询，窗口是 key window 且可见时不发通知）。其余排查步骤见 3.11 的“横幅一直不出现时”。
- **Q: 为什么旧版关注的频道名前面有图标残留 / 图标不对？**  
  A: 旧版把 emoji 写进了 `pinned_channels`（`icon` 字段和名字前缀）。新版在显示时会自动剥掉这些前缀并换成描边图标（见 3.8 的“旧版关注数据的兼容”），正常情况下不需要手动处理。如果某一条仍然不对，取消关注再重新关注一次，它会按新格式（`icon: "channel" | "group" | "dm" | "thread"`）保存。改动相关正则时务必保留 `u` 标志。
- **Q: 为什么窗口拖不动 / 拖拽条在哪？**  
  A: 标题栏是隐藏的，可拖动区域是侧栏最上方 240×38 的那一条（红绿灯所在的一带，搜索框上方），双击它可以缩放窗口。聊天区顶栏不能拖动。如果这一条也拖不动，检查 `main.m` 里的 `DLDragStripView` 是否仍加在 `WKWebView` 之上，以及它的尺寸是否与 CSS 的 38px 留白一致（见 3.7）。
- **Q: 点击消息里的链接没有在应用内打开？**  
  A: 这是有意为之。带 bridge 的 WebView 不加载任何外部页面，http(s) 链接一律交给系统浏览器（见 4.3）。
- **Q: 为什么窗口在后台时消息来得慢了？**  
  A: 这是有意的降频。窗口完全被遮挡、最小化、在别的桌面或应用被隐藏时，轮询从每 2.5 s 一次降到每 15 s 一次，侧栏底部状态显示 `已连接 · 后台低频`。窗口一回到前台就立即拉取一次并恢复 2.5 s（见 3.9）。如果窗口明明在前台却一直显示“后台低频”，检查 `main.m` 里窗口的 delegate 是否仍是 `AppDelegate`，以及 `windowDidChangeOcclusionState:` 是否还在调用 `window.setAppVisible`。
- **Q: 仓库的 `.git/` 下多了一个 `stale-tmp/` 目录？**  
  A: 通过 Claude 的设备 shell 提交时，git 留下的锁文件 / 临时文件会被挪到 `.git/stale-tmp/`。里面没有任何需要保留的东西，可以直接删除：`rm -rf .git/stale-tmp`。

---

## 8. 变更记录 (Changelog)

### v1.2.0 (2026-10-08)
- **Embeds 与附件**。embed 渲染为卡片（颜色边框、作者、标题链接、Markdown 描述、两列字段、缩略图、大图、页脚与时间；每条最多 4 个 embed、每个最多 10 个字段）；只有图片的 `image` / `gifv` embed 只显示图片；审批卡片正文里也显示 embed。附件中的图片按比例缩进 400×300、懒加载、走 Discord 媒体代理地址，其他文件显示为带大小和下载链接的文件行（每条最多 10 个）。所有 `href` / `src` 只接受 http(s)；图片加载完成后视图保持贴底（见 3.12）。
- **向上翻历史**。`fetchMessages` 新增可选的 `before`（只接受数字，与 `after` 二选一）；滚到顶部附近时按 40 条一页往前翻，保持锚点不跳，列表上方显示载入状态；翻过历史后上限从 100 条放宽到 400 条；增量轮询与 resync 不丢已翻出来的历史，刷新在能接上当前最新消息时也保留（轮询发现缺口而整页重载时除外）（见 3.9、3.12）。
- **系统通知与 Dock 角标**。窗口不在前台或看不见时，轮询新到的消息里 @ 了自己 / @everyone、私信与多人群聊消息、审批请求会发系统通知（每次轮询最多 5 条），Dock 角标计数，窗口获得焦点时清零；点击通知打开对应频道（含未关注的多人群聊）。新增 bridge action `notify` / `setBadge`，原生调用 `window.setAppFocused`（见 3.11）。
- **Token 存进 Keychain**。查找顺序改为 `DISCORD_TOKEN` → Keychain → 旧版 `config.json`（自动迁移并从文件删除）；`saveConfig` 的 token 只写 Keychain；新增 bridge action `clearToken`（见 3.10）。
- **下拉选择菜单**显示为禁用的占位按钮，不再被渲染成可点的按钮，也不参与审批判定（见 3.12）。
- **修复**：`messagesSignature` 计入 embed 与附件数量，Discord 事后补上的链接预览在下一次 resync 时就会显示（之前因为 `edited_timestamp` 不变而一直不重绘）。
- **修复**：中文等输入法打字时，用来确认候选词的 Enter（以及 WebKit 在 `compositionend` 之后紧跟着送出的那个 Enter）会把消息直接发出去。`handleInputKeyDown` 现在在 `isComposing` / `keyCode 229` / 组合输入进行中、以及 `compositionend` 后 150 ms 内一律不发送（`compositionstart` / `compositionend` 监听在 `bindEvents`），冒烟测试里有对应断言。
- **修复**：首次引导弹窗的文案改为"Token 只保存在本机的 macOS 钥匙串"。
- **版本号**：`Info.plist` 升到 1.2.0（build 3），并加入 `NSUserNotificationAlertStyle`（banner）与 `LSApplicationCategoryType`。
- **构建**：Makefile 新链接 `Security` 与 `UserNotifications` 框架，构建最后一步做 ad-hoc 签名（`codesign --sign -`）（见 5.2）。
- **冒烟测试**：新增 `notify` 与 `content` 两个套件，共八个（见 5.4）。
- **CI**（`.github/workflows/ci.yml`）：推送到 main 或向 main 提 PR 时，`ubuntu-latest` 上跑八个冒烟测试套件（`tests/` 还没有 lockfile，所以 `npm ci` 失败时退回 `npm install`；失败时把 `tests/smoke/.shots/` 作为 artifact 上传），`macos-14` 上跑 `make build`。
- **发布**（`.github/workflows/release.yml` + `scripts/package.sh`）：推送 `v*` tag 时在 `macos-14` 上构建 universal（arm64 + x86_64）App，`MACOSX_DEPLOYMENT_TARGET` 取自 `Info.plist` 的 `LSMinimumSystemVersion`，ad-hoc 签名后打成 `DiscordLight-<tag>-macOS.zip` / `.dmg` 和 `SHA256SUMS.txt`，发到 GitHub Release。编译命令仍只在 Makefile 里：universal 是在 PATH 最前面放一个加 `-arch` 的 `clang` 包装再跑 `make build`。本地也能运行（`scripts/package.sh [tag]`，`ARCHS=` 只编当前架构）；产物已加入 `.gitignore`。
- **社区文件与截图**：`CONTRIBUTING.md`、`SECURITY.md`、`.github/ISSUE_TEMPLATE/`、`.github/PULL_REQUEST_TEMPLATE.md`；README（中英文）重写，资源占用改为实测数字（约 120 MB、CPU 0.1–1.2 %，测法见 README）。README 截图由 `node docs/make-screenshots.cjs` 用假 bridge 和虚构数据生成（`docs/screenshot-main.png`、`docs/screenshot-approval.png`）。

### v1.1.0 (2026-10-08)
- **设计重做（Graphite Console）**。原生 macOS 深色主题与设计 Token；全套单色描边图标（移除界面中的 emoji）；人类圆形 / 智能体圆角方形头像；“智能体”标签；审批卡片；连接状态移到侧栏底部；隐藏标题栏并加入原生拖拽条（见 3.5 – 3.7）。
- **侧栏 v2**。三个标签页换成一个列表里的三个可折叠分组（常用关注 / 群聊与私信 / 服务器），折叠状态持久化；服务器选择器移入“服务器”分组；`⌘K` / `⌘F` 聚焦搜索（只认 Command，`Ctrl+K` / `Ctrl+F` 留给文本编辑），搜索框支持 `Esc` / `Enter`（见 3.8）。
- **安全加固**。消息内容先转义再做 Markdown；移除所有拼接数据的内联 `onclick`，改为 `data-act` 委托监听；`getConfig` 不再返回 token；新增导航策略，外部链接交给系统浏览器；Touch Bar 调用前端时对参数做 JSON 编码；新增安全的 URL 自动链接；Discord 链接按钮（style 5）渲染为只接受 http(s) 的普通链接，不再被当成交互按钮；调试用的 `com.discordlight.test` eval 入口改为仅在设置 `DISCORDLIGHT_DEBUG` 时注册；`respondToJS` 校验回调名并转义 U+2028 / U+2029（见 4.3）。
- **轻量轮询**。`fetchMessages` 新增可选的 `after`（只接受数字）；轮询改为 `after` 增量请求，空回答不做 DOM 工作；每第 12 次轮询做一次 `limit: 15` 的 resync，只在 id / `edited_timestamp` / 按钮 `disabled` / 线程信息变化时重绘；前台 2.5 s、后台 15 s（原生遮挡 / 隐藏通知 + `visibilitychange` 后备），回到前台立即 resync；引导弹窗打开时不轮询；同一时间只有一个轮询，切换频道后丢弃旧回答；可能有缺口时整页重载；内存最多 100 条；状态栏显示 `已连接` / `已连接 · 后台低频`（见 3.9）。
- **原创图标**。石墨色圆角方块 + 琥珀色闪电，取代基于 Discord 标志的旧图标（商标风险），`assets/make_icon.py` 可重新生成；旧图标保留在 git 历史里（见 5.5）。
- **冒烟测试**。新增仅供开发的 `tests/`（Playwright + 假 bridge，六个套件），`make test` 一键运行（见 5.4）。
- **构建与采样脚本**。新增 `scripts/build-and-run.command`（双击构建、安装并重启应用）和 `scripts/run-debug.command`（前台运行 90 秒采样 RSS/CPU、抓崩溃报告），日志写入 `scripts/*.log`（见 5.2）。
- **Bug 修复**。消息时间由 UTC 改为本地时间；清洗旧 emoji 前缀的正则补上 `u` 标志（之前会把名字里的 emoji 截成半个字符）；首次保存 token 后事件监听被重复绑定的问题；评审中把 autorelease 的 `NSCharacterSet` 缓存进 `static` 导致的 `EXC_BAD_ACCESS` 崩溃已撤回；随后把 `main.m` 整体切到 ARC，修掉了 bridge 回调与 Touch Bar 的内存泄漏（见 3.7）。
- 修复：群聊成员被当作智能体显示在 Touch Bar 与输入框芯片里；智能体与成员分开，兜底的 `KNOWN_BOTS` 只在服务器频道启用。Touch Bar 新增 `@ 成员` 抽屉，`updateTouchBar` payload 新增 `members`（见 3.2）。

### v1.0.0 (2026-10-07)
- 首个交接版本。

---

*文档完结，祝开发顺利！*
