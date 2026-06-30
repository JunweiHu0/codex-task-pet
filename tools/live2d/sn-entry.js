/*
 * sn-entry.js — SuperNoNo's Live2D bridge.
 *
 * Bundled (esbuild, IIFE) into ../../src/renderer/assets/live2d/live2d.bundle.js
 * and loaded by the SuperNoNo renderer. Renders the "VIP nono" Cubism model
 * into #sn-live2d-stage and exposes window.desktopPet.setState(state) so the
 * Pet State Engine can drive it.
 *
 * Mapping (SuperNoNo state -> NoNo behaviour):
 *   thinking/scanning/building/validating -> continuous charge-glow loop
 *   waiting_approval -> Nope (大咩)        blocked -> Failed (沮丧)
 *   completed -> JoyJump (喜悦跳)          idle/resting -> idle (+ auto Sleepy/Yawn)
 */
import { Application, UPDATE_PRIORITY, extensions } from 'pixi.js';
import { configureCubismSDK, Live2DModel, Live2DPlugin, MotionPriority } from 'untitled-pixi-live2d-engine/cubism';

const MODEL_URL = new URL('assets/live2d/vip-nono.model3.json', document.baseURI).href;
const BLINK_INTERVAL_SECONDS = 6;
const MODEL_TARGET_WIDTH = 176;
const MODEL_TARGET_HEIGHT = 218;
const VISIBLE_ZOOM = 1.62;
const MODEL_SAFE_PADDING = 14;
const DEFAULT_MOTION_DURATION_MS = 4200;
const MOTION_DURATIONS_MS = { Happy: 3200, JoyJump: 3400, Dance: 7000, Charge: 4500, Sweat: 3000, Sleepy: 5100, Failed: 5100, Nope: 3500, Yawn: 3200 };
const CHARGE_INTRO_MS = 3000;
const AUTO_IDLE_TRIGGER_MS = 120000;
const AUTO_IDLE_CHECK_MS = 15000;
const AUTO_IDLE_MOTIONS = ['Sleepy', 'Yawn'];

// SuperNoNo states that should hold a continuous charging glow.
const CHARGING_STATES = new Set(['thinking', 'scanning', 'building', 'validating', 'working', 'coding', 'editing', 'testing', 'planning', 'reviewing']);
// One-shot expressive motion for non-charging states.
const STATE_MOTION = {
  waiting_approval: 'Nope',
  blocked: 'Failed',
  error: 'Failed',
  warning: 'Sweat',
  completed: 'JoyJump',
  success: 'JoyJump',
};

const MOTION_RESET_PARAMETERS = [
  ['Param', 0], ['Param2', 0], ['Param3', 0], ['Param4', 0], ['Param5', 0], ['Param6', 0], ['Param7', 0], ['Param8', 0], ['Param9', 0], ['Param10', 0],
  ['Param11', 0], ['Param12', 0], ['Param13', 0], ['Param14', 0], ['Param15', 0], ['Param16', 0], ['Param17', 0], ['Param18', 0], ['Param19', 0], ['Param20', 0],
  ['Param21', 0], ['Param22', 0], ['Param23', 0], ['Param24', 0], ['Param25', 0], ['Param26', 0], ['Param27', 0], ['Param28', 0], ['Param29', 0],
  ['ParamEyeLOpen', 1], ['ParamEyeROpen', 1], ['ParamEyeBallX', 0], ['ParamEyeBallY', 0], ['ParamAngleX', 0], ['ParamAngleY', 0], ['ParamAngleZ', 0], ['ParamEyeLSmile', 0], ['ParamEyeRSmile', 0],
];
const IDLE_PARAMETERS = [
  ['Param4', 0], ['Param27', 1], ['Param14', 0], ['Param15', 0], ['Param16', 0], ['Param19', 0], ['Param28', 0], ['Param29', 0], ['Param24', 0], ['Param22', 0], ['Param23', 0],
  ['ParamEyeLOpen', 1], ['ParamEyeROpen', 1], ['ParamEyeBallX', 0], ['ParamEyeBallY', 0], ['ParamAngleX', 0], ['ParamAngleY', 0], ['ParamAngleZ', 0],
];

const stageElement = document.querySelector('#sn-live2d-stage');
let app;
let model;
let motionRunId = 0;
let motionActive = false;
let idleTimeoutId = 0;
let currentState = 'idle';
let chargeLoopActive = false;
let chargeLoopStartedAt = 0;
let chargeIntroTimerId = 0;
let lastInteractionAt = Date.now();

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

function setParameter(id, value) {
  const core = model?.internalModel?.coreModel;
  const params = core?.getModel?.().parameters;
  const idx = params?.ids?.indexOf(id) ?? -1;
  if (idx >= 0) core.setParameterValueByIndex(idx, value, 1);
}

function applyParams(list) { for (const [id, v] of list) setParameter(id, v); }

function fitModel() {
  if (!app || !model) return;
  const availW = Math.max(1, Math.min(app.screen.width - MODEL_SAFE_PADDING * 2, MODEL_TARGET_WIDTH));
  const availH = Math.max(1, Math.min(app.screen.height - MODEL_SAFE_PADDING * 2, MODEL_TARGET_HEIGHT));
  const mw = Math.max(1, model.width / model.scale.x);
  const mh = Math.max(1, model.height / model.scale.y);
  const scale = Math.min(availW / mw, availH / mh) * VISIBLE_ZOOM;
  model.scale.set(scale);
  model.position.set(app.screen.width / 2, app.screen.height / 2 - 4);
}

function configureEyeBlink() {
  const eb = model?.internalModel?.eyeBlink;
  if (!eb) return;
  eb.setBlinkingInterval?.(BLINK_INTERVAL_SECONDS);
  if (typeof eb.determinNextBlinkingTiming === 'function') {
    eb.determinNextBlinkingTiming = function () { return this._userTimeSeconds + BLINK_INTERVAL_SECONDS; };
    eb._nextBlinkingTime = (eb._userTimeSeconds ?? 0) + BLINK_INTERVAL_SECONDS;
  }
}

function clearIdleTimeout() { if (idleTimeoutId) { clearTimeout(idleTimeoutId); idleTimeoutId = 0; } }

function enterIdle() {
  if (!model) return;
  clearIdleTimeout();
  chargeLoopActive = false;
  motionActive = false;
  model.stopMotions();
  applyParams(MOTION_RESET_PARAMETERS);
  applyParams(IDLE_PARAMETERS);
}

function scheduleIdleAfter(group, runId) {
  clearIdleTimeout();
  idleTimeoutId = setTimeout(() => { if (runId === motionRunId) enterIdle(); }, MOTION_DURATIONS_MS[group] ?? DEFAULT_MOTION_DURATION_MS);
}

function playMotion(group, keepActive = false) {
  if (!model) return;
  const runId = ++motionRunId;
  clearIdleTimeout();
  chargeLoopActive = false;
  motionActive = true;
  applyParams(MOTION_RESET_PARAMETERS);
  Promise.resolve(model.motion(group, 0, MotionPriority.FORCE)).then((started) => {
    if (runId !== motionRunId) return;
    if (started === false) { enterIdle(); return; }
    if (!keepActive) scheduleIdleAfter(group, runId);
  }).catch(() => { if (runId === motionRunId) enterIdle(); });
}

/* ---- continuous charge glow (model-specific param drivers) ------------- */
function startChargeLoop() {
  if (!model) return;
  clearChargeIntro();
  playMotion('Charge', true); // intro charge animation
  chargeIntroTimerId = setTimeout(() => {
    chargeIntroTimerId = 0;
    if (currentState && CHARGING_STATES.has(currentState)) enterChargeLoop();
  }, CHARGE_INTRO_MS);
}
function clearChargeIntro() { if (chargeIntroTimerId) { clearTimeout(chargeIntroTimerId); chargeIntroTimerId = 0; } }
function enterChargeLoop() {
  if (!model) return;
  motionRunId += 1;
  clearIdleTimeout();
  model.stopMotions();
  motionActive = true;
  chargeLoopActive = true;
  chargeLoopStartedAt = performance.now();
  applyChargeLoopPose(0);
}
function applyChargeLoopPose(t) {
  const pulse = (Math.sin(t * Math.PI * 2 * 0.55) + 1) * 0.5;
  const soft = (Math.sin(t * Math.PI * 2 * 0.28 + 0.7) + 1) * 0.5;
  const heart = (t * 1.15 + 0.74) % 1;
  const halo = (t * 0.58 + 0.84) % 1;
  setParameter('Param', 0.82 + soft * 0.18);
  setParameter('Param5', 1);
  setParameter('Param6', heart * 3);
  setParameter('Param2', 0.78 + pulse * 0.22);
  setParameter('Param3', halo * 4);
  setParameter('Param4', 1);
  setParameter('Param11', 0);
}

function updateFrame(ticker) {
  if (!model) return;
  model.update(Number.isFinite(ticker?.deltaMS) ? ticker.deltaMS : 1000 / 60);
  if (chargeLoopActive && currentState && CHARGING_STATES.has(currentState)) {
    applyChargeLoopPose((performance.now() - chargeLoopStartedAt) / 1000);
  }
}

/* ---- public API ------------------------------------------------------- */
function setState(rawState) {
  const state = String(rawState || 'idle');
  if (state === currentState) return;
  currentState = state;
  lastInteractionAt = Date.now();
  clearChargeIntro();

  if (CHARGING_STATES.has(state)) { startChargeLoop(); return; }
  if (STATE_MOTION[state]) { playMotion(STATE_MOTION[state]); return; }
  enterIdle();
}

// Back-compat shim for the original player's status payload.
function setCodexStatus(status = {}) { setState(status.state ?? status.status ?? 'idle'); }

function playAutoIdle() {
  if (motionActive || chargeLoopActive) return;
  if (!CHARGING_STATES.has(currentState) && (currentState === 'idle' || currentState === 'resting')) {
    if (Date.now() - lastInteractionAt > AUTO_IDLE_TRIGGER_MS) {
      lastInteractionAt = Date.now();
      playMotion(AUTO_IDLE_MOTIONS[Math.floor(Math.random() * AUTO_IDLE_MOTIONS.length)]);
    }
  }
}

async function start() {
  if (!stageElement) throw new Error('missing #sn-live2d-stage');
  extensions.add(Live2DPlugin);
  configureCubismSDK({ memorySizeMB: 32 });

  app = new Application();
  await app.init({ resizeTo: stageElement, preference: 'webgl', backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: window.SN_CAPTURE === true ? 4 : Math.min(window.devicePixelRatio || 1, 2), preserveDrawingBuffer: window.SN_CAPTURE === true });
  app.canvas.id = 'sn-live2d-canvas';
  stageElement.appendChild(app.canvas);

  model = await Live2DModel.from(MODEL_URL, { textureOptions: { lod: 'single-auto' }, autoUpdate: false, autoFocus: false, autoHitTest: false, autoInteract: false });
  configureEyeBlink();
  model.anchor.set(0.5);
  app.stage.addChild(model);
  fitModel();
  app.ticker.add(updateFrame, undefined, UPDATE_PRIORITY.NORMAL);
  window.addEventListener('resize', fitModel);

  // tap the pet -> a happy little motion
  stageElement.addEventListener('pointerup', () => {
    lastInteractionAt = Date.now();
    if (!CHARGING_STATES.has(currentState)) playMotion(Math.random() < 0.5 ? 'Happy' : 'JoyJump');
  });

  enterIdle();
  setInterval(playAutoIdle, AUTO_IDLE_CHECK_MS);

  window.desktopPet = { setState, setCodexStatus, playMotion: (g) => playMotion(g), fit: fitModel };
  window.SNLive2DReady = true;
  window.dispatchEvent(new Event('sn-live2d-ready'));
}

start().catch((err) => {
  console.error('[SuperNoNo Live2D] load failed:', err);
  window.SNLive2DError = String(err?.message || err);
  window.dispatchEvent(new Event('sn-live2d-error'));
});
