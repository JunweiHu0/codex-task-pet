# Codex 原生桌宠与 SuperNoNo 的功能差异

## 目的

这份文档用于说明 Codex 原生桌宠能力和 SuperNoNo 当前产品方向的区别，避免把两者混成同一种东西。

一句话概括：

```text
Codex 原生桌宠 = Codex 内置的宠物皮肤 / 动画素材系统
SuperNoNo      = 独立桌面宠物 + agent 工作状态可视化层
```

两者都和“桌宠”有关，但产品层级不同，解决的问题也不同。

## Codex 原生桌宠提供什么

从本机 Codex 的 `hatch-pet` workflow 看，Codex 原生桌宠系统主要围绕
**创建、修复、校验和打包 Codex 可识别的宠物动画资源**。

最终产物大致是：

```text
~/.codex/pets/<pet-name>/
  pet.json
  spritesheet.webp
```

它的动画资源有固定状态行：

- `idle`
- `running-right`
- `running-left`
- `waving`
- `jumping`
- `failed`
- `waiting`
- `running`
- `review`

每个动画格子是 `192x208`，最终 atlas 是 `1536x1872`。

从产品角度看，Codex 原生桌宠更像是 **Codex 内部的可换皮肤宠物系统**：

- 生成或修复宠物外观
- 校验 spritesheet / atlas
- 生成 contact sheet 和动画预览
- 打包成 Codex 能加载的 `pet.json + spritesheet.webp`
- 对齐 Codex 内置的 9 个宠物状态

## SuperNoNo 提供什么

SuperNoNo 不是单纯的宠物皮肤，而是一个独立的 Electron 桌面宠物应用。

它的核心能力是：**接收 agent 生命周期事件，并把 agent 的工作状态可视化成桌面陪伴体验**。

当前 SuperNoNo 已经具备：

- 透明可拖拽桌面窗口
- Live2D / renderer 侧宠物 UI
- 任务气泡
- 任务面板
- 能量 / 任务健康度反馈
- 思考、扫描、编辑、验证、等待授权、阻塞、完成、待机等状态
- 本地事件桥：`127.0.0.1:4174`
- agent-neutral 的统一信号协议
- Codex Desktop plugin hooks adapter
- Codex notify wrapper 作为 turn-level fallback

SuperNoNo 的关键设计不是“宠物资源格式”，而是这条链路：

```text
Agent adapter -> Unified Signal Protocol -> SuperNoNo bridge -> Pet UI
```

所以同一个桌宠理论上可以被不同 agent 驱动：

- Codex
- Claude Code
- Cursor
- generic CLI scripts
- 未来自定义 agent

## 功能对比

| 维度 | Codex 原生桌宠 | SuperNoNo |
| --- | --- | --- |
| 产品层级 | Codex 内置能力 | 独立 Electron 桌面应用 |
| 核心目标 | 宠物外观和动画资产 | agent 工作状态可视化和陪伴 |
| 运行方式 | Codex 内部状态驱动 | 本地 HTTP bridge + adapter |
| 事件来源 | Codex 自身 | 任意能发协议事件的 agent |
| agent 支持 | 主要服务 Codex | 设计上支持 Codex / Claude / Cursor / generic-cli |
| 视觉格式 | `pet.json + spritesheet.webp` atlas | 当前是项目 renderer / Live2D 资产，未来可兼容 Codex pet 资产 |
| 状态模型 | 固定 9 个动画状态 | 可扩展事件协议 + renderer 状态机 |
| UI 能力 | 宠物动画本体 | 宠物、气泡、任务面板、能量、模块状态 |
| 权限提醒 | 依赖 Codex 原生审批流 | 可把 `permission_required` 显示成桌面提醒 |
| 安装摩擦 | 宠物包就绪后由 Codex 加载 | 需要 app、bridge、adapter/plugin 配置 |
| 更擅长 | 让 Codex 内部更有个性 | 让 agent 工作过程跨工具可见 |

## SuperNoNo 已经领先的地方

SuperNoNo 现在已经不只是 demo，它已经能监听真实 Codex Desktop 的工具生命周期事件。

当前验证成功的链路是：

```text
Codex tool use
  -> plugin hooks
  -> command_running / step_done
  -> adapter: codex-plugin-hooks
  -> SuperNoNo bridge
```

notify wrapper 作为独立 fallback：

```text
Codex turn ended
  -> notify wrapper
  -> turn_ended
  -> adapter: codex-desktop-notify
```

这意味着 SuperNoNo 已经具备一个真实、免 token 的 Codex Desktop 接入路径，可以在命令级别感知 agent 活动。

这个能力和 Codex 原生宠物的重点不同：Codex 原生宠物重点在“显示哪个宠物”，SuperNoNo 重点在“这个 agent 正在做什么”。

## Codex 原生桌宠更强的地方

Codex 原生桌宠在内置体验上更强：

- 不需要单独启动 Electron 应用
- 不需要本地端口
- 不需要配置 Node 路径
- 不需要刷新 plugin cache
- 不需要处理 hook trust 流程
- 宠物动画格式和 QA pipeline 更标准
- 天然贴合 Codex 自己的内部状态

如果用户只是想让 Codex 里出现一个可爱的宠物，Codex 原生桌宠路径更简单。

## 产品定位建议

SuperNoNo 不应该被定位为“替代 Codex 原生桌宠”。

更好的定位是：

```text
SuperNoNo 是一个 agent activity companion。
它把 coding agent 的工作过程变成一个可见、安静、有陪伴感的桌面存在。
```

这个定位能自然支持：

- Codex 接入
- Claude Code 接入
- Cursor 接入
- generic CLI 接入
- 更丰富的任务面板和跨 agent 历史
- 未来导入 Codex-compatible pet assets

## 后续产品方向

### 1. 保持 agent-neutral

Codex 应该是第一个被验证的 adapter，而不是产品边界。

统一协议已经支持：

- `agent`
- `adapter`
- `sessionId`
- `taskId`
- 事件 payload

后续接入 Claude Code、Cursor 或 generic CLI 时，应继续新增 adapter，而不是把逻辑写死在 renderer 里。

### 2. 产品化 Codex Adapter

Codex plugin hooks 已经打通，但安装体验还比较粗糙：

- Windows `command_windows` 当前使用本机 Node 路径：
  `C:\PROGRA~1\nodejs\node.exe`
- 修改插件后需要刷新 Codex plugin cache
- 修改 hook 内容后需要重新 trust
- `legacy_notify` Windows 206 仍是独立 fallback 问题

下一步应该做一个 setup / install 脚本：

- 自动探测 Node 路径
- 生成或 patch `hooks.json`
- 刷新 Codex plugin cache
- 检查 `/health`
- 输出清晰的 trust test 指引

### 3. 兼容 Codex Pet 资产

SuperNoNo 未来可以支持导入 Codex 原生宠物资产：

```text
pet.json + spritesheet.webp -> SuperNoNo renderer asset
```

这样用户可以复用 Codex 的宠物素材，同时获得 SuperNoNo 的外部桌面陪伴和多 agent 状态能力。

### 4. 突出工作可见性

SuperNoNo 的差异化不只是“动画更可爱”，而是：

- 长任务陪伴
- 命令执行反馈
- 测试 / 构建反馈
- 权限提醒
- 阻塞状态提醒
- 多 agent 支持
- 任务面板和事件历史
- 安静的 turn-level fallback

这些能力让 SuperNoNo 超出了“宠物皮肤”的范围。

## 结论

Codex 原生桌宠可以理解为 **视觉身份层**。

SuperNoNo 应该被理解为 **桌面 agent companion 层**。

最强的产品路线不是二选一，而是互补：

- 使用 Codex 原生宠物格式补足角色资产生态
- 使用 SuperNoNo 的 bridge 和 adapter 承接跨 agent 工作状态
- 先把 Codex adapter 产品化，再继续接 Claude Code / Cursor

