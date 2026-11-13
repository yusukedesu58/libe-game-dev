// キャラ名簿。会場で登録したキャラ（顔画像＋名前）をブラウザ内に保存し、最初から入っている仮キャラと合わせて返す。
const Roster = (() => {
  const custom = [];   // 登録キャラ。新しい順
  const defaults = Characters.list.map((c, i) => ({ key: 'd' + i, name: c.name, face: c.face, builtin: true }));
  const listeners = [];
  let db = null, memId = 1000000;

  const emit = () => listeners.forEach(f => f());
  const store = mode => db.transaction('chars', mode).objectStore('chars');
  const wait = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  function toCanvas(dataUrl) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        c.getContext('2d').drawImage(img, 0, 0, 256, 256);
        res(c);
      };
      img.onerror = rej;
      img.src = dataUrl;
    });
  }

  async function init() {
    try {
      db = await new Promise((res, rej) => {
        const r = indexedDB.open('oshidashi-battle', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('chars', { keyPath: 'id', autoIncrement: true });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const rows = await wait(store('readonly').getAll());
      for (const row of rows) {
        try { custom.unshift({ key: 'c' + row.id, id: row.id, name: row.name, face: await toCanvas(row.data) }); }
        catch (e) { /* こわれた1件は飛ばす */ }
      }
    } catch (e) {
      console.warn('保存領域が使えません。登録キャラはページを閉じると消えます。', e);
      db = null;
    }
    emit();
  }

  // face は 256x256 の canvas
  async function add(name, face) {
    let id;
    if (db) id = await wait(store('readwrite').add({ name, data: face.toDataURL('image/jpeg', 0.9) }));
    else id = memId++;
    const c = { key: 'c' + id, id, name, face };
    custom.unshift(c);
    emit();
    return c;
  }

  async function remove(key) {
    const i = custom.findIndex(c => c.key === key);
    if (i < 0) return;
    const [c] = custom.splice(i, 1);
    if (db) await wait(store('readwrite').delete(c.id));
    emit();
  }

  async function clear() {
    custom.length = 0;
    if (db) await wait(store('readwrite').clear());
    emit();
  }

  const all = () => custom.concat(defaults);
  const get = key => all().find(c => c.key === key) || null;

  init();
  return { all, get, add, remove, clear, custom: () => custom.slice(), onChange: f => listeners.push(f) };
})();
