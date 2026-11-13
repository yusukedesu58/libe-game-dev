// キャラの見た目。胴体・手・足はプログラムで描いて動かし、頭には「顔画像」を丸く貼る。
// 顔画像を差し替えるだけで別キャラになる（Characters.list[i].face に画像か canvas を入れる）。
const Characters = (() => {
  // ---- 仮の顔（会場で作った画像に置き換える前のダミー） ----
  function makeFace(i) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const skins = ['#ffe08a', '#ffc7d9', '#c9d3de', '#b5ec8f'];
    g.fillStyle = skins[i % 4];
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#2a2233';
    g.strokeStyle = '#2a2233';
    g.lineWidth = 6;
    g.lineCap = 'round';
    const eye = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
    switch (i % 4) {
      case 0: // にこにこ
        eye(44, 56, 8); eye(84, 56, 8);
        g.beginPath(); g.arc(64, 70, 26, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
        break;
      case 1: // ねこ
        eye(42, 58, 7); eye(86, 58, 7);
        g.beginPath(); g.moveTo(64, 72); g.lineTo(58, 66); g.lineTo(70, 66); g.closePath(); g.fill();
        g.lineWidth = 4;
        g.beginPath(); g.arc(56, 76, 8, 0, Math.PI); g.stroke();
        g.beginPath(); g.arc(72, 76, 8, 0, Math.PI); g.stroke();
        g.beginPath();
        g.moveTo(30, 74); g.lineTo(10, 70); g.moveTo(30, 82); g.lineTo(10, 86);
        g.moveTo(98, 74); g.lineTo(118, 70); g.moveTo(98, 82); g.lineTo(118, 86);
        g.stroke();
        break;
      case 2: // ロボ
        g.fillStyle = '#35e0ff';
        g.fillRect(30, 44, 24, 18); g.fillRect(74, 44, 24, 18);
        g.strokeRect(30, 44, 24, 18); g.strokeRect(74, 44, 24, 18);
        g.lineWidth = 4;
        g.strokeRect(40, 82, 48, 14);
        g.beginPath();
        for (let x = 52; x < 88; x += 12) { g.moveTo(x, 82); g.lineTo(x, 96); }
        g.stroke();
        break;
      case 3: // ひとつ目モンスター
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(64, 52, 22, 0, 7); g.fill(); g.stroke();
        g.fillStyle = '#2a2233';
        eye(66, 54, 10);
        g.beginPath(); g.moveTo(36, 88); g.lineTo(92, 88); g.stroke();
        g.fillStyle = '#fff';
        for (const x of [46, 62, 78]) {
          g.beginPath(); g.moveTo(x - 6, 88); g.lineTo(x, 100); g.lineTo(x + 6, 88); g.closePath();
          g.fill(); g.lineWidth = 3; g.stroke();
        }
        break;
    }
    return c;
  }

  const list = [0, 1, 2, 3].map(i => ({ name: ['にこ', 'にゃん', 'ロボ', 'モン'][i], face: makeFace(i) }));

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // 足もとを原点 (0,0) として、上方向にキャラを描く。
  // p に必要な値: color, face, state, charge, vx, vy, fx, fy, walk, spin, flash, index
  function draw(ctx, p, t, scale = 1) {
    const col = p.color;
    const speed = Math.hypot(p.vx, p.vy);
    const fx = p.fx, fy = p.fy * 0.5;
    let sx = 1, sy = 1, lean = 0, bob = 0, arm = 'idle';

    switch (p.state) {
      case 'charge': sy = 1 - 0.22 * p.charge; sx = 1 + 0.14 * p.charge; arm = 'charge'; break;
      case 'dash': sy = 0.9; sx = 1.15; lean = fx * 0.45; arm = 'dash'; break;
      case 'guard': sy = 0.94; arm = 'guard'; break;
      case 'hitstun': case 'fall': arm = 'hurt'; break;
      case 'stun': arm = 'hurt'; lean = Math.sin(t * 22) * 0.16; break;
      case 'recover': lean = fx * 0.15; break;
      default:
        lean = clamp(p.vx / 260, -1, 1) * 0.18;
        bob = Math.sin(t * 4 + p.index * 1.7) * 1.5;
    }
    const walking = speed > 40 && (p.state === 'idle' || p.state === 'charge');
    const ph = p.walk;

    ctx.save();
    ctx.scale(scale, scale);
    if (p.state === 'charge') ctx.translate((Math.random() - 0.5) * 5 * p.charge, 0);
    if (p.spin) { ctx.translate(0, -40); ctx.rotate(p.spin); ctx.translate(0, 40); }
    ctx.scale(sx, sy);
    ctx.rotate(lean);
    ctx.lineJoin = 'round';

    const body = p.body || 0;
    const outline = w => { ctx.lineWidth = w; ctx.strokeStyle = '#1b2340'; ctx.stroke(); };

    // 体のうしろに付くもの
    if (body === 2) { // マント
      const fl = Math.sin(t * 6 + p.index) * 3 + clamp(-p.vx / 40, -10, 10);
      ctx.beginPath();
      ctx.moveTo(-15, -46); ctx.lineTo(15, -46); ctx.lineTo(25 + fl, -7); ctx.lineTo(-25 + fl, -7);
      ctx.closePath();
      ctx.fillStyle = col.dark; ctx.fill(); outline(2.5);
    } else if (body === 3) { // しっぽ
      ctx.beginPath(); ctx.arc((fx > 0 ? -1 : 1) * 22, -15, 7.5, 0, 7);
      ctx.fillStyle = col.light; ctx.fill(); outline(2.5);
    }

    // 足
    const foot = (x, lift) => {
      ctx.beginPath();
      ctx.ellipse(x + fx * 3, -5 - lift, 10, 6.5, 0, 0, 7);
      ctx.fillStyle = col.dark; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#1b2340'; ctx.stroke();
    };
    foot(-11, walking ? Math.max(0, Math.sin(ph)) * 7 : 0);
    foot(11, walking ? Math.max(0, -Math.sin(ph)) * 7 : 0);

    // 手の位置（状態ごと）
    let hands;
    const sw = walking ? Math.sin(ph) * 6 : 0;
    switch (arm) {
      case 'charge': hands = [[-fx * 20 - 9, -30 - fy * 6], [-fx * 20 + 9, -30 - fy * 6]]; break;
      case 'dash': hands = [[fx * 30 - 7, -36 + fy * 10], [fx * 30 + 7, -36 + fy * 10]]; break;
      case 'guard': hands = [[-9, -36], [9, -36]]; break;
      case 'hurt': hands = [[-29, -54], [29, -54]]; break;
      default: hands = [[-26, -27 + sw + bob], [26, -27 - sw + bob]];
    }
    const drawHands = () => {
      for (const [hx, hy] of hands) {
        ctx.beginPath(); ctx.arc(hx, hy, 8.5, 0, 7);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#1b2340'; ctx.stroke();
      }
    };
    if (arm === 'charge') drawHands(); // ため中は手を体のうしろに引く

    // 胴体
    const by = bob * 0.5;
    ctx.beginPath();
    if (body === 1) ctx.roundRect(-21, -50 + by, 42, 45, 9);
    else ctx.ellipse(0, -27 + by, 21, 23, 0, 0, 7);
    ctx.fillStyle = col.main; ctx.fill(); outline(3);
    // むねの模様
    if (body === 1) {        // ロボ：パネル
      ctx.beginPath(); ctx.roundRect(-12, -38 + by, 24, 17, 3);
      ctx.fillStyle = col.light; ctx.fill(); outline(2);
      ctx.fillStyle = '#ff5a4d'; ctx.beginPath(); ctx.arc(-5, -29.5 + by, 3, 0, 7); ctx.fill();
      ctx.fillStyle = '#3fcf6a'; ctx.beginPath(); ctx.arc(5, -29.5 + by, 3, 0, 7); ctx.fill();
    } else if (body === 2) { // ヒーロー：星
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 4.5 : 10;
        ctx.lineTo(Math.cos(a) * r, -27 + by + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = '#ffe14d'; ctx.fill(); outline(2);
    } else {
      ctx.beginPath(); ctx.ellipse(0, -22 + by, 12, 12, 0, 0, 7);
      ctx.fillStyle = col.light; ctx.globalAlpha = 0.75; ctx.fill(); ctx.globalAlpha = 1;
    }

    // 頭（顔画像を丸く切り抜いて貼る）
    const hy = -67 + bob, hr = 27;
    if (body === 3) {        // どうぶつ：耳
      for (const ex of [-19, 19]) {
        ctx.beginPath(); ctx.arc(ex, hy - 20, 10.5, 0, 7);
        ctx.fillStyle = col.main; ctx.fill(); outline(2.5);
        ctx.beginPath(); ctx.arc(ex, hy - 20, 5, 0, 7);
        ctx.fillStyle = col.light; ctx.fill();
      }
    } else if (body === 1) { // ロボ：アンテナ
      ctx.beginPath(); ctx.moveTo(0, hy - hr); ctx.lineTo(0, hy - hr - 13); outline(3.5);
      ctx.beginPath(); ctx.arc(0, hy - hr - 16, 5.5, 0, 7);
      ctx.fillStyle = '#ffe14d'; ctx.fill(); outline(2.5);
    }
    ctx.save();
    ctx.beginPath(); ctx.arc(0, hy, hr, 0, 7); ctx.clip();
    ctx.drawImage(p.face, -hr, hy - hr, hr * 2, hr * 2);
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, hy, hr, 0, 7);
    ctx.lineWidth = 5; ctx.strokeStyle = col.main; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, hy, hr + 2.5, 0, 7);
    ctx.lineWidth = 2; ctx.strokeStyle = '#1b2340'; ctx.stroke();

    if (arm !== 'charge') drawHands();

    // 攻撃を受けた瞬間の白フラッシュ
    if (p.flash > 0) {
      ctx.globalAlpha = 0.75; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, hy, hr + 3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -27, 22, 24, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // 胴体タイプ（p.body の番号に対応）
  const BODY_NAMES = ['まる', 'ロボ', 'ヒーロー', 'どうぶつ'];

  return { list, draw, BODY_NAMES };
})();
