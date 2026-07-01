# SuperNoNo Unified Signal Protocol

**Version:** `0.1.0`
**Transport:** `POST http://127.0.0.1:4174/signal` (loopback only)
**Status:** stable core, additive-friendly

## 1. 概述

这是 SuperNoNo 桌宠的**统一事件协议**。任何本地 agent 只要能发一个 HTTP POST，就能驱动桌宠，
无需理解桌宠内部的状态机、UI 或 Live2D 实现。

协议是 **agent-neutral（与具体 agent 无关）** 的：同一套事件同时服务于

- **Codex**（含 Windows 桌面版 / CLI）
- **Claude Code**
- **Cursor**
- **generic-cli**（任意脚本 / 命令行工具）
- **future custom agents**（未来自定义 agent）

每个 agent 用一个「adapter」把自己的生命周期翻译成本协议里的事件，桌宠端只认协议、不认 agent。
新增一个 agent = 新增一个 adapter，**不需要改桌宠**。

```text
Codex / Claude Code / Cursor / generic-cli / custom agent
        |
        |  (each agent has its own adapter)
        v
   Unified Signal Protocol  ──POST /signal──►  SuperNoNo local bridge
                                                     |
                                                     |  IPC 'sn:signal'
                                                     v
                                            Pet State Engine + UI
```

## 2. 传输层

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 返回 `{ "ok": true, "app": "SuperNoNo", "protocolVersion": "0.1.0" }` |
| `POST` | `/signal` | 发送一个事件 envelope（见下）。成功返回 `{ "ok": true }` |

响应码：

| 场景 | 状态码 |
| --- | --- |
| 事件已接收并转发 | `200` |
| JSON 解析失败 | `400` |
| 缺少 `type` | `400` |
| 请求体超过 64KB | `413` |
| 未知路径 / 方法 | `404` |

**安全边界**（协议实现必须遵守）：

- 只监听 `127.0.0.1`，绝不监听 `0.0.0.0`。
- 只转发状态事件，**绝不执行 payload 里的任何命令**。`command` 字段是给人看的文本，不是给桌宠跑的。
- payload 里优先放文件名 / 命令名 / 摘要，不要放密钥、token、源码正文。
- 桌宠没启动时，发送方连接失败即可，**不能阻塞 agent**。
- 端口可用环境变量 `SUPERNONO_BRIDGE_PORT` 覆盖（默认 `4174`）。

## 3. 事件 Envelope

每次 `POST /signal` 的 body 是一个 envelope：

```json
{
  "type": "file_reading",
  "agent": "codex",
  "adapter": "codex-desktop",
  "sessionId": "sess_2f9c",
  "taskId": "task_1183",
  "payload": {
    "action": "Reading package.json",
    "file": "package.json"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | string | ✅ | 事件类型，见事件目录。缺失返回 400。 |
| `agent` | string | 否 | 事件来源 agent，例如 `codex` / `claude-code` / `cursor` / `generic-cli`。 |
| `adapter` | string | 否 | 具体 adapter 标识，例如 `codex-desktop` / `manual-test`。 |
| `sessionId` | string | 否 | agent 会话 ID，用于区分并发会话。 |
| `taskId` | string | 否 | 任务 ID，用于把同一任务的多条事件关联起来。 |
| `payload` | object | 否 | 事件数据，字段随 `type` 变化，见事件目录。 |

### 3.1 字段归一化（兼容两种来源）

`agent` / `adapter` / `sessionId` / `taskId` 允许放在 **envelope 顶层**，也允许放在 **payload 内**，
两种写法都被接受，**顶层优先**：

```jsonc
// 写法 A：顶层（推荐）
{ "type": "file_editing", "agent": "codex", "adapter": "codex-desktop", "sessionId": "s1", "taskId": "t1", "payload": { "action": "..." } }

// 写法 B：放进 payload（兼容旧 adapter）
{ "type": "file_editing", "payload": { "agent": "codex", "adapter": "codex-desktop", "sessionId": "s1", "taskId": "t1", "action": "..." } }
```

桥接层转发给渲染层时，会把这四个字段统一并入 payload，并派生一个 `source` 字段
（优先级：`payload.source` → `adapter` → `agent` → `"local-bridge"`），方便日志与调试。

## 4. 事件目录

下面列出 M2 的全部事件，均给出完整 envelope 示例，并标注该事件会把桌宠带到哪个可视状态。
（状态映射汇总见第 5 节。）

### task_start — 任务开始 → 桌宠「思考」

```json
{
  "type": "task_start",
  "agent": "codex",
  "adapter": "codex-desktop",
  "sessionId": "sess_2f9c",
  "taskId": "task_1183",
  "payload": {
    "title": "修复登录问题",
    "plan": ["定位问题", "修改代码", "运行测试"],
    "action": "开始分析需求",
    "nextStep": "理解需求并制定计划"
  }
}
```

### plan_ready — 计划已生成/更新 → 桌宠「思考」

```json
{
  "type": "plan_ready",
  "agent": "claude-code",
  "adapter": "claude-code",
  "sessionId": "sess_2f9c",
  "taskId": "task_1183",
  "payload": {
    "plan": ["读取相关文件", "定位错误", "修改实现", "验证"],
    "action": "已制定 4 步计划",
    "nextStep": "按计划开始执行"
  }
}
```

### file_reading — 读取/搜索/理解项目 → 桌宠「扫描」

```json
{
  "type": "file_reading",
  "agent": "cursor",
  "adapter": "cursor",
  "sessionId": "sess_2f9c",
  "taskId": "task_1183",
  "payload": {
    "action": "正在扫描 src/renderer",
    "file": "src/renderer/js/app.js",
    "planAdvance": false
  }
}
```

### file_editing — 编辑文件/生成补丁 → 桌宠「施工」

```json
{
  "type": "file_editing",
  "agent": "codex",
  "adapter": "codex-desktop",
  "sessionId": "sess_2f9c",
  "taskId": "task_1183",
  "payload": {
    "action": "正在修改 Electron 主进程事件桥",
    "file": "electron/main.js",
    "planAdvance": true
  }
}
```

### command_running — 执行普通命令 → 桌宠「施工」（`isTest: true` 时为「验证」）

第一版映射规则：`payload.isTest === true` 按 **test_running（验证）** 处理，否则按 **file_editing（施工）** 处理。

```json
{
  "type": "command_running",
  "agent": "generic-cli",
  "adapter": "manual-test",
  "sessionId": "sess_2f9c",
  "taskId": "task_1183",
  "payload": {
    "command": "npm run build",
    "isTest": false,
    "action": "正在运行 npm run build",
    "planAdvance": false
  }
}
```

### test_running — 运行测试/验证 → 桌宠「验证」

```json
{
  "type": "test_running",
  "agent": "codex",
  "adapter": "codex-desktop",
  "sessionId": "sess_2f9c",
  "taskId": "task_1183",
  "payload": {
    "command": "npm test",
    "action": "正在运行测试",
    "planAdvance": true
  }
}
```

### permission_required — 需要用户授权 → 桌宠「等待授权」

```json
{
  "type": "permission_required",
  "agent": "codex",
  "adapter": "codex-desktop",
  "sessionId": "sess_2f9c",
  "taskId": "task_1183",
  "payload": {
    "command": "npm install",
    "action": "需要批准安装依赖"
  }
}
```

### permission_resolved — 授权已处理 → 清除等待状态，回到之前的相位

```json
{
  "type": "permission_resolved",
  "agent": "codex",
  "adapter": "codex-desktop",
  "sessionId": "sess_2f9c",
  "taskId": "task_1183",
  "payload": {
    "approved": true,
    "resumePhase": "file_editing"
  }
}
```

`resumePhase` 可选值：`thinking` / `file_reading` / `file_editing` / `test_running`。

### blocked — 任务阻塞 → 桌宠「阻塞」

```json
{
  "type": "blocked",
  "agent": "claude-code",
  "adapter": "claude-code",
  "sessionId": "sess_2f9c",
  "taskId": "task_1183",
  "payload": {
    "reason": "缺少 GitHub token 或仓库权限",
    "nextStep": "请授权 GitHub connector 后重试"
  }
}
```

### completed — 任务完成 → 桌宠「完成」

```json
{
  "type": "completed",
  "agent": "codex",
  "adapter": "codex-desktop",
  "sessionId": "sess_2f9c",
  "taskId": "task_1183",
  "payload": {
    "action": "任务已完成",
    "nextStep": "可以查看产物或开始下一个任务",
    "artifacts": [
      { "label": "集成方案文档", "path": "docs/codex-plugin-hook-integration-plan.md" }
    ]
  }
}
```

### idle — 回到待机 → 桌宠「待机」

```json
{
  "type": "idle",
  "agent": "codex",
  "adapter": "codex-desktop",
  "sessionId": "sess_2f9c",
  "taskId": "task_1183",
  "payload": {}
}
```

## 5. 事件 → 桌宠状态映射

| 事件 `type` | 桌宠可视状态 | 备注 |
| --- | --- | --- |
| `task_start` | thinking（思考） | 带标题与初始计划 |
| `plan_ready` | thinking（思考） | 更新任务面板计划 |
| `file_reading` | scanning（扫描） | |
| `file_editing` | building（施工） | |
| `command_running` | building（施工）/ validating（验证） | `isTest: true` → 验证 |
| `test_running` | validating（验证） | |
| `permission_required` | waiting_approval（等待授权） | 需要用户操作 |
| `permission_resolved` | 恢复之前相位 | 清除等待；可带 `resumePhase` |
| `blocked` / `error` | blocked（阻塞） | 需要用户操作 |
| `completed` | completed（完成） | 展示产物后回落待机 |
| `idle` | idle（待机） | |

## 6. 未知事件与向前兼容

- **未知 `type` 不会导致桌宠崩溃**：会被记录为一条最近动作，但不改变可视状态。
- adapter 可以自由携带额外的 payload 字段；桌宠会忽略它不认识的字段。
- 因此协议是**增量友好**的：先发桌宠已支持的事件，新事件后续在桌宠端补映射即可，老 adapter 不受影响。
- **禁止**为某个 agent 新增 agent-specific 状态（例如 `codex_running` / `claude_running`）。所有 agent
  共用同一组语义事件，具体差异留在各自 adapter 内消化。

## 7. 版本

- 当前 `protocolVersion`: `0.1.0`（与 `/health` 返回一致）。
- 破坏性变更会提升次版本号；新增可选事件/字段视为兼容变更。
