let _fb = null;
let offQ = [];

export const FirebaseDB = {
  _cache: {},
  async init(config) {
    try {
      const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
      const fs = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
      const app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
      _fb = { ...fs, db: fs.getFirestore(app) };
      for (const s of STORES) await this._load(s);
      return true;
    } catch (e) {
      return false;
    }
  },
  async _load(k) {
    try {
      const snap = await _fb.getDocs(_fb.collection(_fb.db, k));
      this._cache[k] = snap.docs.map(d => ({ ...d.data(), _did: d.id }));
    } catch {
      this._cache[k] = this._cache[k] || [];
    }
  },
  getAll(k) { return this._cache[k] || []; },
  set(k, arr) { this._cache[k] = arr; },
  add(k, item) {
    const items = this.getAll(k);
    item.id = items.reduce((max, i) => Math.max(max, i.id || 0), 0) + 1;
    item.createdAt = new Date().toISOString();
    const did = k + '_' + item.id;
    item._did = did;
    items.push(item);
    this._cache[k] = items;
    this._write(k, did, item);
    return item.id;
  },
  update(k, item) {
    const items = this.getAll(k);
    const idx = items.findIndex(i => i.id === item.id);
    if (idx !== -1) {
      item.updatedAt = new Date().toISOString();
      const did = item._did || k + '_' + item.id;
      item._did = did;
      items[idx] = item;
      this._cache[k] = items;
      this._write(k, did, item);
    }
  },
  delete(k, id) {
    const item = this.getById(k, id);
    this._cache[k] = (this._cache[k] || []).filter(i => i.id !== id);
    if (item && window.isOnline) this._del(k, item._did || k + '_' + id);
    else if (item) offQ.push({ op: 'del', col: k, did: item._did });
  },
  getById(k, id) { return (this._cache[k] || []).find(i => i.id === id) || null; },
  getByBranch(k, bid) { return (this._cache[k] || []).filter(i => i.branchId === bid); },
  async _write(col, did, data) {
    if (!window.isOnline) { offQ.push({ op: 'set', col, did, data }); return; }
    try {
      await _fb.setDoc(_fb.doc(_fb.db, col, did), data);
    } catch (e) {
      offQ.push({ op: 'set', col, did, data });
    }
  },
  async _del(col, did) {
    try {
      await _fb.deleteDoc(_fb.doc(_fb.db, col, did));
    } catch (e) {
      offQ.push({ op: 'del', col, did });
    }
  }
};

export async function flushOfflineQueue() {
  if (!_fb || !offQ.length) return;
  const q = [...offQ];
  offQ = [];
  for (const op of q) {
    try {
      if (op.op === 'set') await _fb.setDoc(_fb.doc(_fb.db, op.col, op.did), op.data);
      else await _fb.deleteDoc(_fb.doc(_fb.db, op.col, op.did));
    } catch {
      offQ.push(op);
    }
  }
}