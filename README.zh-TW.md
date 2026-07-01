# SuperNoNo for Codex

[简体中文](README.md) | [English](README.en.md)

SuperNoNo for Codex 是一個面向 Codex 的桌面寵物原型。它把 Codex 的任務狀態、進度、授權、驗證和能力模組，變成一個可見、可控、可陪伴的桌面副駕。

本專案適合用來探索 agent 產品中的狀態視覺化、長任務陪伴、權限提醒、測試回饋和桌面寵物互動。

## 目前定位

SuperNoNo 不是用來取代 Codex 的聊天機器人，而是位於 Codex 工作流旁邊的輕量互動層：

- 顯示 Codex 目前處於分析、掃描、編輯、驗證、等待授權、阻塞或完成狀態。
- 用氣泡和面板解釋長任務進度。
- 用能量、動作和模組表達任務健康度。
- 在需要使用者操作時給出清楚提醒。
- 為未來接入真實 Codex 事件流提供原型。

## 功能特色

- 桌面寵物：Electron 透明視窗、可拖曳、可隱藏。
- 狀態視覺化：待機、思考、掃描、施工、驗證、等待授權、阻塞、完成、休息。
- 任務氣泡：關鍵節點提示，支援節流、懸停保持和點擊展開。
- 任務面板：展示計畫、最近動作、產物路徑和下一步。
- 能量系統：用 0-100 的能量值表達任務推進和健康度。
- 超能模組：檔案掃描、程式修復、測試驗證、瀏覽器驗收、文件生成等模組化表達。
- 個人化設定：名稱、語氣、提示頻率、動畫強度、停靠位置、記憶範圍。
- 瀏覽器演示：無需 Electron 也可預覽基礎互動。

## 快速開始

安裝依賴：

```bash
npm install
```

啟動桌面寵物：

```bash
npm start
```

開發模式：

```bash
npm run dev
```

瀏覽器演示：

```bash
npm run demo
```

啟動後訪問：

```text
http://localhost:4173/
```

## 專案結構

```text
SuperNoNo/
├── electron/              Electron 主程序與 preload
├── src/renderer/          桌寵 UI、狀態表現層與互動
├── tools/                 本地工具腳本
├── assets/                原創圖示與可公開分發素材
├── SuperNoNo_PRD.md       產品 PRD
├── README.md              簡體中文 README
├── README.en.md           English README
└── README.zh-TW.md        繁體中文 README
```

## 接入真實 Codex 的方向

目前原型可以透過事件信號驅動。未來接入真實 Codex 時，可以將 Codex 的工具呼叫、檔案讀取、檔案編輯、命令執行、權限審批、測試結果和任務完成事件轉換為統一信號。

範例：

```js
SuperNoNo.signal('task_start', {
  title: '修復登入問題',
  plan: ['定位問題', '修改程式', '執行測試']
});

SuperNoNo.signal('file_reading', {
  action: '讀取 auth.ts'
});

SuperNoNo.signal('permission_required', {
  command: 'npm test'
});

SuperNoNo.signal('completed', {
  artifacts: [{ label: 'report.md', path: 'C:/path/to/report.md' }]
});
```

## 隱私原則

- 偏好設定優先保存在本地。
- 不儲存密鑰、令牌、密碼或私密程式碼。
- 記憶範圍應由使用者控制。
- 任何跨執行緒或跨專案記憶都應可查看、可關閉、可刪除。

## 路線圖

- 接入真實 Codex 事件流。
- 增強任務詳情面板。
- 增加更完整的無障礙支援。
- 替換為完全原創的公開視覺素材。
- 增加多語言介面文案。
- 發布可安裝版本。
