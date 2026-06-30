# SuperNoNo 开源仓库命名方案

日期：2026-07-01  
适用项目：`C:\Users\66460\Desktop\SuperNoNo`

## 结论建议

推荐公开仓库名：

```text
codex-task-pet
```

推荐展示名：

```text
SuperNoNo for Codex
```

推荐仓库简介：

```text
A desktop pet companion that visualizes Codex task states, progress, approvals, and verification flows.
```

中文简介：

```text
一个面向 Codex 的桌面宠物副驾，用来可视化任务状态、进度、授权与验证流程。
```

## 为什么推荐 `codex-task-pet`

- 含义清楚：一眼能看出这是 Codex + 任务 + 桌宠。
- 开源友好：比纯品牌名更容易被搜索和理解。
- IP 风险较低：仓库名不直接使用“超能 NoNo”或游戏 IP 相关表达。
- 后续可扩展：即使未来更换角色名、视觉资产或品牌名，仓库名仍然成立。

## 命名分层

建议把“仓库名”和“产品名”分开：

| 层级 | 推荐写法 | 说明 |
| --- | --- | --- |
| GitHub 仓库名 | `codex-task-pet` | 对外开源、偏功能、低风险 |
| 产品展示名 | SuperNoNo for Codex | README、截图、标题中使用 |
| 内部代号 | SuperNoNo | 继续承接当前 PRD 和原型 |
| 中文名 | Codex 超能桌宠 | 用于中文介绍，但避免宣传成原 IP 联动 |

## 候选仓库名

### 最推荐

1. `codex-task-pet`

说明：最平衡，清楚、短、低风险，适合公开仓库。

2. `codex-desktop-pet`

说明：突出桌面宠物形态，适合 Electron 桌宠项目。

3. `codex-companion-pet`

说明：更强调陪伴感，语义温和。

### 更偏品牌

4. `supernono-for-codex`

说明：和当前产品名一致，记忆点强，但 IP/命名联想风险略高。

5. `supernono-codex`

说明：短，但更像品牌仓库，解释成本略高。

6. `nono-pilot`

说明：有副驾感，但更接近 NoNo 命名，不建议优先使用。

### 更偏技术

7. `codex-state-companion`

说明：突出状态可视化，适合偏工程化介绍。

8. `codex-agent-pet`

说明：突出 agent 工作流，但 “agent” 范围较宽。

9. `codex-progress-pet`

说明：突出进度可视化，但覆盖不到授权、验证、模块等能力。

## 不建议使用的仓库名

| 名称 | 不建议原因 |
| --- | --- |
| `SuperNoNo` | 和已有第三方项目名、原始 IP 联想过近 |
| `chao-neng-nono` | 直接对应“超能 NoNo”，公开风险较高 |
| `seer-nono` | 与《赛尔号》IP 关联过强 |
| `live2d-nono` | 容易让用户误以为仓库提供第三方 Live2D 模型 |
| `codex-vip-nono` | “VIP NoNo” 关联过强，且不利于原创定位 |

## GitHub 页面建议写法

Repository name:

```text
codex-task-pet
```

Description:

```text
A desktop pet companion for visualizing Codex task states, progress, approvals, and verification.
```

Topics:

```text
codex
desktop-pet
electron
assistant
agent-ui
task-progress
developer-tools
mascot
```

Website:

```text
留空，或后续填写 GitHub Pages / demo 地址
```

License:

```text
MIT
```

## 关于第三方素材的开源边界

你提到本地目录里有一个克隆项目：

```text
C:\Users\66460\Desktop\SuperNoNo\SuperNoNo
```

如果这个目录只是留在本地，不上传到 GitHub，通常不会构成“开源仓库抄袭”的展示问题。但需要注意：

1. 不上传克隆目录不等于完全没有风险。
2. 如果你把该目录里的图片、Live2D、贴图、模型、动作文件复制到了本项目其他目录，比如 `assets/` 或 `src/renderer/assets/`，这些复制品也不能上传，除非有明确授权。
3. README 里不要宣称第三方素材是原创。
4. 开源版本应默认使用原创 SVG、程序化图标或你自己生成/绘制的素材。
5. 如果保留本地素材支持，应写成“local-only assets”，并在发布前确保 `.gitignore` 排除相关目录。

建议开源前至少排除：

```gitignore
SuperNoNo/
local-assets/
third-party-assets/
src/renderer/assets/live2d/nono/
src/renderer/assets/live2d/*.moc3
src/renderer/assets/live2d/**/*.png
src/renderer/assets/live2d/**/*.motion3.json
```

以上是产品与开源发布建议，不构成正式法律意见。正式公开发布前，如果项目会被广泛传播或商业使用，建议替换为原创视觉并做一次版权/商标检查。

