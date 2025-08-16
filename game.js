(() => {
  const stage = document.getElementById('stage');
  const catEl = document.getElementById('cat');
  const scoreEl = document.getElementById('score');
  const timeEl = document.getElementById('time');
  const overlayEl = document.getElementById('overlay');
  const btnStart = document.getElementById('btn-start');
  const btnRestart = document.getElementById('btn-restart');

  const touchControls = document.getElementById('touch-controls');
  const selectDifficulty = document.getElementById('select-difficulty');
  const selectMap = document.getElementById('select-map');

  /**
   * Game configuration
   */
  const GAME_DURATION_SECONDS = 60;
  const DIFFICULTY_CONFIG = {
    facile: { catSpeed: 280, mouseSpeed: 120, mouseSpawnMs: 1200, maxMice: 10, dogSpeed: 180, dogSpawnMs: 7000, maxDogs: 2, goldenChance: 0.06 },
    normal: { catSpeed: 260, mouseSpeed: 140, mouseSpawnMs: 1100, maxMice: 12, dogSpeed: 220, dogSpawnMs: 6000, maxDogs: 3, goldenChance: 0.08 },
    difficile: { catSpeed: 250, mouseSpeed: 160, mouseSpawnMs: 950, maxMice: 14, dogSpeed: 250, dogSpawnMs: 5200, maxDogs: 4, goldenChance: 0.10 },
    insane: { catSpeed: 240, mouseSpeed: 190, mouseSpawnMs: 800, maxMice: 16, dogSpeed: 290, dogSpawnMs: 4500, maxDogs: 5, goldenChance: 0.12 },
  };

  /**
   * Runtime state
   */
  const state = {
    running: false,
    startedAtMs: 0,
    elapsedMs: 0,
    remainingSeconds: GAME_DURATION_SECONDS,
    score: 0,
    cat: { x: 0, y: 0, width: 48, height: 48, vx: 0, vy: 0 },
    mice: [],
    pressedKeys: new Set(),
    spawnTimer: 0,
    lastFrameTs: 0,
    dogs: [],
    dogSpawnTimer: 0,
    endReason: null,
    difficultyKey: 'normal',
    mapKey: 'jardin',
    config: DIFFICULTY_CONFIG.normal,
    decors: [],
  };

  function resetGame() {
    state.running = false;
    state.startedAtMs = 0;
    state.elapsedMs = 0;
    state.remainingSeconds = GAME_DURATION_SECONDS;
    state.score = 0;
    state.cat.x = (stage.clientWidth - state.cat.width) / 2;
    state.cat.y = (stage.clientHeight - state.cat.height) / 2;
    state.cat.vx = 0;
    state.cat.vy = 0;

    // Clear mice dom/state
    state.mice.forEach(m => m.el.remove());
    state.mice = [];
    state.spawnTimer = 0;

    // Clear dogs
    state.dogs.forEach(d => d.el.remove());
    state.dogs = [];
    state.dogSpawnTimer = 0;
    state.endReason = null;

    // Clear decors and apply map theme
    applyMapTheme(state.mapKey);

    scoreEl.textContent = String(state.score);
    timeEl.textContent = String(state.remainingSeconds);
    positionEntity(catEl, state.cat.x, state.cat.y);

    // Spawn an initial dog
    spawnDog();
  }

  function startGame() {
    // Apply selections
    if (selectDifficulty && DIFFICULTY_CONFIG[selectDifficulty.value]) {
      state.difficultyKey = selectDifficulty.value;
      state.config = DIFFICULTY_CONFIG[state.difficultyKey];
    }
    if (selectMap) {
      state.mapKey = selectMap.value || 'jardin';
    }

    resetGame();
    overlayEl.classList.remove('show');
    state.running = true;
    state.startedAtMs = performance.now();
    state.lastFrameTs = state.startedAtMs;
    requestAnimationFrame(gameLoop);
  }

  function endGame(reason = 'time') {
    state.running = false;
    state.endReason = reason;
    overlayEl.classList.add('show');
    const panel = overlayEl.querySelector('.panel');
    const existing = panel.querySelector('.final');
    if (existing) existing.remove();
    const p = document.createElement('p');
    p.className = 'final';
    p.innerHTML = reason === 'caught'
      ? `Un chien t’a attrapé ! Score : <strong>${state.score}</strong>`
      : `Partie terminée ! Score : <strong>${state.score}</strong>`;
    panel.insertBefore(p, panel.querySelector('.actions'));
  }

  function positionEntity(el, x, y) {
    el.style.transform = `translate(${x}px, ${y}px)`;
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  // Helpers & variants
  function randBetween(min, max) { return Math.random() * (max - min) + min; }
  function pickWeighted(items) {
    const total = items.reduce((s, it) => s + (it.weight || 1), 0);
    let r = Math.random() * total;
    for (const it of items) {
      r -= (it.weight || 1);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  function chooseMouseVariant() {
    // Golden mouse chance based on difficulty
    const variants = [
      { name: 'normal', className: '', speedMult: 1.0, score: 1, width: 32, height: 32, weight: 60 },
      { name: 'speedy', className: 'speedy', speedMult: 1.35, score: 1, width: 30, height: 30, weight: 20 },
      { name: 'fat', className: 'fat', speedMult: 0.75, score: 2, width: 36, height: 36, weight: 16 },
    ];
    if (Math.random() < (state.config.goldenChance || 0)) {
      return { name: 'golden', className: 'golden', speedMult: 1.15, score: 3, width: 32, height: 32 };
    }
    return pickWeighted(variants);
  }

  function chooseDogVariant() {
    const variants = [
      { name: 'bulldog', className: 'bulldog', speedMult: 0.9, size: 46, weight: 40 },
      { name: 'greyhound', className: 'greyhound', speedMult: 1.2, size: 42, weight: 40 },
      { name: 'wolf', className: 'wolf', speedMult: 1.35, size: 44, weight: 20 },
    ];
    return pickWeighted(variants);
  }

  function clearDecors() {
    stage.querySelectorAll('.decor').forEach(d => d.remove());
    state.decors = [];
  }

  function spawnDecor(type, x, y) {
    const el = document.createElement('div');
    el.className = `decor ${type}`;
    stage.appendChild(el);
    // Fallback random positions if not provided
    const w = el.offsetWidth || 24;
    const h = el.offsetHeight || 24;
    const px = x != null ? x : randBetween(6, Math.max(6, stage.clientWidth - w - 6));
    const py = y != null ? y : randBetween(6, Math.max(6, stage.clientHeight - h - 6));
    el.style.transform = `translate(${px}px, ${py}px)`;
    state.decors.push(el);
  }

  function applyMapTheme(mapKey) {
    const classes = ['map-garden', 'map-city', 'map-snow', 'map-night'];
    stage.classList.remove(...classes);
    const key = mapKey || 'jardin';
    const className = key === 'ville' ? 'map-city' : key === 'neige' ? 'map-snow' : key === 'nuit' ? 'map-night' : 'map-garden';
    stage.classList.add(className);
    clearDecors();
    // Spawn simple decor for flavor
    if (className === 'map-garden') {
      for (let i = 0; i < 3; i++) spawnDecor('tree');
      for (let i = 0; i < 4; i++) spawnDecor('bush');
      for (let i = 0; i < 3; i++) spawnDecor('rock');
    } else if (className === 'map-city') {
      for (let i = 0; i < 2; i++) spawnDecor('bench');
      for (let i = 0; i < 3; i++) spawnDecor('lamp');
      for (let i = 0; i < 4; i++) spawnDecor('box');
      for (let i = 0; i < 3; i++) spawnDecor('cone');
    } else if (className === 'map-snow') {
      for (let i = 0; i < 3; i++) spawnDecor('pine');
      for (let i = 0; i < 2; i++) spawnDecor('snowman');
      for (let i = 0; i < 2; i++) spawnDecor('ice');
    } else if (className === 'map-night') {
      for (let i = 0; i < 3; i++) spawnDecor('tree');
      for (let i = 0; i < 2; i++) spawnDecor('bush');
      for (let i = 0; i < 3; i++) spawnDecor('lamp');
    }
  }

  function spawnMouse() {
    if (state.mice.length >= state.config.maxMice) return;

    const variant = chooseMouseVariant();
    const mouseEl = document.createElement('div');
    mouseEl.className = `entity mouse${variant.className ? ' ' + variant.className : ''}`;
    stage.appendChild(mouseEl);

    const side = Math.floor(Math.random() * 4); // 0 top, 1 right, 2 bottom, 3 left
    const padding = 6;
    const mw = variant.width;
    const mh = variant.height;
    mouseEl.style.width = mw + 'px';
    mouseEl.style.height = mh + 'px';
    let x = 0, y = 0;
    if (side === 0) { // top
      x = Math.random() * (stage.clientWidth - mw - padding*2) + padding;
      y = padding;
    } else if (side === 1) { // right
      x = stage.clientWidth - mw - padding;
      y = Math.random() * (stage.clientHeight - mh - padding*2) + padding;
    } else if (side === 2) { // bottom
      x = Math.random() * (stage.clientWidth - mw - padding*2) + padding;
      y = stage.clientHeight - mh - padding;
    } else { // left
      x = padding;
      y = Math.random() * (stage.clientHeight - mh - padding*2) + padding;
    }

    // Initial velocity pointing inward-ish
    const angle = Math.atan2((stage.clientHeight/2 - y), (stage.clientWidth/2 - x)) + (Math.random()*0.6 - 0.3);
    const speed = (state.config.mouseSpeed || 140) * variant.speedMult;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    const mouse = { x, y, width: mw, height: mh, vx, vy, el: mouseEl, speed, scoreValue: variant.score };
    positionEntity(mouseEl, x, y);
    state.mice.push(mouse);
  }

  function spawnDog() {
    if (state.dogs.length >= state.config.maxDogs) return;
    const v = chooseDogVariant();
    const dogEl = document.createElement('div');
    dogEl.className = `entity dog ${v.className}`;
    stage.appendChild(dogEl);

    const padding = 6;
    const dw = v.size || 44;
    const dh = v.size || 44;
    dogEl.style.width = dw + 'px';
    dogEl.style.height = dh + 'px';
    const side = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    if (side === 0) { x = Math.random() * (stage.clientWidth - dw - padding*2) + padding; y = padding; }
    else if (side === 1) { x = stage.clientWidth - dw - padding; y = Math.random() * (stage.clientHeight - dh - padding*2) + padding; }
    else if (side === 2) { x = Math.random() * (stage.clientWidth - dw - padding*2) + padding; y = stage.clientHeight - dh - padding; }
    else { x = padding; y = Math.random() * (stage.clientHeight - dh - padding*2) + padding; }

    const speed = (state.config.dogSpeed || 220) * v.speedMult;
    const dog = { x, y, width: dw, height: dh, vx: 0, vy: 0, el: dogEl, speed };
    positionEntity(dogEl, x, y);
    state.dogs.push(dog);
  }

  function updateCatVelocityFromInput() {
    const up = state.pressedKeys.has('ArrowUp') || state.pressedKeys.has('KeyW');
    const down = state.pressedKeys.has('ArrowDown') || state.pressedKeys.has('KeyS');
    const left = state.pressedKeys.has('ArrowLeft') || state.pressedKeys.has('KeyA');
    const right = state.pressedKeys.has('ArrowRight') || state.pressedKeys.has('KeyD');

    let dx = 0, dy = 0;
    if (up) dy -= 1;
    if (down) dy += 1;
    if (left) dx -= 1;
    if (right) dx += 1;

    if (dx === 0 && dy === 0) {
      state.cat.vx = 0; state.cat.vy = 0; return;
    }

    const len = Math.hypot(dx, dy) || 1;
    const speed = state.config?.catSpeed ?? 260;
    state.cat.vx = (dx / len) * speed;
    state.cat.vy = (dy / len) * speed;
  }

  function update(dt) {
    // Time
    state.elapsedMs += dt * 1000;
    const remaining = Math.max(0, GAME_DURATION_SECONDS - Math.floor(state.elapsedMs / 1000));
    if (remaining !== state.remainingSeconds) {
      state.remainingSeconds = remaining;
      timeEl.textContent = String(remaining);
      if (remaining <= 0) return endGame('time');
    }

    // Inputs -> cat velocity
    updateCatVelocityFromInput();

    // Move cat
    state.cat.x += state.cat.vx * dt;
    state.cat.y += state.cat.vy * dt;

    state.cat.x = clamp(state.cat.x, 0, stage.clientWidth - state.cat.width);
    state.cat.y = clamp(state.cat.y, 0, stage.clientHeight - state.cat.height);
    positionEntity(catEl, state.cat.x, state.cat.y);

    // Spawn mice
    state.spawnTimer += dt * 1000;
    if (state.spawnTimer >= (state.config.mouseSpawnMs || 1100)) {
      state.spawnTimer = 0;
      spawnMouse();
    }

    // Spawn dogs
    state.dogSpawnTimer += dt * 1000;
    if (state.dogSpawnTimer >= (state.config.dogSpawnMs || 6000)) {
      state.dogSpawnTimer = 0;
      spawnDog();
    }

    // Update dogs (chase cat) and collisions
    for (let i = 0; i < state.dogs.length; i++) {
      const d = state.dogs[i];
      const catCx = state.cat.x + state.cat.width / 2;
      const catCy = state.cat.y + state.cat.height / 2;
      const dogCx = d.x + d.width / 2;
      const dogCy = d.y + d.height / 2;
      let dx = catCx - dogCx;
      let dy = catCy - dogCy;
      const len = Math.hypot(dx, dy) || 1;
      d.vx = (dx / len) * d.speed;
      d.vy = (dy / len) * d.speed;

      d.x += d.vx * dt;
      d.y += d.vy * dt;

      d.x = clamp(d.x, 0, stage.clientWidth - d.width);
      d.y = clamp(d.y, 0, stage.clientHeight - d.height);
      positionEntity(d.el, d.x, d.y);

      if (rectsOverlap({ x: state.cat.x, y: state.cat.y, width: state.cat.width, height: state.cat.height }, d)) {
        return endGame('caught');
      }
    }

    // Update mice movement and collisions
    for (let i = state.mice.length - 1; i >= 0; i--) {
      const m = state.mice[i];
      // wander: slight steering randomness
      const jitter = 0.4; // radians per second small random drift
      const angle = Math.atan2(m.vy, m.vx) + (Math.random() - 0.5) * jitter * dt;
      const speed = m.speed;
      m.vx = Math.cos(angle) * speed;
      m.vy = Math.sin(angle) * speed;

      m.x += m.vx * dt;
      m.y += m.vy * dt;

      // bounce on walls
      if (m.x <= 0) { m.x = 0; m.vx = Math.abs(m.vx); }
      if (m.y <= 0) { m.y = 0; m.vy = Math.abs(m.vy); }
      if (m.x + m.width >= stage.clientWidth) { m.x = stage.clientWidth - m.width; m.vx = -Math.abs(m.vx); }
      if (m.y + m.height >= stage.clientHeight) { m.y = stage.clientHeight - m.height; m.vy = -Math.abs(m.vy); }

      positionEntity(m.el, m.x, m.y);

      // Collision with cat
      if (rectsOverlap({ x: state.cat.x, y: state.cat.y, width: state.cat.width, height: state.cat.height }, m)) {
        // remove mouse
        m.el.remove();
        state.mice.splice(i, 1);
        state.score += (m.scoreValue || 1);
        scoreEl.textContent = String(state.score);
      }
    }
  }

  function gameLoop(ts) {
    if (!state.running) return;
    const dt = Math.min(0.033, (ts - state.lastFrameTs) / 1000) || 0.016; // cap to avoid big jumps
    state.lastFrameTs = ts;

    update(dt);
    if (state.running) requestAnimationFrame(gameLoop);
  }

  // Keyboard input
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    state.pressedKeys.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    state.pressedKeys.delete(e.code);
  });

  // Touch controls
  function handleTouch(dir, isDown) {
    const mapping = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
    const code = mapping[dir];
    if (!code) return;
    if (isDown) state.pressedKeys.add(code); else state.pressedKeys.delete(code);
  }

  touchControls.addEventListener('touchstart', (e) => {
    const target = e.target.closest('button[data-dir]');
    if (!target) return;
    e.preventDefault();
    handleTouch(target.dataset.dir, true);
  }, { passive: false });
  touchControls.addEventListener('touchend', (e) => {
    const target = e.target.closest('button[data-dir]');
    if (!target) return;
    e.preventDefault();
    handleTouch(target.dataset.dir, false);
  }, { passive: false });
  touchControls.addEventListener('touchcancel', (e) => {
    const target = e.target.closest('button[data-dir]');
    if (!target) return;
    e.preventDefault();
    handleTouch(target.dataset.dir, false);
  }, { passive: false });

  // Start/Restart buttons
  btnStart?.addEventListener('click', () => startGame());
  btnRestart?.addEventListener('click', () => startGame());

  // Preview map theme on selection change (when overlay is visible)
  selectMap?.addEventListener('change', () => {
    applyMapTheme(selectMap.value);
  });

  // Resize handling to keep entities in bounds
  const resizeObserver = new ResizeObserver(() => {
    state.cat.x = clamp(state.cat.x, 0, stage.clientWidth - state.cat.width);
    state.cat.y = clamp(state.cat.y, 0, stage.clientHeight - state.cat.height);
    positionEntity(catEl, state.cat.x, state.cat.y);
    for (const m of state.mice) {
      m.x = clamp(m.x, 0, stage.clientWidth - m.width);
      m.y = clamp(m.y, 0, stage.clientHeight - m.height);
      positionEntity(m.el, m.x, m.y);
    }
    for (const d of state.dogs) {
      d.x = clamp(d.x, 0, stage.clientWidth - d.width);
      d.y = clamp(d.y, 0, stage.clientHeight - d.height);
      positionEntity(d.el, d.x, d.y);
    }
  });
  resizeObserver.observe(stage);

  // Init
  applyMapTheme(state.mapKey);
  resetGame();
})();