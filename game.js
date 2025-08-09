(() => {
  const stage = document.getElementById('stage');
  const catEl = document.getElementById('cat');
  const scoreEl = document.getElementById('score');
  const timeEl = document.getElementById('time');
  const overlayEl = document.getElementById('overlay');
  const btnStart = document.getElementById('btn-start');
  const btnRestart = document.getElementById('btn-restart');

  const touchControls = document.getElementById('touch-controls');

  /**
   * Game configuration
   */
  const GAME_DURATION_SECONDS = 60;
  const CAT_SPEED_PX_PER_SEC = 260;
  const MOUSE_SPEED_PX_PER_SEC = 140;
  const MOUSE_SPAWN_INTERVAL_MS = 1100;
  const MAX_MICE = 12;
  const DOG_SPEED_PX_PER_SEC = 220;
  const DOG_SPAWN_INTERVAL_MS = 6000;
  const MAX_DOGS = 3;

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

    scoreEl.textContent = String(state.score);
    timeEl.textContent = String(state.remainingSeconds);
    positionEntity(catEl, state.cat.x, state.cat.y);

    // Spawn an initial dog
    spawnDog();
  }

  function startGame() {
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

  function spawnMouse() {
    if (state.mice.length >= MAX_MICE) return;

    const mouseEl = document.createElement('div');
    mouseEl.className = 'entity mouse';
    stage.appendChild(mouseEl);

    const side = Math.floor(Math.random() * 4); // 0 top, 1 right, 2 bottom, 3 left
    const padding = 6;
    let x = 0, y = 0;
    if (side === 0) { // top
      x = Math.random() * (stage.clientWidth - 32 - padding*2) + padding;
      y = padding;
    } else if (side === 1) { // right
      x = stage.clientWidth - 32 - padding;
      y = Math.random() * (stage.clientHeight - 32 - padding*2) + padding;
    } else if (side === 2) { // bottom
      x = Math.random() * (stage.clientWidth - 32 - padding*2) + padding;
      y = stage.clientHeight - 32 - padding;
    } else { // left
      x = padding;
      y = Math.random() * (stage.clientHeight - 32 - padding*2) + padding;
    }

    // Initial velocity pointing inward-ish
    const angle = Math.atan2((stage.clientHeight/2 - y), (stage.clientWidth/2 - x)) + (Math.random()*0.6 - 0.3);
    const vx = Math.cos(angle) * MOUSE_SPEED_PX_PER_SEC;
    const vy = Math.sin(angle) * MOUSE_SPEED_PX_PER_SEC;

    const mouse = { x, y, width: 32, height: 32, vx, vy, el: mouseEl };
    positionEntity(mouseEl, x, y);
    state.mice.push(mouse);
  }

  function spawnDog() {
    if (state.dogs.length >= MAX_DOGS) return;
    const dogEl = document.createElement('div');
    dogEl.className = 'entity dog';
    stage.appendChild(dogEl);

    const padding = 6;
    const side = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    if (side === 0) { x = Math.random() * (stage.clientWidth - 44 - padding*2) + padding; y = padding; }
    else if (side === 1) { x = stage.clientWidth - 44 - padding; y = Math.random() * (stage.clientHeight - 44 - padding*2) + padding; }
    else if (side === 2) { x = Math.random() * (stage.clientWidth - 44 - padding*2) + padding; y = stage.clientHeight - 44 - padding; }
    else { x = padding; y = Math.random() * (stage.clientHeight - 44 - padding*2) + padding; }

    const dog = { x, y, width: 44, height: 44, vx: 0, vy: 0, el: dogEl };
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
    state.cat.vx = (dx / len) * CAT_SPEED_PX_PER_SEC;
    state.cat.vy = (dy / len) * CAT_SPEED_PX_PER_SEC;
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
    if (state.spawnTimer >= MOUSE_SPAWN_INTERVAL_MS) {
      state.spawnTimer = 0;
      spawnMouse();
    }

    // Spawn dogs
    state.dogSpawnTimer += dt * 1000;
    if (state.dogSpawnTimer >= DOG_SPAWN_INTERVAL_MS) {
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
      d.vx = (dx / len) * DOG_SPEED_PX_PER_SEC;
      d.vy = (dy / len) * DOG_SPEED_PX_PER_SEC;

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
      const speed = MOUSE_SPEED_PX_PER_SEC;
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
        state.score += 1;
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
  resetGame();
})();