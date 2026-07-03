# Multiagent 开发交接文档（公司电脑 → 家里电脑）

- 日期：2026-07-03
- 写给：家里电脑上的 Claude Code / Codex（一个全新的、没有本会话上下文的 coding agent）
- 前置阅读（都已在本目录内，git pull 即得）：
  - [supernono-v1-closeout-and-multiagent-strategy.md](./supernono-v1-closeout-and-multiagent-strategy.md) — 战略评审 + Phase 0-4 roadmap + 任务拆分（T0.x/T1.x/T2.x 编号以此文档为准）
  - [multiagent-work-assistant-prd.md](./multiagent-work-assistant-prd.md) — multiagent 产品 PRD
  - [../supernono-signal-protocol.md](../supernono-signal-protocol.md) — 统一信号协议 v0.1.0

---

## 1. 当前项目状态

### v1.0 桌宠（已定版，冻结）

- SuperNoNo 是 Electron 透明常驻小窗桌宠 + 本地事件桥（`127.0.0.1:4174`）+ agent-neutral 信号协议。
- **Codex plugin hooks 是真实接入，不是 demo**：官方 `PreToolUse` / `PostToolUse` / `PermissionRequest` plugin hooks 已在真机 Codex Desktop 端到端验证（`command_running` / `step_done` / `permission_required`，adapter 标识 `codex-plugin-hooks`）。踩坑记录在 [../2026-07-01-codex-plugin-hooks-handoff.md](../2026-07-01-codex-plugin-hooks-handoff.md)（`${PLUGIN_ROOT}` 展开、Windows 绝对 node 路径、`shell_command|Bash` matcher 三个根因）。
- **notify wrapper 是 turn-level fallback，不是主链路**：包装 Codex 的 `notify` 程序，每回合发一条粗粒度 `turn_ended`（adapter `codex-desktop-notify`），无 per-tool 信息，无 sessionId。保持 fallback 定位，不要试图从它榨细粒度事件。
- v1.0 收尾状态（对照战略文档 Phase 0 的 T0.1–T0.4）：
  - ✅ T0.1 打包卫生（`notify-wrapper.config.json` / `notify-observed.json` 等本机文件已从 zip 排除，见 `tools/package-win-portable.js` 的 excludedAppFiles）
  - ✅ T0.4 README / release 文档收口
  - ❌ T0.2 桥接安全加固（Origin/Host 校验 + openPath 防护）**未做**
  - ❌ T0.3 公开构建资产门禁（剔除 Live2D nono 模型的 `--public` 构建）**未做** — 公开发布前仍是 P0
- 已打 tag `v1.0.0`，v1.0 相关提交在 `main`（tip: `ac8b87b`）。

### v2/multiagent-work-assistant 分支（当前工作线）

Phase 1 Multiagent Core 已完成并推送（commit `2b26ac8 Add multiagent core state store`）：一个 SuperNoNo 可同时接收多个 agent/session 的事件，按 attention priority 决定宠物本体关注谁，面板显示 agent cards + timeline。**Claude Code adapter 尚未开始（Phase 2）**。

---

## 2. Git 信息

- **继续工作的分支：`v2/multiagent-work-assistant`**（已推送，本地与 origin 同步于 `2b26ac8`）。
- 远程：`https://github.com/JunweiHu0/codex-task-pet.git`
- `main` = v1.0 定版线（tip `ac8b87b`，tag `v1.0.0`）；v2 分支包含 main 的全部历史。

家里电脑：

```powershell
# 首次
git clone https://github.com/JunweiHu0/codex-task-pet.git
cd codex-task-pet
git switch v2/multiagent-work-assistant

# 已有 clone
git fetch origin
git switch v2/multiagent-work-assistant
git pull
```

**已在远程分支里的关键文件**（`2b26ac8` + 本交接 commit）：

- `src/renderer/js/agentStore.js`（新增，multiagent core）
- `src/renderer/js/app.js` / `panel.js` / `pet.js` / `signalAdapter.js` / `index.html` / `styles/panel.css`（multiagent 改造）
- `adapters/shared/manual-multiagent-test.js`（双 agent 验收脚本）
- `docs/multiagent/`（本文档 + 战略文档 + PRD）

**不要依赖的本地文件（没进 Git，家里电脑不会有）**：

- `adapters/codex-desktop/notify-wrapper.config.json` / `notify-observed.json` — gitignored，机器专属运行时状态；家里要用 notify wrapper 需重跑 `node adapters/codex-desktop/install-notify-wrapper.js`
- `dist/` — 构建产物，gitignored
- `.claude/` / `.obsidian/` — 本地工具状态
- 公司电脑上的 Node 冒烟测试脚本在 session scratchpad 里，**没进仓库**（见第 4 节，验证逻辑可从本文档重建）
- `~/.codex` 下的 plugin cache / trust / config.toml — 完全是另一套环境，见第 6 节

---

## 3. Multiagent Core 已完成内容

### agentStore（`src/renderer/js/agentStore.js`，全项目新核心）

职责：位于事件入口（bridge IPC / `SuperNoNo.signal`）与既有单 agent 管线之间的聚合层。**没有重写任何既有逻辑**——每个 agent/session 复用一个 `SN.SignalAdapter` 实例（signalAdapter.js 只加了一行类导出）+ 一份独立 petState（stateEngine 纯函数，零改动）。

隔离规则（`_resolveEntry`）：

| 事件来源 | 路由 |
| --- | --- |
| 无 `agent` 字段（旧事件 / simulator / demo） | `default` 条目（包装既有 `SN.signals` 实例，v1.0 行为逐项不变） |
| `agent` + `sessionId` | `agent:sessionId` 条目，不存在则创建 |
| `agent` 无 `sessionId`（如 notify wrapper） | 该 agent 最近活跃的条目；**settle 事件（`turn_ended`/`idle`/`completed`）跳过 `requiresUserAction` 的会话**；全部会话都在等用户时事件只记 timeline、返回 null（不清任何人的等待授权） |

Attention policy v0（`STATE_RANK`，平级取最近活跃）：

```text
waiting_approval(50) > blocked(40) > building/validating(30)
  > scanning/thinking(20) > completed(10) > idle/resting(0)
```

宠物本体渲染 focus 条目的状态；气泡只为 focus 条目弹，非 default agent 加 `[agent]` 前缀。

其他要点：

- timeline ring buffer 150 条（`getTimeline()`），只存 `{at, agentKey, agent, type, action(≤120字符)}`，不存原始 payload。
- 条目上限 `MAX_AGENTS=12`（桥接对本地进程开放，防滥用）；淘汰只选 rank 0（idle/resting）、非 focused、非 default、**非刚创建**的最旧条目。
- 面板 multiagent 区块（summary / agent cards / timeline）只在出现真实非 default agent 时显示；纯单 agent 场景面板与 v1.0 完全一致。
- 渲染全部走 `textContent`——action 字符串来自外部进程，**永远不当 HTML**。

调试 API（DevTools，`npm start -- --dev`）：

```js
SuperNoNo.getAgents()        // agent 卡片快照（state/attention/focused/lastAction...）
SuperNoNo.getTimeline()      // ring buffer 事件流
SuperNoNo.getFocusedAgent()  // 当前 focus 的 agentKey，如 'claude-code:cc-s1'
SuperNoNo.signal(type, payload) // payload 可带 agent/sessionId 定向到某条目
```

---

## 4. 已验证内容（2026-07-03，公司电脑）

1. `node --check` 全部新增/修改 JS 通过。
2. **Node 逻辑冒烟测试 28 项断言全过**（store+engine+adapter 可直接在 Node 加载，无 DOM）：状态隔离、permission_required 立即夺焦、command_running/turn_ended/completed 不覆盖等待授权、resolved 后 focus 回落、tick 衰减、unknown 事件不崩溃。
3. **两个边界修复各有回归测试（20 项断言全过）**：
   - 淘汰边界：13+ agent/session 时新条目不会在收到第一条事件前被淘汰（`_evictIfNeeded(protectedKey)`）；受害者是最旧 idle 条目；map 稳定封顶 12。
   - no-session `turn_ended` 保护：codex s1 等待授权、s2 回合结束发无 session 的 turn_ended → 路由到 s2，s1 的 waiting_approval 不被清；全员等待时事件降级为 timeline-only。
4. **端到端**：`npm start` + `node adapters/shared/manual-multiagent-test.js` 9/9 投递、renderer 零报错；旧单 agent 测试 `adapters/codex-desktop/manual-test.js` 5/5。
5. **面板真实 DOM 渲染**（浏览器 demo 模式验证）：双 agent 两张卡片、summary 计数、timeline 正确；单 agent 场景 ma 区块隐藏。

> 冒烟测试脚本在公司电脑的临时目录，没进仓库。如需重建：Node 里依次 `require` `config.js`、`signalAdapter.js`、`stateEngine.js`、`agentStore.js`（它们是挂 globalThis 的 IIFE，无 DOM 依赖），然后对 `SN.agents.handleSignal(...)` 做断言即可。值得作为 Phase 1.1 的一部分把它固化成 `tools/store-smoke-test.js`。

一个已知的继承语义（**不是 bug，别修**）：unknown 事件会按 adapter 仍 live 的 flags 重推可视状态（v1.0 原有行为；约束是不改 signalAdapter/stateEngine 核心逻辑）。

---

## 5. 已知限制

| # | 限制 | 说明 |
| --- | --- | --- |
| 1 | 没有 Claude Code adapter | 测试里的 claude-code 事件全是模拟的协议事件。Phase 2 的事 |
| 2 | multiagent UI 是最小版 | 卡片不可点击、无手动 pin focus、无 staleness 主动提醒（卡片有"N 分钟前"但不会主动报警） |
| 3 | 无本地持久化 | timeline 是内存 ring buffer，重启即失；战略文档判断 MVP 不需要数据库 |
| 4 | 协议文档还是 v0.1.0 | `payload.priority`、sessionId 语义澄清等 v0.2 增量未写入 `docs/supernono-signal-protocol.md` |
| 5 | Codex setup 脚本未产品化 | `plugins/supernono-codex/hooks/hooks.json` 的 `command_windows` 仍硬编码 `C:\PROGRA~1\nodejs\node.exe`，换机器要手动改（见 INSTALL.md） |
| 6 | notify wrapper 不转发 sessionId | probe 证实 payload 有 thread-id/turn-id 但 wrapper 未转发（战略文档 S2），所以 no-session 路由保护才如此重要 |
| 7 | T0.2 / T0.3 未做 | 桥接无 Origin/Host 校验 + `shell.openPath` 无防护（P1 攻击链见战略文档 2.1 M3）；公开构建仍含版权存疑的 Live2D nono 模型（P0，公开发布前必须处理） |

**release/v1.0 与 multiagent/v2 的边界**：`main` = v1.0 定版，只接受 T0.2/T0.3 这类发布修复；`v2/multiagent-work-assistant` = 全部新功能。不要在 v2 分支上继续打磨桌宠 UI / Live2D / 动画 / release 打包；也不要把 multiagent 功能 cherry-pick 回 main。

---

## 6. 家里电脑环境准备

```powershell
# 1. Node（项目在 Node 20+ / 24 上验证过），npm 可能被 PowerShell 执行策略挡住：
npm.cmd -v          # 如果 npm 报"禁止运行脚本"就用 npm.cmd
# 长期修复：Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

# 2. 装依赖（Electron 下载失败时用镜像，见 docs/codex-plugin-hook-integration-plan.md §16）
npm.cmd install

# 3. 启动桌宠（bridge 起在 127.0.0.1:4174）
npm.cmd start

# 4. 另一个终端跑双 agent 验收（9 步交错事件，带 ★ 的三步宠物必须保持"等待授权"）
node adapters/shared/manual-multiagent-test.js
```

**如果要测真实 Codex hooks**：家里电脑的 `~/.codex` 是另一套环境，plugin 安装 / trust / cache 全部要重来——按 [plugins/supernono-codex/INSTALL.md](../../plugins/supernono-codex/INSTALL.md) 走 `codex plugin marketplace add` + `codex plugin add`，**先检查家里的 Node 安装路径**并改 `hooks.json` 每个 `command_windows` 的绝对路径，然后在 Codex Desktop 里跑一次任务批准 hook trust。notify wrapper 同理需重新 `node adapters/codex-desktop/install-notify-wrapper.js`（它会备份 config.toml）。**Phase 2 工作不依赖这一步**——multiagent core 用 manual test 即可驱动。

---

## 7. 下一步任务（按优先级）

| 优先级 | 任务 | 内容 | 对应战略文档 |
| --- | --- | --- | --- |
| 1 | **Phase 2.1 Claude Code hooks probe** | 半天诊断实验：确认家里 Windows 环境下 Claude Code hooks（PreToolUse/PostToolUse/Notification/Stop）的 stdin 字段、cwd、PATH 里有没有 node（Codex 那次的坑型）。产出 `docs/multiagent/claude-code-adapter-plan.md` 实测记录。**只写 probe 和文档，不写正式 adapter** | T2.1 |
| 2 | **Phase 1.1 文档/协议 v0.2** | 协议文档补 `payload.priority`、sessionId 主键语义、settle 事件路由规则（本文档第 3 节的表）、`protocolVersion` 0.2.0；把 Node 冒烟测试固化成 `tools/store-smoke-test.js` | 5.1 节 |
| 3 | **Phase 1.2 multiagent panel 再设计** | 基于真实使用调整卡片信息密度、考虑点击卡片下钻 focused 详情。**等 Phase 2 有真实双 agent 数据后再做，不要现在凭想象改 UI** | T1.4 迭代 |
| 4 | **Phase 2.2 Claude Code adapter MVP** | `adapters/claude-code/`：hooks 脚本 + settings 配置片段 + 安装文档；映射表在战略文档 5.4 节；`session_id` 直接映射 `sessionId`；复用 `adapters/shared/send-signal.js`；不读 transcript / UserPromptSubmit | T2.2 |
| 5 | **Phase 2.3 双 agent 真实并发验收** | Codex + Claude Code 各跑一个真实任务，验证卡片归属、focus 切换 5 秒内、杀掉 SuperNoNo 两个 agent 无感知 | Phase 2 验收 |

顺手可做（不阻塞主线）：S2 notify wrapper 转发 thread-id→sessionId（~10 行，`adapters/codex-desktop/notify-wrapper.js`）；T0.2 桥接安全加固（改 `electron/main.js`，修完可 cherry-pick 回 main）。

---

## 8. 给家里电脑 CC 的第一条任务提示词

复制以下内容直接发给家里电脑的 Claude Code：

```text
请先读这三个文档，读完再动手：
1. docs/multiagent/2026-07-03-multiagent-handoff.md（交接文档，当前状态以它为准）
2. docs/multiagent/supernono-v1-closeout-and-multiagent-strategy.md（第 5.4 节 Claude Code adapter 映射表）
3. docs/supernono-signal-protocol.md（统一信号协议）

确认当前在 v2/multiagent-work-assistant 分支上（git status -sb）。

然后执行 Phase 2.1：Claude Code hooks probe（只做调研验证，不写正式 adapter）。

任务：
1. 新建 adapters/claude-code/probe/ 目录，写一个诊断 hook 脚本：被 Claude Code hook 调用时，
   把自己收到的 stdin JSON 的"字段名和值类型"（绝不记录值本身）、cwd、process.execPath、
   PATH 里是否能找到 node，追加写入 adapters/claude-code/probe/probe-observed.jsonl。
2. 给出把这个诊断 hook 挂到我的 ~/.claude/settings.json 的最小 hooks 配置片段
   （PreToolUse / PostToolUse / Notification / Stop 四类事件），先打印给我确认，
   不要直接改我的 settings.json。
3. 我确认并跑几个真实 Claude Code 任务后，你读取 probe-observed.jsonl，
   产出 docs/multiagent/claude-code-adapter-plan.md：四类事件的实测字段结构（脱敏）、
   session_id 是否存在、Windows 下 node 可执行性结论、以及正式 adapter 的事件映射表
   （对照战略文档 5.4 节）。

限制：
- 不要改 src/renderer 下任何文件，不要动 UI / Live2D / stateEngine / agentStore。
- 不要改 plugins/supernono-codex。
- 不要写正式 Claude Code adapter（那是 Phase 2.2，等 probe 结论）。
- probe 脚本必须永不 throw、绝不记录 prompt/代码/token 内容、SuperNoNo 没运行也不报错。
- 新增文件只放在 adapters/claude-code/probe/ 和 docs/multiagent/ 下。
```
