'use strict';

/*
 * Create a dependency-free Windows portable package from the local Electron
 * runtime. This avoids adding electron-builder/forge just for the V1 release.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const electronDist = path.join(root, 'node_modules', 'electron', 'dist');
const outRoot = path.join(root, 'dist');
const appName = `${pkg.productName || 'SuperNoNo'}-win32-x64`;
const outDir = path.join(outRoot, appName);
const zipPath = path.join(outRoot, `${appName}-v${pkg.version}.zip`);

const appFiles = [
  'package.json',
  'README.md',
  'README.en.md',
  'README.zh-CN.md',
  'README.zh-TW.md',
  'SuperNoNo_PRD.md',
  'electron',
  'src',
  'assets',
  'adapters',
  'plugins',
  'docs',
  '.agents',
];

function rm(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copy(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dest, { recursive: true });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function run(command, args) {
  const res = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (res.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${res.status}`);
  }
}

if (!fs.existsSync(path.join(electronDist, 'electron.exe'))) {
  throw new Error('Electron runtime not found. Run npm install first.');
}

ensureDir(outRoot);
rm(outDir);
rm(zipPath);

copy(electronDist, outDir);

const defaultApp = path.join(outDir, 'resources', 'default_app.asar');
rm(defaultApp);

const appDir = path.join(outDir, 'resources', 'app');
ensureDir(appDir);
for (const file of appFiles) {
  copy(path.join(root, file), path.join(appDir, file));
}

const electronExe = path.join(outDir, 'electron.exe');
const appExe = path.join(outDir, `${pkg.productName || 'SuperNoNo'}.exe`);
if (fs.existsSync(electronExe)) fs.renameSync(electronExe, appExe);

const releaseReadme = [
  `${pkg.productName || 'SuperNoNo'} v${pkg.version}`,
  '',
  'Windows portable build.',
  '',
  'Run:',
  `  ${path.basename(appExe)}`,
  '',
  'Notes:',
  '- The local signal bridge listens on http://127.0.0.1:4174 while the app is running.',
  '- Codex plugin hooks and adapter files are included under resources/app/plugins and resources/app/adapters.',
  '- This package is portable and does not install shortcuts or auto-updates.',
  '',
].join('\r\n');
fs.writeFileSync(path.join(outDir, 'README-PORTABLE.txt'), releaseReadme, 'utf8');

run('powershell.exe', [
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  `Compress-Archive -LiteralPath ${JSON.stringify(outDir)} -DestinationPath ${JSON.stringify(zipPath)} -Force`,
]);

const stat = fs.statSync(zipPath);
console.log(`Created ${zipPath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
