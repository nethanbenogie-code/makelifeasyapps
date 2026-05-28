import { LocalDB } from './localDB.js';
import { FirebaseDB } from './firebaseDB.js';
import { IDB } from './idb.js';

let storageMode = 'local'; // 'local', 'firebase', 'idb'

export const DB = {
  async getAll(store) { return this._getImpl().getAll(store); },
  async set(store, data) { return this._getImpl().set(store, data); },
  async add(store, item) { return this._getImpl().add(store, item); },
  async update(store, item) { return this._getImpl().update(store, item); },
  async delete(store, id) { return this._getImpl().delete(store, id); },
  async getById(store, id) { return this._getImpl().getById(store, id); },
  async getByBranch(store, bid) { return this._getImpl().getByBranch(store, bid); },
  _getImpl() {
    if (storageMode === 'firebase' && window.isOnline) return FirebaseDB;
    if (storageMode === 'idb' && window._idb) return IDB;
    return LocalDB;
  },
  setMode(mode) { storageMode = mode; }
};

export async function initDB() {
  const idbOk = await IDB.init();
  if (idbOk) {
    storageMode = 'idb';
    await IDB.migrateFromLocal();
  } else {
    storageMode = 'local';
  }
  console.log(`Storage mode: ${storageMode}`);
}