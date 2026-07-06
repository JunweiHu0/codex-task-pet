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
    els.ma = els.panel.querySelector('[data-field="ma"]');
    els.maSummary = els.panel.querySelector('[data-field="ma-summary"]');
    els.maCards = els.panel.querySelector('[data-field="ma-cards"]');
    els.maFilter = els.panel.querySelector('[data-field="ma-filter"]');
    els.maTimeline = els.panel.querySelector('[data-field="ma-timeline"]');
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

  /* ---- multiagent section (Phase 1) --------------------------------------
   * Shown only when at least one real (non-default) agent has reported, so the
   * single-agent / demo panel looks exactly like v1.0. All text goes through
   * textContent — action strings come from external processes and must never
   * be treated as HTML.
   */
  function relTime(ts) {
    if (!ts) return '';
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 5) return '刚刚';
    if (s < 60) return s + ' 秒前';
    const m = Math.round(s / 60);
    if (m < 60) return m + ' 分钟前';
    return Math.round(m / 60) + ' 小时前';
  }

  function clock(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  const ACTIVE_STATES = ['thinking', 'scanning', 'building', 'validating'];

  // Display names for known agents; unknown agents show their raw (safe) id.
  const AGENT_LABELS = { codex: 'Codex', 'claude-code': 'Claude Code', local: '本地' };
  const agentLabel = (a) => AGENT_LABELS[a] || a;

  // "abcdef…wxyz" — enough to tell sessions apart without eating the row.
  function shortSession(s) {
    if (typeof s !== 'string' || !s) return '';
    return s.length > 12 ? s.slice(0, 6) + '…' + s.slice(-4) : s;
  }

  // Timeline filter state (in-memory only). 'all' or an agent id.
  let timelineFilter = 'all';

  function renderMultiagent() {
    if (!els.ma || !SN.agents) return;
    const agents = SN.agents.getAgents();
    const hasRealAgent = agents.some((a) => a.key !== 'default');
    els.ma.hidden = !hasRealAgent;
    if (!hasRealAgent) return;

    // summary: active / needs attention / completed (events this session)
    const active = agents.filter((a) => ACTIVE_STATES.includes(a.state)).length;
    const attention = agents.filter((a) => a.requiresUserAction).length;
    const completed = SN.agents.getTimeline().filter((e) => e.type === 'completed').length;
    els.maSummary.innerHTML = '';
    for (const [label, num, hot] of [['活跃', active, false], ['需处理', attention, attention > 0], ['已完成', completed, false]]) {
      const span = document.createElement('span');
      if (hot) span.dataset.hot = 'true';
      const b = document.createElement('b');
      b.textContent = String(num);
      span.appendChild(b);
      span.appendChild(document.createTextNode(' ' + label));
      els.maSummary.appendChild(span);
    }

    renderAgentCards(agents);
    renderTimeline();
  }

  /* Agent cards: click = manual focus (click again to release); pin button =
   * hard focus lock. All externally-sourced text goes through textContent. */
  function renderAgentCards(agents) {
    els.maCards.innerHTML = '';
    for (const a of agents) {
      const def = cfg.STATES[a.state] || cfg.STATES.idle;
      const li = document.createElement('li');
      li.className = 'sn-agent-card no-drag';
      li.dataset.focused = a.focused ? 'true' : 'false';
      li.dataset.attn = a.requiresUserAction ? 'true' : 'false';
      li.dataset.pinned = a.pinned ? 'true' : 'false';
      li.dataset.stale = a.stale ? 'true' : 'false';
      li.style.setProperty('--sn-agent-color', cfg.CATEGORY_COLOR[def.category] || 'var(--sn-c-neutral)');
      li.title = a.pinned ? '已固定关注此 agent'
        : a.manualFocused ? '点击取消手动关注'
          : '点击关注此 agent';
      li.addEventListener('click', () => { if (SN.agents.setManualFocus) SN.agents.setManualFocus(a.key); });

      // head: name | state + pin
      const head = document.createElement('div');
      head.className = 'sn-agent-card__head';
      const name = document.createElement('span');
      name.className = 'sn-agent-card__name';
      name.textContent = agentLabel(a.agent);
      const right = document.createElement('span');
      right.className = 'sn-agent-card__headright';
      const state = document.createElement('span');
      state.className = 'sn-agent-card__state';
      state.textContent = def.label;
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'sn-agent-card__pin no-drag';
      pin.textContent = a.pinned ? '已固定' : '固定';
      pin.title = a.pinned ? '取消固定，恢复自动关注' : '固定关注此 agent（授权/阻塞仍会提醒）';
      pin.setAttribute('aria-pressed', a.pinned ? 'true' : 'false');
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        if (a.pinned) SN.agents.unpinAgent();
        else SN.agents.pinAgent(a.key);
      });
      right.appendChild(state);
      right.appendChild(pin);
      head.appendChild(name);
      head.appendChild(right);
      li.appendChild(head);

      // latest action (truncated by CSS, full text on hover)
      const line = document.createElement('div');
      line.className = 'sn-agent-card__line';
      line.textContent = a.lastAction || a.title || '';
      if (a.lastAction) line.title = a.lastAction;
      li.appendChild(line);

      // meta: adapter · session short · relative time · badges
      const meta = document.createElement('div');
      meta.className = 'sn-agent-card__meta';
      const bits = [];
      if (a.adapter) bits.push(a.adapter);
      const sess = shortSession(a.sessionId);
      if (sess) bits.push(sess);
      bits.push(relTime(a.lastEventAt));
      const metaText = document.createElement('span');
      metaText.className = 'sn-agent-card__metaText';
      metaText.textContent = bits.join(' · ');
      meta.appendChild(metaText);
      if (a.stale) {
        const stale = document.createElement('span');
        stale.className = 'sn-badge sn-badge--stale';
        stale.textContent = '可能卡住';
        stale.title = '工作状态下超过 2 分钟没有新事件';
        meta.appendChild(stale);
      }
      if (a.requiresUserAction) {
        const attn = document.createElement('span');
        attn.className = 'sn-badge sn-badge--attn';
        attn.textContent = '需要你处理';
        meta.appendChild(attn);
      }
      li.appendChild(meta);

      els.maCards.appendChild(li);
    }
  }

  /* Timeline with per-agent filter. Filter buttons appear only when the
   * timeline actually contains more than one agent. */
  function renderTimeline() {
    const all = SN.agents.getTimeline();

    // filter row (first-seen order keeps codex/claude positions stable)
    const seen = [];
    for (const e of all) { if (!seen.includes(e.agent)) seen.push(e.agent); }
    const showFilter = seen.length > 1;
    els.maFilter.hidden = !showFilter;
    els.maFilter.innerHTML = '';
    if (showFilter) {
      if (timelineFilter !== 'all' && !seen.includes(timelineFilter)) timelineFilter = 'all';
      for (const val of ['all', ...seen]) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sn-ma__filterbtn no-drag';
        btn.dataset.active = timelineFilter === val ? 'true' : 'false';
        btn.textContent = val === 'all' ? '全部' : agentLabel(val);
        btn.addEventListener('click', () => {
          timelineFilter = val;
          renderTimeline();
        });
        els.maFilter.appendChild(btn);
      }
    } else if (timelineFilter !== 'all') {
      timelineFilter = 'all';
    }

    // events: apply filter, newest first, latest 30
    els.maTimeline.innerHTML = '';
    const events = (timelineFilter === 'all' ? all : all.filter((e) => e.agent === timelineFilter))
      .slice(-30).reverse();
    for (const e of events) {
      const li = document.createElement('li');
      const b = document.createElement('b');
      b.textContent = agentLabel(e.agent);
      li.appendChild(document.createTextNode(relTime(e.at) + ' '));
      li.appendChild(b);
      li.appendChild(document.createTextNode(' ' + e.type + (e.action ? ' — ' + e.action : '')));
      li.title = clock(e.at) + ' ' + (e.action || e.type);
      els.maTimeline.appendChild(li);
    }
  }

  function render(petState, ctx) {
    if (!els.panel) init();
    renderMultiagent();
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
