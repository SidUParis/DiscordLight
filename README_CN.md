# DiscordLight ⚡️

面向 AI 开发者与 Agent 工作流的原生超轻量 macOS Discord 客户端。基于 Objective-C Cocoa + WKWebView 构建，**内存占用 < 80 MB，待机 CPU 0%**，彻底告别臃肿的 Electron。

[English](./README.md) | 中文说明

---

## ✨ 核心特性

- **🚀 原生极速，超低资源占用**
  - 内存常驻 **< 80 MB**（对比官方客户端动辄 1.5GB+）。
  - 空闲状态 CPU 占用稳定为 **0%**，极大延长 MacBook 续航，拒绝发热。
  - 原生 macOS 深色黑曜石主题（Dark Aqua）。

- **🎛 深度优化 Touch Bar**
  - **常驻 `@ 智能体` 抽屉（Popover）**：完美解决输入文字时拼音输入法候选栏挤占 Touch Bar 的难题。输入任何文字时，随时轻点 `@ 智能体` 展开频道内所有 Bot，点按即插入艾特并无缝恢复输入法候选。
  - **动态频道 Bot 感知**：切换频道时，Touch Bar 机器人列表与快速艾特按钮实时动态更新。
  - **常用频道切换器**：轻触即在关注频道之间闪电跳转。

- **🤖 真实 Discord 交互式组件（Component Interactions）**
  - 完美支持 Hermes、AutoGPT、Claude 等智能体发送的交互按钮（`type: 3` 组件，如 `Allow Once`、`Allow Session`、`Deny`）。
  - 发送真实的 Discord API interaction 负载（含 Nonce 与 Session ID），绝非向聊天框发送无意义的文字回退。

- **🧵 线程支持与 Agent 极简交互**
  - 自动识别并渲染子线程卡片，实时展示回复数，一键进出线程。
  - 终端风格代码块渲染，支持一键复制代码。
  - `@` 键盘快捷补全，同时支持别名、ID 与原始数字用户名模糊搜索。

- **🔒 100% 本地化与隐私安全**
  - 本地设备直连 Discord API v10，零中转服务器、零遥测、零数据收集。
  - 凭据仅安全保存在本地 `~/.config/discordlight/config.json`，不会上传任何外部服务。

---

## 🛠 系统要求

- macOS 10.15 (Catalina) 或更高版本（完美适配 Apple Silicon M1/M2/M3/M4 与 Intel 芯片）。
- Xcode 命令行工具（终端运行 `xcode-select --install`）。

---

## 🚀 快速开始

### 1. 源码编译

```bash
git clone git@github.com:SidUParis/DiscordLight.git
cd DiscordLight
make build
```

直接安装到系统的「应用程序」目录：

```bash
make install
```

### 2. 配置 Token

DiscordLight 支持两种安全凭据注入方式：

1. **界面首次引导**：首次打开客户端将弹出设置对话框，输入您的 Discord Token，客户端将自动加密存储至 `~/.config/discordlight/config.json`。
2. **环境变量**：
   ```bash
   export DISCORD_TOKEN="你的_discord_token"
   open DiscordLight.app
   ```

---

## 📁 项目架构

```
DiscordLight/
├── Makefile                 # 一键构建与安装命令
├── build.sh                 # 构建脚本
├── src/
│   ├── main.m               # Cocoa 原生宿主、WKWebView 桥接与 NSTouchBar 控制器
│   └── Info.plist           # macOS 应用元数据
├── web/
│   ├── index.html           # 前端 DOM 结构
│   ├── style.css            # 深色黑曜石主题样式表
│   └── app.js               # 客户端逻辑、真实组件交互与 @ 补全
└── assets/
    ├── AppIcon.icns         # 原生圆角应用图标
    └── touchbar_icon.png    # 单色 Touch Bar 图标
```

---

## 📄 开源许可

本项目基于 MIT 协议开源。详见 [LICENSE](./LICENSE)。
