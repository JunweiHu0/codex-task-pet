# SuperNoNo for Codex

[简体中文](README.md) | [繁體中文](README.zh-TW.md)

SuperNoNo for Codex is a desktop pet prototype for Codex. It turns task states, progress, approvals, verification, and capability modules into a visible and companion-like desktop co-pilot.

This project explores state visualization, long-running task companionship, permission reminders, test feedback, and mascot-style interaction for agentic developer tools.

## Product Positioning

SuperNoNo is not a chatbot replacement for Codex. It is a lightweight interaction layer that sits beside the Codex workflow:

- Shows whether Codex is thinking, scanning, editing, validating, waiting for approval, blocked, or done.
- Explains long-running task progress through bubbles and a task panel.
- Uses energy, motion, and modules to represent task health.
- Highlights moments that require user action.
- Provides a prototype event model for future Codex integration.

## Repository Name Recommendation

For a public GitHub repository, the recommended name is:

```text
codex-task-pet
```

The product display name can remain:

```text
SuperNoNo for Codex
```

This keeps the repository name functional and open-source friendly while preserving SuperNoNo as the product codename. See [REPOSITORY_NAMING.md](REPOSITORY_NAMING.md) for more naming options.

## Features

- Desktop pet: Electron transparent window, draggable, and hideable.
- State visualization: idle, thinking, scanning, building, validating, waiting for approval, blocked, completed, and resting.
- Task bubbles: throttled progress hints with hover persistence and click-to-expand behavior.
- Task panel: plan, recent actions, artifact paths, and next steps.
- Energy system: a 0-100 energy value representing task progress and health.
- Ability modules: file scanning, code fixing, test verification, browser checking, document generation, and more.
- Personalization: name, tone, notification frequency, animation level, dock position, and memory scope.
- Browser demo: preview core interactions without Electron.

## Quick Start

Install dependencies:

```bash
npm install
```

Start the desktop pet:

```bash
npm start
```

Start in development mode:

```bash
npm run dev
```

Run the browser demo:

```bash
npm run demo
```

Then open:

```text
http://localhost:4173/
```

## Project Structure

```text
SuperNoNo/
├── electron/              Electron main process and preload
├── src/renderer/          Pet UI, presentation layer, and interactions
├── tools/                 Local utility scripts
├── assets/                Original icons and redistributable assets
├── SuperNoNo_PRD.md       Product requirements document
├── REPOSITORY_NAMING.md   Repository naming and open-source guidance
├── README.md              Simplified Chinese README
├── README.en.md           English README
└── README.zh-TW.md        Traditional Chinese README
```

## Future Codex Integration

The prototype is event-driven. A future Codex integration can translate tool calls, file reads, file edits, command execution, approval requests, test results, and task completion into a unified signal stream.

Example:

```js
SuperNoNo.signal('task_start', {
  title: 'Fix login issue',
  plan: ['Investigate', 'Patch', 'Test']
});

SuperNoNo.signal('file_reading', {
  action: 'Reading auth.ts'
});

SuperNoNo.signal('permission_required', {
  command: 'npm test'
});

SuperNoNo.signal('completed', {
  artifacts: [{ label: 'report.md', path: 'C:/path/to/report.md' }]
});
```

## Assets and Copyright

The open-source version should only include assets that you own or are clearly allowed to redistribute.

If you use cloned projects, third-party images, Live2D models, textures, motions, or game-IP-related assets locally, do not upload them to GitHub unless their license explicitly allows redistribution.

Important notes:

- Excluding `C:\Users\66460\Desktop\SuperNoNo\SuperNoNo` from the public repository is necessary.
- If assets from that folder were copied into other project folders, those copied files must also be removed or excluded before publishing.
- The README should not describe third-party assets as original work.
- The public version should use original SVG assets, programmatically generated icons, or a newly designed original mascot.

This is product and open-source publishing guidance, not legal advice. If the project will be widely distributed, monetized, or maintained long term, run a copyright and trademark review first.

## Privacy Principles

- Preferences should be stored locally by default.
- Do not store secrets, tokens, passwords, or private code.
- Memory scope should be user-controlled.
- Any cross-thread or cross-project memory should be visible, optional, and deletable.

## Roadmap

- Connect to real Codex event streams.
- Improve the task detail panel.
- Add stronger accessibility support.
- Replace all public visuals with fully original assets.
- Add multilingual UI strings.
- Publish installable builds.

## License

MIT License is recommended for the code.

Note: the MIT License only applies to code and original assets that you have the right to open source. It does not automatically license third-party assets, game IP, Live2D models, or external project resources.

