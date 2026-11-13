// キャラ登録画面：画像を取り込み、丸い枠に顔を合わせて、名前を付けて名簿に保存する。
const Register = (() => {
  const $ = id => document.getElementById(id);
  const overlay = $('reg'), drop = $('drop'), crop = $('crop'), g = crop.getContext('2d');
  const fileInput = $('file'), zoom = $('zoom'), nameInput = $('name'), saveBtn = $('save'), msg = $('msg');
  const SIZE = 320, RAD = 150, OUT = 256;     // 切り抜き画面の大きさ、丸の半径、保存する顔画像の大きさ
  const ZOOM_FIT = 22;                        // スライダーがこの値のとき、画像が丸をちょうど覆う

  let img = null, minScale = 1, scale = 1, ox = 0, oy = 0;

  const isOpen = () => !overlay.hidden;
  function open() { overlay.hidden = false; Input.blocked = true; renderList(); }
  function close() { overlay.hidden = true; Input.blocked = false; }

  function setZoom(v) {
    const old = scale;
    zoom.value = v;
    scale = minScale * 0.6 * Math.pow(10, zoom.value / 100);
    // 丸の中心を基準に拡大縮小する（合わせた顔が逃げないように）
    if (img && old > 0) { ox *= scale / old; oy *= scale / old; }
    draw();
  }

  function draw() {
    g.clearRect(0, 0, SIZE, SIZE);
    if (!img) return;
    const w = img.width * scale, h = img.height * scale;
    g.fillStyle = '#fff'; g.fillRect(0, 0, SIZE, SIZE);
    g.drawImage(img, SIZE / 2 + ox - w / 2, SIZE / 2 + oy - h / 2, w, h);
    // 丸の外を暗くする
    g.beginPath(); g.rect(0, 0, SIZE, SIZE); g.arc(SIZE / 2, SIZE / 2, RAD, 0, 7);
    g.fillStyle = 'rgba(15,20,50,0.6)'; g.fill('evenodd');
    g.beginPath(); g.arc(SIZE / 2, SIZE / 2, RAD, 0, 7);
    g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke();
  }

  // 丸の中に見えている範囲を、保存用の正方形画像に描き出す
  function exportFace() {
    const c = document.createElement('canvas');
    c.width = c.height = OUT;
    const o = c.getContext('2d'), f = OUT / (RAD * 2);
    const w = img.width * scale * f, h = img.height * scale * f;
    o.fillStyle = '#fff'; o.fillRect(0, 0, OUT, OUT);
    o.drawImage(img, OUT / 2 + ox * f - w / 2, OUT / 2 + oy * f - h / 2, w, h);
    return c;
  }

  function reset() {
    img = null; ox = oy = 0;
    drop.classList.add('empty');
    saveBtn.disabled = true;
    fileInput.value = '';
    draw();
  }

  // 画像ファイル（File / Blob）を読み込んで切り抜き画面に出す
  function load(file) {
    if (!file || !/^image\//.test(file.type)) { msg.textContent = '画像ファイルではありません'; return Promise.resolve(false); }
    return new Promise(res => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(url);
        img = im; ox = oy = 0; scale = 0;
        minScale = Math.max(RAD * 2 / im.width, RAD * 2 / im.height);
        drop.classList.remove('empty');
        saveBtn.disabled = false;
        msg.textContent = '';
        if (!isOpen()) open();
        setZoom(ZOOM_FIT);
        nameInput.focus();
        res(true);
      };
      im.onerror = () => { URL.revokeObjectURL(url); msg.textContent = '画像を読み込めませんでした'; res(false); };
      im.src = url;
    });
  }

  async function save() {
    if (!img) return;
    const name = nameInput.value.trim() || 'キャラ' + (Roster.custom().length + 1);
    saveBtn.disabled = true;
    await Roster.add(name, exportFace());
    msg.textContent = '「' + name + '」を登録しました';
    nameInput.value = '';
    reset();
  }

  // 2回押して実行するボタン（押しまちがいで消さないため）
  function twoStep(btn, label, confirmLabel, action) {
    let timer = null;
    btn.textContent = label;
    btn.addEventListener('click', () => {
      if (btn.classList.contains('armed')) {
        clearTimeout(timer); btn.classList.remove('armed'); btn.textContent = label;
        action();
      } else {
        btn.classList.add('armed'); btn.textContent = confirmLabel;
        timer = setTimeout(() => { btn.classList.remove('armed'); btn.textContent = label; }, 3000);
      }
    });
  }

  function renderList() {
    const list = $('list'), items = Roster.custom();
    $('count').textContent = items.length;
    list.textContent = '';
    if (!items.length) {
      const d = document.createElement('div');
      d.className = 'empty'; d.textContent = 'まだ登録がありません';
      list.appendChild(d);
    }
    for (const c of items) {
      const d = document.createElement('div'); d.className = 'item';
      const im = document.createElement('img'); im.src = c.face.toDataURL('image/jpeg', 0.8); im.alt = '';
      const n = document.createElement('div'); n.textContent = c.name;
      const b = document.createElement('button');
      twoStep(b, '消す', '本当に消す', () => Roster.remove(c.key));
      d.append(im, n, b);
      list.appendChild(d);
    }
    $('clearAll').hidden = !items.length;
  }

  // ---- 操作 ----
  $('regBtn').addEventListener('click', open);
  $('close').addEventListener('click', close);
  $('reset').addEventListener('click', () => { reset(); msg.textContent = ''; });
  saveBtn.addEventListener('click', save);
  twoStep($('clearAll'), 'ぜんぶ消す', '本当にぜんぶ消す', () => Roster.clear());
  Roster.onChange(() => { if (isOpen()) renderList(); });
  fileInput.addEventListener('change', () => load(fileInput.files[0]));
  zoom.addEventListener('input', () => setZoom(zoom.value));
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) save(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) close(); });

  // 位置合わせ（ドラッグ）と大きさ（ホイール）
  let dragging = null;
  drop.addEventListener('pointerdown', e => {
    if (!img) { fileInput.click(); return; }
    dragging = { x: e.clientX, y: e.clientY, ox, oy };
    try { drop.setPointerCapture(e.pointerId); } catch (err) { /* つかめなくてもドラッグは続けられる */ }
  });
  drop.addEventListener('pointermove', e => {
    if (!dragging) return;
    ox = dragging.ox + e.clientX - dragging.x; oy = dragging.oy + e.clientY - dragging.y;
    draw();
  });
  const endDrag = () => { dragging = null; };
  drop.addEventListener('pointerup', endDrag);
  drop.addEventListener('pointercancel', endDrag);
  drop.addEventListener('wheel', e => {
    if (!img) return;
    e.preventDefault();
    setZoom(+zoom.value - Math.sign(e.deltaY) * 3);
  }, { passive: false });

  // 画面のどこに落としても受け取る（参加画面のときだけ）。貼り付けも同じ。
  const canAccept = () => isOpen() || document.body.dataset.scene === 'join';
  addEventListener('dragover', e => { e.preventDefault(); if (canAccept()) drop.classList.add('over'); });
  addEventListener('dragleave', () => drop.classList.remove('over'));
  addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('over');
    if (canAccept() && e.dataTransfer.files.length) load(e.dataTransfer.files[0]);
  });
  addEventListener('paste', e => {
    if (!canAccept()) return;
    const f = Array.from(e.clipboardData.files).find(x => /^image\//.test(x.type));
    if (f) { e.preventDefault(); load(f); }
  });

  return { open, close, load, save, isOpen };
})();
