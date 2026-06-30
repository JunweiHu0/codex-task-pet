# SuperNoNo for Codex

[English](README.en.md) | [繁體中文](README.zh-TW.md)

SuperNoNo for Codex 是一个面向 Codex 的桌面宠物原型。它把 Codex 的任务状态、进度、授权、验证和能力模块变成一个可见、可控、可陪伴的桌面副驾。

本项目适合用来探索 agent 产品中的状态可视化、长任务陪伴、权限提醒、测试反馈和桌面宠物交互。

## 当前定位

SuperNoNo 不是一个替代 Codex 的聊天机器人，而是一个位于 Codex 工作流旁边的轻量交互层：

- 展示 Codex 当前处于分析、扫描、编辑、验证、等待授权、阻塞或完成状态。
- 用气泡和面板解释长任务进展。
- 用能量、动作和模块表达任务健康度。
- 在需要用户操作时给出清晰提醒。
- 为未来接入真实 Codex 事件流提供原型。

## 仓库命名建议

如果准备公开到 GitHub，推荐使用：

```text
codex-task-pet
```

产品展示名可以继续使用：

```text
SuperNoNo for Codex
```

这样可以让仓库名更偏功能和开源语境，同时保留 SuperNoNo 作为产品代号。更多命名方案见 [REPOSITORY_NAMING.md](REPOSITORY_NAMING.md)。

## 功能特性

- 桌面宠物：Electron 透明窗口、可拖拽、可隐藏。
- 状态可视化：待机、思考、扫描、施工、验证、等待授权、阻塞、完成、休息。
- 任务气泡：关键节点提示，支持节流、悬停保持和点击展开。
- 任务面板：展示计划、最近动作、产物路径和下一步。
- 能量系统：用 0-100 的能量值表达任务推进和健康度。
- 超能模块：文件扫描、代码修复、测试验证、浏览器验收、文档生成等模块化表达。
- 个性化设置：名称、语气、提示频率、动画强度、停靠位置、记忆范围。
- 浏览器演示：无需 Electron 也可预览基础交互。

## 快速开始

安装依赖：

```bash
npm install
```

启动桌面宠物：

```bash
npm start
```

开发模式：

```bash
npm run dev
```

浏览器演示：

```bash
npm run demo
```

启动后访问：

```text
http://localhost:4173/
```

## 项目结构

```text
SuperNoNo/
├── electron/              Electron 主进程与 preload
├── src/renderer/          桌宠 UI、状态表现层和交互
├── tools/                 本地工具脚本
├── assets/                原创图标和公开可用素材
├── SuperNoNo_PRD.md       产品 PRD
├── REPOSITORY_NAMING.md   仓库命名与开源发布建议
├── README.md              简体中文 README
├── README.en.md           English README
└── README.zh-TW.md        繁體中文 README
```

## 接入真实 Codex 的方向

当前原型可以通过事件信号驱动。未来接入真实 Codex 时，可以将 Codex 的工具调用、文件读取、文件编辑、命令执行、权限审批、测试结果和任务完成事件转换为统一信号。

示例：

```js
SuperNoNo.signal('task_start', {
  title: '修复登录问题',
  plan: ['定位问题', '修改代码', '运行测试']
});

SuperNoNo.signal('file_reading', {
  action: '读取 auth.ts'
});

SuperNoNo.signal('permission_required', {
  command: 'npm test'
});

SuperNoNo.signal('completed', {
  artifacts: [{ label: 'report.md', path: 'C:/path/to/report.md' }]
});
```

## 素材与版权说明

开源版本应该只包含你拥有权利或明确可公开分发的素材。

如果本地使用了克隆项目、第三方图片、Live2D 模型、贴图、动作文件或游戏 IP 相关素材，请不要上传到 GitHub，除非这些素材的许可证明确允许你这样做。

需要特别注意：

- 不上传 `C:\Users\66460\Desktop\SuperNoNo\SuperNoNo` 这个克隆目录是必要的。
- 如果你已经把该目录里的素材复制到本项目其他目录，也需要在开源前删除或排除这些复制品。
- README 不应宣称第三方素材是原创。
- 建议公开版本使用原创 SVG、程序化生成图标或重新设计的原创角色形象。

这不是正式法律意见。如果计划公开传播、商业使用或长期维护，建议完成一次版权和商标检查。

## 隐私原则

- 偏好设置优先保存在本地。
- 不存储密钥、令牌、密码或私密代码。
- 记忆范围应由用户控制。
- 任何跨线程或跨项目记忆都应可查看、可关闭、可删除。

## 路线图

- 接入真实 Codex 事件流。
- 增强任务详情面板。
- 增加更完整的无障碍支持。
- 替换为完全原创的公开视觉资产。
- 增加多语言界面文案。
- 发布可安装版本。

## 许可证

代码建议使用 MIT License。

注意：MIT License 只适用于本仓库中你有权开源的代码和原创素材，不会自动授权第三方素材、游戏 IP、Live2D 模型或外部项目资源。

