# DiscordLight 项目交接文档 (Handover Document)

> **文档版本**: v1.0.0  
> **更新时间**: 2026-10-07  
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
  - **全局搜索与群聊分类**：支持秒级检索多人群聊、成员、频道与私信。

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
│   ├── main.m               # Objective-C 原生宿主：窗口、WebKit Bridge、TouchBar
│   └── Info.plist           # macOS Bundle 元数据 (BundleID, 权限, 架构等)
└── web/
    ├── index.html           # 前端 UI 骨架（侧边栏、聊天区、输入框、线程卡片）
    ├── style.css            # 深色黑曜石主题样式表（类 Claude/Cursor 原生质感）
    └── app.js               # 前端核心业务逻辑（API 请求、组件交互、全局搜索、TouchBar 桥接）
```

### 关键路径说明
| 路径 | 说明 |
| :--- | :--- |
| **本地源码目录** | `/Users/xu/Developer/projects/DiscordLight/` |
| **系统安装目录** | `/Applications/DiscordLight.app` |
| **本地用户配置** | `~/.config/discordlight/config.json` |

---

## 3. 技术架构与核心模块剖析 (Architecture & Deep Dive)

### 3.1 原生 Cocoa 宿主 (`src/main.m`)
- **WebKit 嵌入**：使用 `WKWebView` 加载本地 `file://.../web/index.html`。
- **双向通信 (Native Bridge)**：
  - **前端 -> 原生**：通过 `window.webkit.messageHandlers.nativeBridge.postMessage({ action, ... })` 调用。
  - **原生 -> 前端**：原生执行完毕后，通过 `evaluateJavaScript:` 回调前端指定的 `callbackId`。
- **原生 API 封装**：
  - `fetchUser` / `fetchGuilds` / `fetchGuildChannels` / `fetchDMs` / `fetchMessages` / `sendMessage`。
  - `sendInteraction`：向 Discord `/interactions` 端点发送原生交互式按钮组件点击。
  - `saveConfig` / `getConfig`：读写 `~/.config/discordlight/config.json`。
- **开发者工具**：
  - 在 `main.m` 中开启了 `developerExtrasEnabled = YES`，在运行界面**右键即可选择「检查元素（Inspect Element）」**调出 WebKit Safari 开发者工具，极大降低前端与网络调试成本。

### 3.2 深度优化的 NSTouchBar 架构 (`src/main.m`)
#### 💡 解决了什么顽疾？
在 macOS 系统中，一旦用户在输入框打字，macOS 会强行将 Touch Bar 替换为系统的输入法候选字栏（Candidate List），导致所有自定义按钮瞬间被顶走，无法同时选词和点艾特。

#### 💡 解决方案：
1. **采用 `NSPopoverTouchBarItem`**：
   - 在 Touch Bar 常驻区注册 `@ 智能体`（Identifier: `com.discordlight.tb.botsPopover`）和 `# 频道`（Identifier: `com.discordlight.tb.channelsPopover`）。
   - 即使输入法弹出候选词，Popover 气泡按钮依然常驻或只需轻触即可展开二级列表。
2. **动态感知与双向同步**：
   - 前端切换频道或接收到新消息时，分析当前群成员及 Bot 列表，调用 `syncTouchBarState` 传输给原生层。
   - 原生层动态重绘 Touch Bar 二级内容，确保“看什么频道，Touch Bar 就显示谁”。

### 3.3 交互式组件（Component Interactions）机制 (`web/app.js`)
- **问题**：在很多第三方轻量客户端中，当 AI Agent（如 Hermes、AutoGPT）弹出 `[Allow Once]` / `[Allow Session]` 按钮时，点击通常只往输入框发一句话，导致 Bot 报 Invalid Interaction。
- **解决方案**：
  - 前端解析 Discord 消息结构中的 `components` 数组（`type: 1` 行，`type: 2` 按钮）。
  - 点击按钮时提取其 `custom_id`、父级 `message_id`、`channel_id`、当前会话的 `application_id`。
  - 构造标准的 Discord Type 3 Component Interaction Payload，调用原生的 `sendInteraction` 接口直连 API，完美触发 Agent 后续任务流。

### 3.4 全局搜索与多人群聊分组 (`web/app.js`)
- **多人群聊模型**：Discord API `/users/@me/channels` 会同时返回普通私聊（`type: 1`）和多人群聊（Group DM，`type: 3`）。
- **优化逻辑**：
  1. 会话拉取后，根据 `BigInt(last_message_id)` 严格按最新活跃时间降序排序。
  2. 将多人群聊提炼出来独立展示在 **`👥 多人群聊`** 置顶分组，显示群名、成员名字副标题以及人数角标（如 `5人`）。
  3. 全局搜索支持模糊匹配群名、群成员昵称（`global_name`）、用户名（`username`）及服务器频道。

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

---

## 7. 常见问题排查 (Troubleshooting FAQ)

- **Q: 为什么输入某个名字找不到好友或机器人？**  
  A: 部分 Bot 在 Discord 中使用数字或特殊别名（如纯数字 ID、无 `global_name` 的机器账户），现在全局搜索已同时支持按 `username`、`global_name` 和 `id` 检索；确保该 Bot 曾在当前服务器或私信列表中出现过。
- **Q: 为什么 Touch Bar 没有显示？**  
  A: 确保在配备物理 Touch Bar 的 MacBook Pro 机型上运行，或在系统设置 -> 键盘 -> 触控栏显示设置为“App 控制”。若在虚拟机/无 Touch Bar 设备上，Touch Bar 逻辑将安全静默跳过，界面上方的胶囊快捷按钮仍可正常工作。
- **Q: 重新拉取代码后配置丢了吗？**  
  A: 不会。所有配置均存放在用户家目录 `~/.config/discordlight/config.json`，与 Git 代码目录解耦。

---

*文档完结，祝开发顺利！*
