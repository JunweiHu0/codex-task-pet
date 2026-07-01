# SuperNoNo Codex Plugin Hooks Prototype Plan

## 目标

当前 SuperNoNo 已经完成了两条关键基础能力：

- 本地事件桥：`POST http://127.0.0.1:4174/signal`
- Codex Desktop `notify` wrapper：能在 `turn-ended` 时发送粗粒度事件

但 `notify` 只能可靠告诉我们“一个 Codex turn 结束了”，不能告诉我们 Codex 是否正在读文件、改文件、运行命令或等待授权。

下一阶段目标是做一个 **Codex Plugin Hooks Prototype**，用 Codex 的插件 / hooks 机制捕获更细粒度的生命周期事件，再转成 SuperNoNo 统一事件协议。

## 当前结论

Codex 没有官方“桌面宠物插件”这种现成实现。

SuperNoNo 应该保持为独立 Electron 桌宠；Codex 插件只负责监听生命周期并转发事件：

```text
Codex plugin hooks
        |
        v
hook command/script
        |
        v
POST http://127.0.0.1:4174/signal
        |
        v
SuperNoNo Electron pet
```

也就是说：

- 桌宠 UI 不嵌入 Codex。
- Codex 插件不负责渲染。
- 插件 / hooks 只是 agent adapter 的一种实现。
- `notify` wrapper 继续作为 turn-level 兜底。
- plugin hooks 用于探索 file/edit/command/permission 级别细粒度状态。

## 相关官方能力

Codex 插件可以包含：

- `.codex-plugin/plugin.json`
- `skills/`
- `hooks/`
- MCP 配置
- app 配置
- assets

Codex hooks 方向上，最值得关注的生命周期事件：

| Hook | 用途 | SuperNoNo 映射 |
| --- | --- | --- |
| `PreToolUse` | 工具调用前 | `file_reading` / `file_editing` / `command_running` |
| `PostToolUse` | 工具调用后 | `step_done` / `test_running` / `blocked` |
| `PermissionRequest` | 即将请求用户审批 | `permission_required` |
| `PreCompact` | 上下文压缩前 | 可选：`turn_ended` 或调试事件 |
| `PostCompact` | 上下文压缩后 | 可选：`turn_ended` 或调试事件 |

注意：hooks 的实际 payload、匹配规则、工具名称和可用范围必须在本机环境里验证，不要凭空假设。

## 推荐目录结构

在本仓库中创建一个原型插件目录：

```text
plugins/
└── supernono-codex/
    ├── .codex-plugin/
    │   └── plugin.json
    ├── hooks/
    │   ├── README.md
    │   ├── hooks.json
    │   ├── pre-tool-use.js
    │   ├── post-tool-use.js
    │   └── permission-request.js
    └── README.md
```

如果 hooks 配置格式在本机 Codex 版本里不是 `hooks.json`，以实际可用格式为准，并在 README 里说明。

## 事件映射策略

插件 hooks 应该只发送 SuperNoNo 已定义的统一协议事件。

不要新增 agent-specific 事件，例如：

```text
codex_tool_start
codex_apply_patch
codex_bash
```

应该映射到：

```text
file_reading
file_editing
command_running
test_running
permission_required
blocked
step_done
turn_ended
completed
```

### PreToolUse

候选映射：

| 工具类型 | SuperNoNo event |
| --- | --- |
| shell/bash/command | `command_running` |
| test/lint/build 命令 | `command_running` with `payload.isTest = true` 或 `test_running` |
| file read/search | `file_reading` |
| apply patch/file write | `file_editing` |
| browser/MCP 工具 | 先映射 `command_running` 或记录为 action |

### PostToolUse

候选映射：

| 结果 | SuperNoNo event |
| --- | --- |
| 工具成功 | `step_done` |
| 测试成功 | `step_done` with `rule: "testPass"` |
| 工具失败 | `blocked` 或 `error` |
| 无法判断 | 只记录 action |

### PermissionRequest

候选映射：

```json
{
  "type": "permission_required",
  "agent": "codex",
  "adapter": "codex-plugin-hooks",
  "payload": {
    "command": "npm install",
    "action": "Codex 请求授权"
  }
}
```

## 安全原则

插件 hooks 不能泄露用户代码或密钥。

要求：

- 不记录 prompt 正文。
- 不记录源码正文。
- 不记录完整工具输入。
- 不记录 token、API key、authorization、cookie、password。
- shell command 可以作为短文本记录，但不要执行任何额外命令。
- hooks 只能向本地 bridge 发送状态事件。
- SuperNoNo 未启动时，hooks 必须静默失败，不影响 Codex 正常工作。

## 与现有 notify wrapper 的关系

`notify` wrapper 继续存在，负责粗粒度：

```text
turn-ended -> turn_ended
```

plugin hooks 负责更细粒度：

```text
PreToolUse / PostToolUse / PermissionRequest -> file/edit/command/permission events
```

两者可以共存。

如果 plugin hooks 可用，桌宠会显示更丰富状态；如果 hooks 不可用，notify wrapper 仍然提供 turn-level 接入。

## 验收标准

第一阶段不要求立刻安装到真实 Codex 全局配置里。先做可审查、可手动测试的 prototype。

验收标准：

- 新增 `plugins/supernono-codex/` 原型目录。
- 插件 README 清楚说明安装方式、限制和回滚方式。
- hooks 脚本使用现有 `adapters/shared/send-signal.js`，不新增 npm 依赖。
- hooks 脚本语法检查通过。
- hooks 脚本不会 throw 影响 Codex。
- 能用手动 fixture 模拟：
  - command -> `command_running`
  - test command -> `test_running` 或 `command_running` with `isTest`
  - file read -> `file_reading`
  - file edit -> `file_editing`
  - permission request -> `permission_required`
- 不修改 Live2D 文件。
- 不修改 `~/.codex/config.toml`，除非用户明确授权。
- 如果真实 hooks API 无法确认，只提交 skeleton + README + manual fixture，不写假安装说明。

## 建议下一步

先做：

```text
M4.1 Codex Plugin Hooks Prototype
```

目标不是马上替换 notify wrapper，而是验证 Codex hooks 能不能提供比 `turn_ended` 更细的工具级事件。

如果本机 Codex 插件 hooks 可用，再做：

```text
M4.2 Installable Codex Plugin
```

如果不可用，则保留 skeleton，并转向：

- MCP side-channel
- `logs_2.sqlite` read-only tail
- 官方更新后的 per-tool notify

