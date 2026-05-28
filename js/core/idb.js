import { LocalDB } from './localDB.js';

const IDB_NAME = 'mlea_pos_v6';
const IDB_VER = 1;
const STORES = ['products', 'sales', 'users', 'settings', 'branches', 'activityLogs', 'suppliers', 'purchaseOrders', 'voidedSales', 'heldSales', 'returns', 'customers'];

let _idb = null;

export const IDB = {
  async init() {
    return new Promise((resolve) => {
      const req = indexedDB.open(IDB_NAME, IDB_VER);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        STORES.forEach(s => {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        });
      };
      req.onsuccess = e => { _idb = e.target.result; resolve(true); };
      req.onerror = () => resolve(false);
    });
  },
  async getAll(store) {
    if (!_idb) return LocalDB.getAll(store);
    return new Promise(resolve => {
      const tx = _idb.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve(LocalDB.getAll(store));
    });
  },
  async set(store, items) {
    if (!_idb) { LocalDB.set(store, items); return; }
    return new Promise(resolve => {
      const tx = _idb.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      os.clear();
      items.forEach(item => os.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => { LocalDB.set(store, items); resolve(); };
    });
  },
  async add(store, item) {
    const items = await this.getAll(store);
    item.id = items.reduce((max, i) => Math.max(max, i.id || 0), 0) + 1;
    item.createdAt = new Date().toISOString();
    items.push(item);
    await this.set(store, items);
    LocalDB.set(store, items);
    return item.id;
  },
  async update(store, item) {
    const items = await this.getAll(store);
    const idx = items.findIndex(i => i.id === item.id);
    if (idx !== -1) {
      item.updatedAt = new Date().toISOString();
      items[idx] = item;
      await this.set(store, items);
      LocalDB.set(store, items);
    }
  },
  async delete(store, id) {
    const items = (await this.getAll(store)).filter(i => i.id !== id);
    await this.set(store, items);
    LocalDB.set(store, items);
  },
  async getById(store, id) {
    const items = await this.getAll(store);
    return items.find(i => i.id === id) || null;
  },
  async getByBranch(store, bid) {
    const items = await this.getAll(store);
    return items.filter(i => i.branchId === bid);
  },
  async migrateFromLocal() {
    let count = 0;
    for (const store of STORES) {
      const items = LocalDB.getAll(store);
      if (items.length) { await this.set(store, items); count += items.length; }
    }
    return count;
  }
};