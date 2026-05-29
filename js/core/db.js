// js/core/db.js
import { LocalDB } from './localDB.js';

export const DB = {
  getAll(store) {
    const result = LocalDB.getAll(store);
    return Array.isArray(result) ? result : [];
  },
  set(store, data) { LocalDB.set(store, data); },
  add(store, item) { return LocalDB.add(store, item); },
  update(store, item) { LocalDB.update(store, item); },
  delete(store, id) { LocalDB.delete(store, id); },
  getById(store, id) { return LocalDB.getById(store, id); },
  getByBranch(store, bid) {
    const result = LocalDB.getByBranch(store, bid);
    return Array.isArray(result) ? result : [];
  }
};

export function initDB() { console.log('DB ready (sync)'); }
