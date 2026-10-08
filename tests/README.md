# 冒烟测试（tests/）

只供开发使用：`Makefile` 只把 `web/*` 拷进 App，本目录不会进入 `DiscordLight.app`。

## 测的是什么

用 Playwright 在无头 Chromium 里打开 `web/index.html`。页面脚本运行前，先把 `window.webkit.messageHandlers.discordBridge` 换成一个假的 bridge：每次调用都记进 `window.__calls`，按 `action` 返回固定的假数据。**不需要启动 App，不需要 token，也不会访问 Discord**（`run-links` 里被点击的外部链接也由本地拦截应答）。

| 套件 | 文件 | 内容 |
| :--- | :--- | :--- |
| `ui` | `smoke/run-ui.cjs` | 侧栏三个分组、折叠与持久化、服务器选择器、`⌘K` / `⌘F` 搜索、注入防护（转义、自动链接、`data-act` 委托）、审批卡片、线程卡片、Touch Bar payload、空状态 / 加载中 / 首次引导 |
| `links` | `smoke/run-links.cjs` | 搜索快捷键只认 Command；链接按钮（style 5）只接受 http(s)、不触发交互 |
| `mentions` | `smoke/run-mentions.cjs` | 智能体与群聊成员分开：`updateTouchBar` 的 `bots` / `members`、输入框芯片（智能体、分隔线、成员）；`KNOWN_BOTS` 兜底只在服务器频道；关注列表里的群聊条目 |
| `polling` | `smoke/run-polling.cjs` | 轻量轮询：`after` 增量轮询、每 12 次的 resync、前台 / 后台间隔、同一时间只有一个轮询、切换频道丢弃旧回答、大量新消息时整页重载、payload 不变 |
| `polling-edge` | `smoke/run-polling-edge.cjs` | 轮询边界：新消息到达时的滚动位置、`after` 与重载竞争时去重、线程回复数变化只重绘一次、最新消息被删除 |
| `notify` | `smoke/run-notify.cjs` | 系统通知与 Dock 角标：打开频道时历史里的提及 / @everyone / 审批请求不通知；窗口失焦或不可见时，@ 自己、@everyone、私信与多人群聊消息、审批请求发 `notify`（标题、纯文本正文、140 字截断、`channelId`、`tag`），自己的消息和普通频道消息不发；窗口聚焦且可见时不发；`setBadge` 计数、`setAppFocused(true)` 清零；每次轮询最多 5 条横幅；resync 与整页重载只通知新 id、只通知一次；`switchChannelById` 能打开未关注的多人群聊；payload 的键不变 |
| `content` | `smoke/run-content.cjs` | 富内容与向上翻历史：embed 卡片（颜色、作者、标题链接、Markdown 描述、两列字段、缩略图、页脚时间、数量上限、注入防护）、审批卡片里只有 embed 的请求、图片附件（懒加载、代理地址、按比例缩放的宽高）、文件行（大小、下载链接）、非 http(s) 地址被拒、下拉选择占位、只改 embed / 附件的编辑在 resync 时重绘、图片加载后保持贴底；`before` 分页（保持锚点、短页即到头、轮询 / resync / 刷新不丢已载入的历史、切换频道重置、迟到回答丢弃、400 条上限） |
| `fuzz-markdown` | `smoke/fuzz-markdown.cjs` | 30000 条随机恶意输入喂给 `parseMarkdown`，输出只能包含解析器自己生成的标记 |

`smoke/mock-bridge.cjs` 是 `ui` / `links` / `mentions` / `content` / `fuzz-markdown` 共用的假 bridge（`links`、`mentions` 和 `content` 在它之后覆盖个别 action；`content` 换成数字 snowflake id、支持 `after` / `before` 的 `fetchMessages`，Discord CDN 图片由本地生成的 PNG 应答）；两个轮询套件和 `notify` 需要数字 snowflake id 和支持 `after` 的 `fetchMessages`，各自带了自己的 mock（`notify` 还应答 `notify` / `setBadge`，并把 `document.hasFocus` 换成返回假，模拟应用在后台启动）。`smoke/harness.cjs` 负责加载 Playwright、解析 web 目录和输出 PASS / FAIL。

## 怎么运行

需要 Node 18 及以上。

```bash
cd tests
npm install                      # 装 playwright（只装在 tests/node_modules）
npx playwright install chromium  # 只需一次
npm test                         # 等同于仓库根目录的 make test
```

- 单独跑一个套件：`node smoke/run-ui.cjs`。web 目录默认是仓库根目录的 `web/`，也可以作为第一个参数传入：`node smoke/run-all.cjs /path/to/web`。
- 全部通过时退出码为 0，否则非 0；最后会打印每个套件的汇总行。
- 截图写到 `tests/smoke/.shots/<套件>/`（已在 `.gitignore` 里）。
- 失败时会打印 INFO（实测数值）；`DL_TEST_VERBOSE=1 npm test` 在通过时也打印。
- 轮询套件里有计时断言（把间隔缩短到 150 ms 来测），机器负载很高时可能误报，重跑一次即可；`run-all` 按顺序逐个运行，不要并行跑多个套件。

## 怎么加一个用例

1. 先看现有套件里有没有合适的位置。断言统一写成 `check("描述", 条件, 失败时要打印的细节)`，最后由 `report(results, info)` 汇总。
2. 需要新的假数据时，改 `smoke/mock-bridge.cjs` 里的 fixture，或者像 `run-links.cjs` 那样在 `mockBridge()` 之后覆盖单个 `action` 的回答（改共享 fixture 会影响其他套件里的计数断言，改完跑一遍 `npm test`）。
3. 新建套件时复制一个现有文件，用 `webDir()`、`indexUrl()`、`shotsDir("<套件名>")`、`launchChromium()`，然后把它加进 `smoke/run-all.cjs` 的 `SUITES`。
4. 测试只能通过假 bridge 与“原生层”交互，不要在测试里放真实 token 或访问 Discord。
