// js/core/db.js – synchronous localStorage version
import { LocalDB } from './localDB.js';

export const DB = {
  getAll(store) { return LocalDB.getAll(store); },
  set(store, data) { LocalDB.set(store, data); },
  add(store, item) { return LocalDB.add(store, item); },
  update(store, item) { LocalDB.update(store, item); },
  delete(store, id) { LocalDB.delete(store, id); },
  getById(store, id) { return LocalDB.getById(store, id); },
  getByBranch(store, bid) { return LocalDB.getByBranch(store, bid); }
};

export function initDB() {
  console.log('Storage mode: localStorage (sync)');
}
