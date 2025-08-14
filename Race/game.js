(() => {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  // גודל דינמי לפי DPR
  function fitCanvas() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    // שומרים על יחס אנכי (דרך CSS), כאן רק DPI אמיתי
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);
  window.addEventListener('orientationchange', () => setTimeout(fitCanvas, 200));

  // משחק: רודף אינסופי עם נתיבים
  const state = {
    running: false,
    t: 0,
    score: 0,
    speed: 6,        // פיקסלים לפריים בסיסי (יגדל)
    maxSpeed: 18,
    laneW: 80,
    lanes: 3,
    car: { x: 0, y: 0, w: 50, h: 90, lane: 1, targetLane: 1, vx: 0 },
    obstacles: [],
    roadOffset: 0,
    input: { left: false, right: false, go: false },
  };

  const hudScore = document.getElementById('score');
  const hudSpeed = document.getElementById('speed');
  const msg = document.getElementById('msg');

  // הגדרת נתיבים לפי רוחב
  function layout() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const margin = Math.max(20, Math.min(40, Math.floor(w * 0.05)));
    const roadW = Math.min(500, w - margin * 2);
    state.laneW = Math.floor(roadW / state.lanes);
    state.road = { x: (w - roadW) / 2, y: 0, w: roadW, h: h };

    state.car.w = Math.floor(state.laneW * 0.6);
    state.car.h = Math.floor(state.car.w * 1.7);
    state.car.y = h - state.car.h - 24;
    snapToLane(state.car.lane, true);
  }
  function laneX(laneIndex) {
    return state.road.x + laneIndex * state.laneW + (state.laneW - state.car.w) / 2;
  }
  function snapToLane(i, instant=false) {
    i = Math.max(0, Math.min(state.lanes - 1, i));
    state.car.targetLane = i;
    const targetX = laneX(i);
    if (instant) state.car.x = targetX;
  }

  // ציור רכב פשוט
  function drawCar(x, y, w, h, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(0, 0, w, h, Math.min(10, w*0.15));
    } else {
      ctx.rect(0, 0, w, h);
    }
    ctx.fill();
    // חלון
    ctx.fillStyle = '#8fd8ff';
    ctx.fillRect(w*0.2, h*0.18, w*0.6, h*0.35);
    // גלגלים
    ctx.fillStyle = '#111';
    const gw = Math.max(6, w*0.18), gh = Math.max(6, h*0.18);
    ctx.fillRect(-gw*0.2, h*0.1, gw, gh);
    ctx.fillRect(w - gw*0.8, h*0.1, gw, gh);
    ctx.fillRect(-gw*0.2, h - gh - h*0.1, gw, gh);
    ctx.fillRect(w - gw*0.8, h - gh - h*0.1, gw, gh);
    ctx.restore();
  }

  // מכשולים
  function spawnObstacle() {
    const lane = Math.floor(Math.random() * state.lanes);
    const w = state.car.w * (0.9 + Math.random()*0.25);
    const h = state.car.h * (0.85 + Math.random()*0.4);
    state.obstacles.push({
      lane,
      x: laneX(lane),
      y: -h - 10,
      w, h,
      color: Math.random()<0.5 ? '#f2a' : '#f93',
      passed: false,
      speedMul: 0.9 + Math.random()*0.2
    });
  }

  // קלט
  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key === 'ArrowLeft') state.input.left = true;
    if (e.key === 'ArrowRight') state.input.right = true;
    if (e.key === 'ArrowUp' || e.key === ' ') state.input.go = true;
    if (!state.running) start();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
    if (e.key === 'ArrowLeft') state.input.left = false;
    if (e.key === 'ArrowRight') state.input.right = false;
    if (e.key === 'ArrowUp' || e.key === ' ') state.input.go = false;
  });

  // כפתורי מגע
  function bindHold(btn, on, off) {
    const startPress = (e) => { e.preventDefault(); on(); if (!state.running) startGame(); };
    const endPress = (e) => { e.preventDefault(); off(); };
    btn.addEventListener('touchstart', startPress, {passive:false});
    btn.addEventListener('mousedown', startPress);
    ['touchend','touchcancel','mouseup','mouseleave'].forEach(ev => btn.addEventListener(ev, endPress));
  }
  bindHold(document.getElementById('left'), () => state.input.left = true, () => state.input.left = false);
  bindHold(document.getElementById('right'), () => state.input.right = true, () => state.input.right = false);
  bindHold(document.getElementById('go'), () => state.input.go = true, () => state.input.go = false);

  // התחלה בנגיעה על הקנבס
  canvas.addEventListener('pointerdown', () => { if (!state.running) start(); });

  // מתמטיקה
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function rectsOverlap(a,b){ return !(a.x+a.w<b.x || a.x>b.x+b.w || a.y+a.h<b.y || a.y>b.y+b.h); }

  // ציור כביש
  function drawRoad() {
    const {x, y, w, h} = state.road;
    // אספלט
    ctx.fillStyle = '#26282d';
    ctx.fillRect(x, y, w, h);

    // קווי נתיב
    const laneLineW = 6, dashH = 28, gap = 28;
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = laneLineW;
    if (ctx.setLineDash) {
      ctx.setLineDash([dashH, gap]);
      ctx.lineDashOffset = -state.roadOffset;
    }
    for (let i=1; i<state.lanes; i++){
      const lx = Math.round(x + i*state.laneW);
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, h);
      ctx.stroke();
    }
    if (ctx.setLineDash) ctx.setLineDash([]);
    // שוליים
    ctx.fillStyle = '#cdd1d5';
    ctx.fillRect(x-10, 0, 10, h);
    ctx.fillRect(x+w, 0, 10, h);
  }

  // לולאת משחק
  function startGame(){
    state.running = true;
    msg.classList.add('hidden');
  }
  function start(){
    layout();
    if (!state.running) startGame();
  }
  layout();

  let last = performance.now();
  function frame(now){
    const dt = Math.min(50, now - last); // ms
    last = now;
    const w = canvas.clientWidth, h = canvas.clientHeight;

    // ניקוי
    ctx.clearRect(0,0,w,h);

    // עדכון מהירות
    const accel = state.input.go ? 0.015 : -0.01;
    state.speed = clamp(state.speed + accel * dt, 3, state.maxSpeed);
    state.roadOffset += state.speed * dt * 0.12;

    // שליטה בנתיבים
    if (state.input.left) snapToLane(state.car.targetLane - 1);
    if (state.input.right) snapToLane(state.car.targetLane + 1);
    // מעבר חלק בין נתיב לנתיב
    const targetX = laneX(state.car.targetLane);
    state.car.x += (targetX - state.car.x) * Math.min(1, dt/90);

    // ספאון מכשולים
    if (Math.random() < 0.02 + state.speed/1200) spawnObstacle();

    // עדכון מכשולים
    for (const o of state.obstacles) {
      o.y += state.speed * o.speedMul * dt * 0.12;
      // ניקוד כשעברנו
      if (!o.passed && o.y > state.car.y + state.car.h) {
        o.passed = true;
        state.score += 10;
      }
    }
    // ניקוי מכשולים מחוץ למסך
    state.obstacles = state.obstacles.filter(o => o.y < h + 120);

    // ציור כביש
    drawRoad();

    // ציור מכשולים
    for (const o of state.obstacles) {
      drawCar(o.x, o.y, o.w, o.h, o.color);
    }

    // ציור הרכב
    drawCar(state.car.x, state.car.y, state.car.w, state.car.h, '#39f');

    // HUD
    hudScore.textContent = 'נק׳ ' + String(state.score).padStart(4,'0');
    hudSpeed.textContent = 'מהירות ' + Math.round(state.speed*8);

    // התנגשות
    const carRect = {x:state.car.x, y:state.car.y, w:state.car.w, h:state.car.h};
    for (const o of state.obstacles) {
      const r = {x:o.x, y:o.y, w:o.w, h:o.h};
      if (rectsOverlap(carRect, r)) {
        gameOver();
        break;
      }
    }

    state.t += dt;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function gameOver(){
    state.running = false;
    state.speed = 6;
    state.obstacles.length = 0;
    msg.classList.remove('hidden');
    // שומר ניקוד הגבוה ב-localStorage
    const hi = Math.max(state.score, Number(localStorage.getItem('hi')||0));
    localStorage.setItem('hi', String(hi));
    const hiStr = 'שיא אישי: ' + hi;
    // מנקה הודעת שיא קודמת אם יש
    const container = msg.querySelector('div > div');
    const old = container.querySelector('.hi');
    if (old) old.remove();
    const span = document.createElement('div');
    span.className = 'hi';
    span.style.marginTop = '8px';
    span.style.opacity = '.85';
    span.textContent = hiStr;
    container.appendChild(span);
    // איפוס ניקוד
    state.score = 0;
  }

  // התחלת משחק אחרי אינטראקציה ראשונה
  setTimeout(layout, 100);
})();