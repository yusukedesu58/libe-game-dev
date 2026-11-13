// 入力。ゲームパッド（最大4台）とキーボード（テスト用に2人分）を同じ形で読む。
//   read(id) → { mx, my, attack, guard, start }
const Input = (() => {
  const keys = {};
  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (!api.blocked && (e.code.startsWith('Arrow') || e.code === 'Space')) e.preventDefault();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  const KB = {
    kb1: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', attack: 'KeyF', guard: 'KeyG' },
    kb2: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', attack: 'KeyK', guard: 'KeyL' },
  };
  const DEAD = 0.25; // スティックの遊び

  function pads() {
    return navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
  }

  // いま使える入力機器のID一覧
  function devices() {
    const ids = ['kb1', 'kb2'];
    pads().forEach((p, i) => { if (p && p.connected && i < 4) ids.push('pad' + i); });
    return ids;
  }

  function norm(mx, my) {
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    return [mx, my];
  }

  const api = { devices, read, deviceName, blocked: false }; // blocked: 登録画面を開いている間はゲーム操作を止める

  function read(id) {
    let mx = 0, my = 0, attack = false, guard = false, start = false;
    if (api.blocked) return { mx, my, attack, guard, start };
    if (KB[id]) {
      const k = KB[id];
      mx = (keys[k.right] ? 1 : 0) - (keys[k.left] ? 1 : 0);
      my = (keys[k.down] ? 1 : 0) - (keys[k.up] ? 1 : 0);
      attack = !!keys[k.attack];
      guard = !!keys[k.guard];
      start = !!keys.Enter;
    } else {
      const p = pads()[+id.slice(3)];
      if (p && p.connected) {
        const b = i => !!(p.buttons[i] && p.buttons[i].pressed);
        mx = p.axes[0] || 0; my = p.axes[1] || 0;
        if (Math.hypot(mx, my) < DEAD) { mx = 0; my = 0; }
        // 十字キー
        if (b(14)) mx = -1; if (b(15)) mx = 1;
        if (b(12)) my = -1; if (b(13)) my = 1;
        attack = b(0) || b(2);   // A / X
        guard = b(1) || b(3);    // B / Y
        start = b(9);
      }
    }
    [mx, my] = norm(mx, my);
    return { mx, my, attack, guard, start };
  }

  function deviceName(id) {
    if (id === 'kb1') return 'キーボード1';
    if (id === 'kb2') return 'キーボード2';
    return 'コントローラー' + (+id.slice(3) + 1);
  }

  return api;
})();
