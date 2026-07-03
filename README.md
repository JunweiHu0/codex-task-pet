# SuperNoNo for Codex

[English](README.en.md) | [繁體中文](README.zh-TW.md)

SuperNoNo 是一个面向 Codex 工作流的 Windows 桌面宠物。它不替代
Codex，也不参与写代码，而是把 Codex 的工具调用、命令运行、等待授权和
任务完成状态变成一个小巧的桌面陪伴层。

v1.0 已经接入真实 Codex Desktop plugin hooks：当 Codex 运行 shell
命令、完成工具调用或触发权限请求时，SuperNoNo 可以通过本地事件桥实时
响应。下一阶段会把这套能力扩展成 multiagent 工作助理，同时接入 Codex
和 Claude Code。

## v1.0 能做什么

- 常驻小窗桌宠：透明 Electron 窗口、可拖拽、可隐藏，默认只保留宠物本体和底部状态栏。
- 真实 Codex 状态：通过 Codex plugin hooks 接收 `command_running`、`step_done`、`permission_required` 等事件。
- turn-level 兜底：Codex notify wrapper 可发送 `turn_ended`，作为粗粒度 fallback。
- 统一事件协议：`/signal` 本地桥接服务监听 `127.0.0.1:4174`，支持 Codex、Claude、Cursor、generic-cli 等 adapter。
- 托盘收纳：任务面板、设置、演示模式等入口移到 Windows 托盘菜单，日常不遮挡代码。
- 任务反馈：气泡、状态栏和面板展示当前动作、最近进展、产物路径和需要介入的节点。

## 快速开始

### 方式 A：源码运行

```powershell
npm install
npm start
```

如果 PowerShell 因执行策略无法运行 `npm`，可以使用：

```powershell
npm.cmd install
npm.cmd start
```

### 方式 B：Windows portable 包

下载 release 里的 `SuperNoNo-win32-x64-v1.0.0.zip`，解压后运行：

```text
SuperNoNo.exe
```

这是便携包，不会安装快捷方式、不会自动更新。Windows SmartScreen 可能提示未知发布者，这是未签名个人开源软件的常见情况。

## 接入真实 Codex

1. 启动 SuperNoNo，让本地桥接服务监听 `127.0.0.1:4174`。
2. 按照 [plugins/supernono-codex/INSTALL.md](plugins/supernono-codex/INSTALL.md) 安装本地 Codex plugin。
3. 在 Codex Desktop 中运行一次会调用工具的任务，并信任 `supernono-codex` hooks。
4. 让 Codex 运行一个简单命令，例如：

```text
请实际调用 shell 工具运行命令 echo supernono-hook-test
```

如果接入成功，SuperNoNo 会进入运行命令状态，并在工具完成后回到完成/待机状态。真实 plugin-hook 事件会带有：

```json
{
  "agent": "codex",
  "adapter": "codex-plugin-hooks"
}
```

notify wrapper 的粗粒度 fallback 会带有：

```json
{
  "agent": "codex",
  "adapter": "codex-desktop-notify"
}
```

## 本地事件协议

SuperNoNo 的核心不是绑定某一个 agent，而是一层 agent-neutral signal
protocol。事件 envelope 包含：

```json
{
  "type": "command_running",
  "agent": "codex",
  "adapter": "codex-plugin-hooks",
  "sessionId": "session-id",
  "taskId": "task-id",
  "payload": {
    "command": "npm test",
    "isTest": true
  }
}
```

完整协议见 [docs/supernono-signal-protocol.md](docs/supernono-signal-protocol.md)。

## 打包

```powershell
npm.cmd run package:win
```

产物会生成到 `dist/`。打包脚本会排除本机运行时文件，例如
`notify-wrapper.config.json` 和 `notify-observed.json`，避免把个人路径或本机诊断结果放进 release zip。

## 视觉资产说明

当前仓库包含用于 v1.0 展示的桌宠视觉资源和 Live2D 加载逻辑。若你要二次分发、商业使用或替换品牌形象，请确认相关素材许可，或替换为自己的原创资产。Live2D 加载失败时，SuperNoNo 会回退到内置 SVG 桌宠显示。

## 隐私原则

- SuperNoNo 只接收 agent adapter 主动发送的摘要事件。
- Codex plugin hooks 不发送 prompt、源码正文、完整 diff、token 或密钥。
- notify wrapper 只记录 payload 结构，不记录对话正文。
- 本地桥只监听 `127.0.0.1`。
- 生成的本机 adapter 配置和 observed 文件不会进入 release zip。

## 项目结构

```text
SuperNoNo/
├── electron/              Electron 主进程与 preload
├── src/renderer/          桌宠 UI、状态表现层和交互
├── plugins/supernono-codex/ Codex plugin hooks
├── adapters/              notify wrapper、manual tests 与共享 sender
├── docs/                  协议、接入计划、release notes
├── tools/                 Live2D bundle 与 Windows portable 打包脚本
└── assets/                图标和静态素材
```

## 下一步

- v1.0 收尾：清理 release 包、收口安装文档、保持桌宠单 agent 功能冻结。
- Phase 1：引入 multiagent state store，让一个桌宠同时跟踪多个 agent/session。
- Phase 2：新增 Claude Code adapter，让 Codex + Claude Code 双 agent 工作流进入同一个桌宠状态层。
