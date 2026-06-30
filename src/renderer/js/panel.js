/*
 * panel.js — task detail panel (PRD §9.6).
 * Renders the TaskContext + PetState; only shows summaries (never raw
 * terminal output / secrets). Footer actions are dispatched by app.js.
 */
(function (global) {
  'use strict';

  const SN = global.SN || (global.SN = {});
  const cfg = SN.config;

  const els = {};

  function init() {
    els.panel = document.getElementById('sn-panel');
    els.stateLabel = els.panel.querySelector('[data-field="state-label"]');
    els.energyFill = els.panel.querySelector('[data-field="energy-fill"]');
    els.energyNum = els.panel.querySelector('[data-field="energy-num"]');
    els.taskTitle = els.panel.querySelector('[data-field="task-title"]');
    els.plan = els.panel.querySelector('[data-field="plan"]');
    els.actions = els.panel.querySelector('[data-field="actions"]');
    els.attn = els.panel.querySelector('[data-field="attn"]');
    els.artifactsWrap = els.panel.querySelector('[data-field="artifacts"]');
    els.artifactsList = els.panel.querySelector('[data-field="artifacts-list"]');
    els.nextStep = els.panel.querySelector('[data-field="next-step"]');
    els.openBtn = els.panel.querySelector('[data-act="open-artifact"]');
  }

  function isOpen() { return els.panel && !els.panel.hidden; }
  function open() { if (els.panel) els.panel.hidden = false; }
  function close() { if (els.panel) els.panel.hidden = true; }
  function toggle() { isOpen() ? close() : open(); }

  function render(petState, ctx) {
    if (!els.panel) init();
    const def = cfg.STATES[petState.state] || cfg.STATES.idle;

    // status chip + colour
    els.stateLabel.textContent = def.label;
    const stateColor = cfg.CATEGORY_COLOR[def.category] || 'var(--sn-c-neutral)';
    els.panel.style.setProperty('--sn-state-color', stateColor);

    // energy bar
    const band = cfg.energyBand(petState.energy);
    els.panel.style.setProperty('--sn-energy-color', band.color);
    els.energyFill.style.width = petState.energy + '%';
    els.energyNum.textContent = petState.energy + '%';

    // task title
    els.taskTitle.textContent = ctx.title || '暂无进行中的任务';

    // plan checklist
    els.plan.innerHTML = '';
    if (ctx.plan && ctx.plan.length) {
      for (const step of ctx.plan) {
        const li = document.createElement('li');
        li.dataset.status = step.status;
        li.textContent = step.text;
        els.plan.appendChild(li);
      }
    } else {
      const li = document.createElement('li');
      li.dataset.status = 'todo';
      li.textContent = '暂无计划';
      els.plan.appendChild(li);
    }

    // recent 3 actions (PRD §9.6)
    els.actions.innerHTML = '';
    const recent = (ctx.actions || []).slice(-3);
    if (recent.length) {
      for (const a of recent) {
        const li = document.createElement('li');
        li.textContent = a;
        els.actions.appendChild(li);
      }
    } else {
      const li = document.createElement('li');
      li.textContent = '尚无动作';
      els.actions.appendChild(li);
    }

    // attention banner
    if (petState.state === 'waiting_approval' && ctx.approvalCommand) {
      els.attn.hidden = false;
      els.attn.dataset.kind = 'approval';
      els.attn.textContent = '需要你批准：' + ctx.approvalCommand;
    } else if (petState.state === 'blocked' && ctx.blockReason) {
      els.attn.hidden = false;
      els.attn.dataset.kind = 'blocked';
      els.attn.textContent = '任务受阻：' + ctx.blockReason;
    } else {
      els.attn.hidden = true;
    }

    // artifacts
    els.artifactsList.innerHTML = '';
    if (ctx.artifacts && ctx.artifacts.length) {
      els.artifactsWrap.hidden = false;
      for (const art of ctx.artifacts) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.className = 'sn-path';
        btn.type = 'button';
        btn.textContent = art.label || art.path;
        btn.title = '打开 ' + art.path;
        btn.dataset.path = art.path;
        btn.addEventListener('click', () => SN.native.openPath(art.path));
        li.appendChild(btn);
        els.artifactsList.appendChild(li);
      }
      els.openBtn.disabled = false;
      els.openBtn.dataset.path = ctx.artifacts[0].path;
    } else {
      els.artifactsWrap.hidden = true;
      els.openBtn.disabled = true;
      delete els.openBtn.dataset.path;
    }

    // next step
    els.nextStep.textContent = ctx.nextStep || '—';
  }

  SN.panel = { init, render, open, close, toggle, isOpen };
})(typeof window !== 'undefined' ? window : globalThis);
