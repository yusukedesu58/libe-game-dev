// ゲーム本体：場面の進行、物理、当たり判定、CPU、画面描画。
(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const { W, H, STAGE_R: R, STAGE_CX: CX, STAGE_CY: CY, TILT, PLAYER_R: PR } = CFG;
  const INK = '#1b2340';
  const DEMO = new URLSearchParams(location.search).has('demo'); // ?demo でCPUだけの試合を流す

  // ---------- 画面サイズ ----------
  const view = { s: 1, x: 0, y: 0 };
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(innerWidth * dpr));
    canvas.height = Math.max(1, Math.round(innerHeight * dpr));
    view.s = Math.min(canvas.width / W, canvas.height / H);
    view.x = (canvas.width - W * view.s) / 2;
    view.y = (canvas.height - H * view.s) / 2;
  }
  addEventListener('resize', resize);
  resize();

  // ---------- 状態 ----------
  let scene = 'join';       // join → countdown → play → result
  let sceneT = 0, now = 0;
  let slots = [null, null, null, null]; // 参加した入力機器のID
  let picks = [null, null, null, null]; // 参加者が選んだキャラ { key: 名簿のキー, body: 胴体タイプ }
  let players = [], particles = [];
  let hitstop = 0, shake = 0, timeLeft = 0, winner = null;
  const prevBtn = {};

  const START_POS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function makePlayer(i, device, pick) {
    const [px, py] = START_POS[i];
    const ch = (pick && Roster.get(pick.key)) || Roster.get('d' + i);
    return {
      index: i, device, cpu: !device, label: device ? 'P' + (i + 1) : 'CPU',
      color: PLAYER_COLORS[i], face: ch.face, name: ch.name, body: pick ? pick.body : i,
      x: px * 170, y: py * 170, z: 0, vx: 0, vy: 0, vz: 0,
      fx: -px || 0, fy: -py || 0,
      state: 'idle', timer: 0, charge: 0, hold: 0, dashSpeed: 0, hit: new Set(),
      percent: 0, stocks: CFG.STOCKS, alive: true,
      shield: 1, inv: 0, flash: 0, spin: 0, spinV: 0, walk: 0, prevAttack: false,
      ai: { hold: 0, cool: 0.6 + Math.random(), guardT: 0, tick: 0 },
    };
  }
  const previews = [0, 1, 2, 3].map(i => { const p = makePlayer(i, null); p.fx = 0; p.fy = 1; return p; });

  function startMatch() {
    players = [];
    for (let i = 0; i < 4; i++) {
      const dev = DEMO ? null : slots[i];
      if (dev || i < CFG.FILL_CPU) players.push(makePlayer(i, dev, dev ? picks[i] : null));
    }
    particles = []; hitstop = 0; shake = 0; winner = null;
    timeLeft = CFG.MATCH_TIME;
    scene = 'countdown'; sceneT = 0;
  }

  // ---------- 更新 ----------
  function edges(id) {
    const st = Input.read(id), prev = prevBtn[id] || {};
    prevBtn[id] = st;
    return {
      attack: st.attack && !prev.attack, guard: st.guard && !prev.guard, start: st.start && !prev.start,
      // スティックをたおした瞬間（キャラ選びに使う）
      left: st.mx < -0.6 && !(prev.mx < -0.6), right: st.mx > 0.6 && !(prev.mx > 0.6),
      up: st.my < -0.6 && !(prev.my < -0.6), down: st.my > 0.6 && !(prev.my > 0.6),
    };
  }

  // 参加したときの最初のキャラ：まだ誰も選んでいない、いちばん新しい登録キャラ。なければ仮キャラ。
  function autoPick(i) {
    const used = new Set(picks.filter(Boolean).map(p => p.key));
    const c = Roster.all().find(c => !c.builtin && !used.has(c.key));
    return c ? c.key : 'd' + i;
  }

  function update(dt) {
    now += dt; sceneT += dt;
    shake *= Math.exp(-10 * dt);
    const ev = {};
    for (const id of Input.devices()) ev[id] = edges(id);
    const any = k => Object.values(ev).some(e => e[k]);

    if (scene === 'join') {
      if (DEMO) { startMatch(); return; }
      for (const id in ev) {
        const idx = slots.indexOf(id);
        if (ev[id].attack && idx < 0) {
          const free = slots.indexOf(null);
          if (free >= 0) { slots[free] = id; picks[free] = { key: autoPick(free), body: 0 }; }
        } else if (ev[id].guard && idx >= 0) {
          slots[idx] = null; picks[idx] = null;
        } else if (idx >= 0) {
          // 左右でキャラ、上下で胴体タイプ
          const all = Roster.all(), pk = picks[idx], nb = Characters.BODY_NAMES.length;
          let ci = Math.max(0, all.findIndex(c => c.key === pk.key));
          if (ev[id].right) ci = (ci + 1) % all.length;
          if (ev[id].left) ci = (ci - 1 + all.length) % all.length;
          pk.key = all[ci].key;
          if (ev[id].down) pk.body = (pk.body + 1) % nb;
          if (ev[id].up) pk.body = (pk.body + nb - 1) % nb;
        }
      }
      if (any('start') && slots.some(s => s)) startMatch();
    } else if (scene === 'countdown') {
      if (sceneT >= 3) { scene = 'play'; sceneT = 0; }
    } else if (scene === 'play') {
      if (hitstop > 0) { hitstop -= dt; return; }
      stepPlay(dt);
    } else if (scene === 'result') {
      updateParticles(dt);
      if (Math.random() < dt * 40) confetti();
      if (DEMO ? sceneT > 5 : sceneT > 1.5 && (any('attack') || any('start'))) {
        if (DEMO) startMatch(); else { scene = 'join'; sceneT = 0; }
      }
    }
  }

  function stepPlay(dt) {
    timeLeft -= dt;
    for (const p of players) {
      if (!p.alive) continue;
      const inp = p.cpu ? cpuThink(p, dt) : Input.read(p.device);
      updatePlayer(p, inp, dt);
    }
    resolveHits();
    pushApart();
    for (const p of players) {
      if (!p.alive || p.state === 'fall' || p.state === 'drop') continue;
      if (Math.hypot(p.x, p.y) > R + 6) { p.state = 'fall'; p.vz = 160; p.charge = 0; }
    }
    updateParticles(dt);

    const alive = players.filter(p => p.alive);
    if ((players.length > 1 && alive.length <= 1) || alive.length === 0 || timeLeft <= 0) {
      alive.sort((a, b) => b.stocks - a.stocks || a.percent - b.percent);
      winner = alive[0] || null;
      scene = 'result'; sceneT = 0;
    }
  }

  function updatePlayer(p, inp, dt) {
    p.inv = Math.max(0, p.inv - dt);
    p.flash = Math.max(0, p.flash - dt);
    const pressed = inp.attack && !p.prevAttack;
    p.prevAttack = inp.attack;

    const mag = Math.hypot(inp.mx, inp.my);
    if ((p.state === 'idle' || p.state === 'charge') && mag > 0.3) { p.fx = inp.mx / mag; p.fy = inp.my / mag; }

    let ax = 0, ay = 0, damp = CFG.DAMP;
    switch (p.state) {
      case 'idle':
        if (inp.guard && p.shield > 0.15) { p.state = 'guard'; break; }
        if (pressed) { p.state = 'charge'; p.charge = 0; p.hold = 0; }
        ax = inp.mx * CFG.ACCEL; ay = inp.my * CFG.ACCEL;
        break;
      case 'charge':
        p.hold += dt;
        p.charge = Math.min(1, p.hold / CFG.CHARGE_TIME);
        ax = inp.mx * CFG.ACCEL * CFG.CHARGE_MOVE; ay = inp.my * CFG.ACCEL * CFG.CHARGE_MOVE;
        if (!inp.attack || p.hold > CFG.CHARGE_MAX_HOLD) {
          // 短押しはため具合0の素早い体当たりにする
          if (p.hold < 0.15) p.charge = 0;
          p.state = 'dash';
          p.timer = CFG.DASH_TIME + CFG.DASH_TIME_C * p.charge;
          p.dashSpeed = CFG.DASH_SPEED + CFG.DASH_SPEED_C * p.charge;
          p.hit = new Set();
        }
        break;
      case 'guard':
        p.shield -= dt / CFG.SHIELD_TIME;
        if (p.shield <= 0) guardBreak(p);
        else if (!inp.guard) p.state = 'idle';
        break;
      case 'dash':
        p.timer -= dt; damp = 0;
        p.vx = p.fx * p.dashSpeed; p.vy = p.fy * p.dashSpeed;
        if (p.timer <= 0) { p.state = 'recover'; p.timer = CFG.RECOVER + CFG.RECOVER_C * p.charge; }
        break;
      case 'recover': case 'stun':
        p.timer -= dt;
        if (p.timer <= 0) p.state = 'idle';
        break;
      case 'hitstun':
        p.timer -= dt; damp = CFG.DAMP_HIT; p.spin += p.spinV * dt;
        if (p.timer <= 0) { p.state = 'idle'; p.spin = 0; }
        break;
      case 'fall':
        p.vz -= 2200 * dt; p.z += p.vz * dt; damp = 1; p.spin += 9 * dt;
        if (p.z < -520) loseStock(p);
        break;
      case 'drop':
        p.vz -= 2200 * dt; p.z += p.vz * dt;
        if (p.z <= 0) { p.z = 0; p.vz = 0; p.state = 'idle'; }
        break;
    }
    if (p.state !== 'guard') p.shield = Math.min(1, p.shield + dt / CFG.SHIELD_REGEN);

    p.vx += ax * dt; p.vy += ay * dt;
    const k = Math.exp(-damp * dt);
    p.vx *= k; p.vy *= k;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.walk += Math.hypot(p.vx, p.vy) * dt * 0.045;
  }

  function guardBreak(p) {
    p.shield = 0; p.state = 'stun'; p.timer = CFG.GUARD_BREAK;
    burst(p.x, p.y, 40, '#9be7ff', 14, 260);
  }

  function loseStock(p) {
    p.stocks--;
    shake = Math.max(shake, 16);
    burst(p.x, p.y, 0, p.color.main, 34, 620, 520);
    if (p.stocks <= 0) { p.alive = false; return; }
    const a = Math.random() * Math.PI * 2;
    Object.assign(p, {
      x: Math.cos(a) * 100, y: Math.sin(a) * 100, z: 520, vx: 0, vy: 0, vz: 0,
      state: 'drop', percent: 0, spin: 0, charge: 0, shield: 1, inv: CFG.RESPAWN_INV + 0.7,
    });
  }

  // 体当たりの命中判定。同時に当たった場合（相打ち）も両方に効くよう、先に集めてから適用する。
  function resolveHits() {
    const hits = [];
    for (const a of players) {
      if (!a.alive || a.state !== 'dash') continue;
      for (const b of players) {
        if (b === a || !b.alive || b.inv > 0 || b.state === 'fall' || b.state === 'drop' || a.hit.has(b)) continue;
        if (Math.hypot(b.x - a.x, b.y - a.y) < PR * 2 + 8) { hits.push([a, b]); a.hit.add(b); }
      }
    }
    for (const [a, b] of hits) applyHit(a, b);
  }

  function applyHit(a, b) {
    let dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    // 飛ぶ向き：攻撃側の進行方向を主に、位置関係を少し混ぜる
    let nx = a.fx * 0.6 + dx / d * 0.4, ny = a.fy * 0.6 + dy / d * 0.4;
    const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;

    if (b.state === 'guard') {
      // ガード成功：守った側は少し下がるだけ。攻撃側がはじかれる。
      b.shield -= CFG.SHIELD_HIT;
      b.vx = nx * 140; b.vy = ny * 140;
      if (b.shield <= 0) guardBreak(b);
      a.state = 'hitstun'; a.timer = 0.4; a.spinV = 0;
      a.vx = -nx * 320; a.vy = -ny * 320;
      burst(mx, my, 40, '#9be7ff', 10, 240);
      hitstop = 0.05; shake = Math.max(shake, 4);
      return;
    }
    const c = a.charge;
    b.percent += CFG.DMG + CFG.DMG_C * c;
    const kb = (CFG.KB_BASE + b.percent * CFG.KB_PCT) * (CFG.KB_MUL + CFG.KB_MUL_C * c);
    b.vx = nx * kb; b.vy = ny * kb;
    b.state = 'hitstun';
    b.timer = Math.min(CFG.HITSTUN_MAX, CFG.HITSTUN + kb * CFG.HITSTUN_KB);
    b.spinV = (nx >= 0 ? 1 : -1) * (5 + kb / 130);
    b.flash = 0.15; b.charge = 0;
    if (a.state === 'dash') { a.state = 'recover'; a.timer = 0.18; a.vx *= 0.15; a.vy *= 0.15; }
    hitstop = 0.05 + 0.07 * c + Math.min(0.08, kb / 9000);
    shake = Math.max(shake, 5 + kb / 70);
    burst(mx, my, 40, '#fff6a8', 8 + Math.round(kb / 60), 200 + kb * 0.5);
  }

  // 重なったキャラを押し離す（ダメージなし。押し合いができる）
  function pushApart() {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i], b = players[j];
        if (!a.alive || !b.alive) continue;
        if (a.state === 'fall' || a.state === 'drop' || b.state === 'fall' || b.state === 'drop') continue;
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= PR * 2) continue;
        if (d < 0.01) { dx = 1; dy = 0; d = 1; }
        const push = (PR * 2 - d) / 2;
        // ガード中は動かされにくい
        const wa = a.state === 'guard' ? 0.2 : 1, wb = b.state === 'guard' ? 0.2 : 1, ws = wa + wb;
        a.x -= dx / d * push * 2 * wa / ws; a.y -= dy / d * push * 2 * wa / ws;
        b.x += dx / d * push * 2 * wb / ws; b.y += dy / d * push * 2 * wb / ws;
      }
    }
  }

  // ---------- CPU ----------
  function cpuThink(p, dt) {
    const ai = p.ai;
    let mx = 0, my = 0, attack = false, guard = false;
    const d = Math.hypot(p.x, p.y);
    let tgt = null, best = 1e9;
    for (const o of players) {
      if (o === p || !o.alive || o.state === 'fall' || o.state === 'drop') continue;
      const dd = Math.hypot(o.x - p.x, o.y - p.y);
      if (dd < best) { best = dd; tgt = o; }
    }
    const toTgt = tgt ? [(tgt.x - p.x) / (best || 1), (tgt.y - p.y) / (best || 1)] : [0, 0];
    if (d > R * 0.72) { mx = -p.x / d; my = -p.y / d; }        // 端に近いので中央へもどる
    else if (tgt && best > 60) { [mx, my] = toTgt; }

    if (ai.hold > 0) {                                          // ため中は相手をねらう
      ai.hold -= dt; attack = true;
      if (tgt) [mx, my] = toTgt;
    } else if (ai.cool > 0) {
      ai.cool -= dt;
    } else if (tgt && best < 150 && d < R * 0.82 && p.state === 'idle') {
      ai.hold = 0.06 + Math.random() * 0.6;
      ai.cool = 0.7 + Math.random() * 1.0;
      attack = true;
    }

    ai.tick -= dt; ai.guardT -= dt;
    if (ai.tick <= 0) {
      ai.tick = 0.25;
      const threat = players.some(o => o !== p && o.alive && (o.state === 'charge' || o.state === 'dash')
        && Math.hypot(o.x - p.x, o.y - p.y) < 140);
      if (threat && Math.random() < 0.3) ai.guardT = 0.45;
    }
    if (ai.guardT > 0 && !attack) guard = true;
    return { mx, my, attack, guard, start: false };
  }

  // ---------- パーティクル ----------
  function burst(x, y, z, color, count, speed, up = 0) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      particles.push({
        x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: up * (0.4 + Math.random() * 0.6) + Math.random() * 120,
        g: 900, life: 0.35 + Math.random() * 0.35, max: 0.7, size: 4 + Math.random() * 6, color,
      });
    }
  }
  function confetti() {
    const cols = ['#ff4d5a', '#3d8bff', '#ffc928', '#3fcf6a', '#ffffff', '#ff8be0'];
    particles.push({
      x: (Math.random() - 0.5) * 1300, y: (Math.random() - 0.3) * 500, z: 420,
      vx: (Math.random() - 0.5) * 60, vy: 0, vz: -80 - Math.random() * 80,
      g: 60, life: 4, max: 4, size: 7 + Math.random() * 6, color: cols[Math.floor(Math.random() * cols.length)],
    });
  }
  function updateParticles(dt) {
    for (const q of particles) {
      q.life -= dt; q.vz -= q.g * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    }
    particles = particles.filter(q => q.life > 0);
  }

  // ---------- 描画 ----------
  function text(str, x, y, size, fill = '#fff', align = 'center', stroke = INK) {
    ctx.font = `900 ${size}px "Yu Gothic UI", "Meiryo", sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (stroke) { ctx.lineWidth = Math.max(3, size / 5); ctx.strokeStyle = stroke; ctx.strokeText(str, x, y); }
    ctx.fillStyle = fill; ctx.fillText(str, x, y);
  }

  function pctColor(pct) {
    if (pct < 30) return '#ffffff';
    return `hsl(${Math.max(0, 55 - (pct - 30) * 0.6)}, 100%, 62%)`;
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3fa9f5'); g.addColorStop(0.6, '#9fdcff'); g.addColorStop(1, '#eaf9ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 雲（ステージが空に浮いている見た目にして、落ちる意味を伝える）
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const clouds = [[150, 120, 1], [980, 90, 1.2], [520, 60, 0.7], [1150, 300, 0.9], [90, 380, 0.8]];
    for (const [cx, cy, s] of clouds) {
      const x = ((cx + now * 8 * s) % (W + 300)) - 150;
      for (const [ox, oy, r] of [[0, 0, 34], [36, 8, 26], [-36, 8, 24], [14, -16, 26]]) {
        ctx.beginPath(); ctx.ellipse(x + ox * s, cy + oy * s, r * s * 1.3, r * s * 0.8, 0, 0, 7); ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 9; i++) {
      const x = ((i * 190 + now * 14) % (W + 400)) - 200;
      ctx.beginPath(); ctx.ellipse(x, H + 10 + (i % 3) * 14, 170, 70, 0, 0, 7); ctx.fill();
    }
  }

  function drawStage() {
    const th = 46, ry = R * TILT;
    // 側面
    const sg = ctx.createLinearGradient(0, CY, 0, CY + th + ry);
    sg.addColorStop(0, '#8a5a3c'); sg.addColorStop(1, '#4e2f1f');
    ctx.beginPath();
    ctx.ellipse(CX, CY + th, R, ry, 0, 0, Math.PI);
    ctx.lineTo(CX - R, CY);
    ctx.ellipse(CX, CY, R, ry, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fillStyle = sg; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
    // 上面
    const tg = ctx.createRadialGradient(CX, CY - 30, 20, CX, CY, R);
    tg.addColorStop(0, '#fff3c9'); tg.addColorStop(1, '#f2c66b');
    ctx.beginPath(); ctx.ellipse(CX, CY, R, ry, 0, 0, 7);
    ctx.fillStyle = tg; ctx.fill();
    // ふちの危険ゾーン
    ctx.beginPath(); ctx.ellipse(CX, CY, R - 9, ry - 9 * TILT, 0, 0, 7);
    ctx.lineWidth = 16; ctx.strokeStyle = 'rgba(255,90,60,0.55)'; ctx.stroke();
    // 中央の輪
    ctx.beginPath(); ctx.ellipse(CX, CY, R * 0.5, ry * 0.5, 0, 0, 7);
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(CX, CY, R, ry, 0, 0, 7);
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
  }

  // 足もとの影・プレイヤー色の輪・向きの矢印・ためゲージ
  function drawGround(p) {
    const sx = CX + p.x, sy = CY + p.y * TILT;
    const k = Math.max(0.3, 1 - Math.abs(p.z) / 600);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(sx, sy, PR * k, PR * TILT * k, 0, 0, 7); ctx.fill();
    if (p.state === 'drop') return;
    const rr = PR + 5;
    ctx.beginPath(); ctx.ellipse(sx, sy, rr, rr * TILT, 0, 0, 7);
    ctx.lineWidth = 4; ctx.strokeStyle = p.color.main; ctx.stroke();
    // 向き
    const ax = p.fx, ay = p.fy * TILT, al = Math.hypot(ax, ay) || 1;
    const tx = sx + p.fx * (rr + 14), ty = sy + p.fy * (rr + 14) * TILT;
    const ux = ax / al, uy = ay / al;
    ctx.beginPath();
    ctx.moveTo(tx + ux * 9, ty + uy * 9);
    ctx.lineTo(tx - ux * 5 - uy * 8, ty - uy * 5 + ux * 8);
    ctx.lineTo(tx - ux * 5 + uy * 8, ty - uy * 5 - ux * 8);
    ctx.closePath();
    ctx.fillStyle = p.color.main; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    // ためゲージ
    if (p.state === 'charge' && p.charge > 0) {
      const full = p.charge >= 1;
      ctx.beginPath();
      ctx.ellipse(sx, sy, rr + 7, (rr + 7) * TILT, 0, -Math.PI / 2, -Math.PI / 2 + p.charge * Math.PI * 2);
      ctx.lineWidth = 7;
      ctx.strokeStyle = full && Math.floor(now * 16) % 2 ? '#ffffff' : '#ffb300';
      ctx.stroke();
    }
  }

  function drawPlayer(p) {
    const sx = CX + p.x, sy = CY + p.y * TILT - p.z;
    ctx.save();
    ctx.translate(sx, sy);
    if (p.inv > 0 && Math.floor(now * 12) % 2) ctx.globalAlpha = 0.45;
    Characters.draw(ctx, p, now);
    if (p.state === 'guard') {
      const r = 40 + 16 * p.shield;
      ctx.beginPath(); ctx.ellipse(0, -44, r, r * 1.1, 0, 0, 7);
      ctx.fillStyle = 'rgba(120,220,255,0.3)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(200,245,255,0.95)'; ctx.stroke();
    }
    if (p.state === 'stun') text('★', Math.sin(now * 9) * 18, -108, 22, '#ffe14d');
    ctx.globalAlpha = 1;
    if (p.state !== 'fall') {
      text(p.label, 0, -128, 17, p.color.main);
      text(Math.floor(p.percent) + '%', 0, -108, 20, pctColor(p.percent));
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const q of particles) {
      ctx.globalAlpha = Math.min(1, q.life / (q.max * 0.5));
      ctx.fillStyle = q.color;
      const s = q.size;
      ctx.fillRect(CX + q.x - s / 2, CY + q.y * TILT - q.z - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function drawArena() {
    const live = players.filter(p => p.alive);
    const isBehind = p => p.state === 'fall' && p.y < 0;   // 奥に落ちたキャラはステージのうしろに隠す
    for (const p of live) if (isBehind(p)) drawPlayer(p);
    drawStage();
    const front = live.filter(p => !isBehind(p)).sort((a, b) => a.y - b.y);
    for (const p of front) if (p.state !== 'fall') drawGround(p);
    for (const p of front) drawPlayer(p);
    if (scene !== 'result') drawParticles();
  }

  function drawFaceIcon(face, x, y, r, color) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.clip();
    ctx.drawImage(face, x - r, y - r, r * 2, r * 2);
    ctx.restore();
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
    ctx.lineWidth = 4; ctx.strokeStyle = color; ctx.stroke();
  }

  function drawHUD() {
    const pw = 250, gap = 20, x0 = (W - (pw * 4 + gap * 3)) / 2, y = 612, ph = 92;
    for (const p of players) {
      const x = x0 + p.index * (pw + gap);
      ctx.globalAlpha = p.alive ? 1 : 0.45;
      ctx.beginPath(); ctx.roundRect(x, y, pw, ph, 16);
      ctx.fillStyle = 'rgba(20,28,60,0.72)'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = p.color.main; ctx.stroke();
      drawFaceIcon(p.face, x + 48, y + 46, 32, p.color.main);
      text(p.cpu ? 'CPU' : p.label + ' ' + p.name, x + 92, y + 24, 20, p.color.main, 'left');
      if (p.alive) {
        text(Math.floor(p.percent) + '%', x + 92, y + 62, 42, pctColor(p.percent), 'left');
        for (let i = 0; i < p.stocks; i++) {
          ctx.beginPath(); ctx.arc(x + pw - 22 - i * 22, y + 24, 8, 0, 7);
          ctx.fillStyle = p.color.main; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        }
      } else {
        text('OUT', x + 92, y + 62, 36, '#c9cfe0', 'left');
      }
      ctx.globalAlpha = 1;
    }
    const t = Math.max(0, Math.ceil(timeLeft));
    text(String(t), W / 2, 44, 52, t <= 10 ? '#ff5a4d' : '#fff');
  }

  function drawJoin() {
    text('おしだしバトル！', W / 2, 92, 76, '#ffe14d');
    text('あいてを ステージの そとへ ふっとばせ！', W / 2, 160, 28);
    const cw = 250, gap = 24, x0 = (W - (cw * 4 + gap * 3)) / 2, y = 210, ch = 340;
    for (let i = 0; i < 4; i++) {
      const x = x0 + i * (cw + gap), col = PLAYER_COLORS[i], joined = !!slots[i];
      ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 22);
      ctx.fillStyle = joined ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.5)'; ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = col.main; ctx.stroke();
      text('P' + (i + 1), x + cw / 2, y + 40, 40, col.main);
      ctx.save();
      ctx.translate(x + cw / 2, y + 246);
      ctx.globalAlpha = joined ? 1 : 0.5;
      const pv = previews[i];
      const chr = (joined && Roster.get(picks[i].key)) || Roster.get('d' + i);
      pv.face = chr.face; pv.body = joined ? picks[i].body : i;
      pv.vy = joined ? 100 : 0; pv.walk = joined ? now * 9 : 0; // 参加したら足ぶみ
      Characters.draw(ctx, pv, now, 1.65);
      ctx.restore();
      if (joined) {
        text('◀ ' + chr.name + ' ▶', x + cw / 2, y + 282, 26, col.main);
        text('▲▼ からだ：' + Characters.BODY_NAMES[picks[i].body], x + cw / 2, y + 316, 18, '#fff', 'center', INK);
      } else {
        if (Math.floor(now * 2) % 2) text('Aボタンで さんか', x + cw / 2, y + 282, 24);
        text('（いないときは CPU）', x + cw / 2, y + 316, 16, '#e8eefc');
      }
    }
    if (slots.some(s => s)) text('STARTボタンで はじめる！', W / 2, 610, 44, '#ffe14d');
    else text('コントローラーの Aボタンを おしてね', W / 2, 610, 36);
    text('スティックの よこで キャラ、たてで からだ を えらぶ　／　Bで やめる　／　キーボード：WASD+F・G、やじるし+K・L、Enterで開始',
      W / 2, 676, 17, '#fff', 'center', INK);
  }

  function drawCountdown() {
    const n = 3 - Math.floor(sceneT), f = sceneT % 1;
    ctx.save();
    ctx.translate(W / 2, CY - 20); ctx.scale(1 + (1 - f) * 0.5, 1 + (1 - f) * 0.5);
    text(String(n), 0, 0, 170, '#ffe14d');
    ctx.restore();
  }

  function drawResult() {
    ctx.fillStyle = 'rgba(15,20,50,0.55)'; ctx.fillRect(0, 0, W, H);
    drawParticles();
    if (winner) {
      text(winner.label, W / 2, 50, 40, '#fff');
      text(winner.name + ' の かち！', W / 2, 130, winner.name.length > 5 ? 72 : 92, winner.color.main, 'center', '#fff');
      ctx.save();
      ctx.translate(W / 2, 520 - Math.abs(Math.sin(sceneT * 5)) * 26);
      const pose = Object.assign({}, winner, { state: 'hitstun', spin: 0, flash: 0, vx: 0, vy: 0, z: 0 }); // 両手を上げたポーズ
      Characters.draw(ctx, pose, now, 3.4);
      ctx.restore();
    } else {
      text('ひきわけ！', W / 2, 300, 110, '#fff');
    }
    if (!DEMO && sceneT > 1.5 && Math.floor(now * 2) % 2) text('ボタンを おして つぎへ', W / 2, 640, 36);
  }

  function render() {
    if (document.body.dataset.scene !== scene) document.body.dataset.scene = scene; // 登録ボタンの出し分けに使う
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.s, 0, 0, view.s, view.x, view.y);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    drawBackground();
    if (scene === 'join') {
      drawJoin();
    } else {
      ctx.save();
      if (shake > 0.5) ctx.translate((Math.random() - 0.5) * shake * 2, (Math.random() - 0.5) * shake * 2);
      drawArena();
      ctx.restore();
      drawHUD();
      if (scene === 'countdown') drawCountdown();
      if (scene === 'play' && sceneT < 0.8) text('GO!', W / 2, CY - 20, 150, '#ffe14d');
      if (scene === 'result') drawResult();
    }
    ctx.restore();
  }

  // ---------- メインループ（物理は固定きざみ） ----------
  const STEP = 1 / 120;
  let last = performance.now(), acc = 0;
  function frame(t) {
    acc += Math.min(0.1, (t - last) / 1000); last = t;
    while (acc >= STEP) { update(STEP); acc -= STEP; }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 動作確認用
  window.__game = {
    get scene() { return scene; }, get players() { return players; }, get timeLeft() { return timeLeft; },
    // 指定秒数ぶんを一気に進める（画面が裏にあって時間が進まないときの確認用）
    advance(sec) { for (let i = 0; i < sec / STEP; i++) update(STEP); render(); },
  };
})();
