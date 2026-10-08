# 冒烟测试（tests/）

只供开发使用：`Makefile` 只把 `web/*` 拷进 App，本目录不会进入 `DiscordLight.app`。

## 测的是什么

用 Playwright 在无头 Chromium 里打开 `web/index.html`。页面脚本运行前，先把 `window.webkit.messageHandlers.discordBridge` 换成一个假的 bridge：每次调用都记进 `window.__calls`，按 `action` 返回固定的假数据。**不需要启动 App，不需要 token，也不会访问 Discord**（`run-links` 里被点击的外部链接也由本地拦截应答）。

| 套件 | 文件 | 内容 |
| :--- | :--- | :--- |
| `ui` | `smoke/run-ui.cjs` | 侧栏三个分组、折叠与持久化、服务器选择器、`⌘K` / `⌘F` 搜索、注入防护（转义、自动链接、`data-act` 委托）、审批卡片、线程卡片、Touch Bar payload、空状态 / 加载中 / 首次引导 |
| `links` | `smoke/run-links.cjs` | 搜索快捷键只认 Command；链接按钮（style 5）只接受 http(s)、不触发交互 |
| `polling` | `smoke/run-polling.cjs` | 轻量轮询：`after` 增量轮询、每 12 次的 resync、前台 / 后台间隔、同一时间只有一个轮询、切换频道丢弃旧回答、大量新消息时整页重载、payload 不变 |
| `polling-edge` | `smoke/run-polling-edge.cjs` | 轮询边界：新消息到达时的滚动位置、`after` 与重载竞争时去重、线程回复数变化只重绘一次、最新消息被删除 |
| `fuzz-markdown` | `smoke/fuzz-markdown.cjs` | 30000 条随机恶意输入喂给 `parseMarkdown`，输出只能包含解析器自己生成的标记 |

`smoke/mock-bridge.cjs` 是 `ui` / `links` / `fuzz-markdown` 共用的假 bridge；两个轮询套件需要数字 snowflake id 和支持 `after` 的 `fetchMessages`，各自带了自己的 mock。`smoke/harness.cjs` 负责加载 Playwright、解析 web 目录和输出 PASS / FAIL。

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
