// js/core/db.js
import { LocalDB } from './localDB.js';
import { IDB } from './idb.js';
import { FirebaseDB } from './firebaseDB.js';

let storageMode = 'local';

const safeArray = (data) => Array.isArray(data) ? data : [];

export const DB = {
  async getAll(store) {
    try {
      const result = await this._getImpl().getAll(store);
      return safeArray(result);
    } catch (e) {
      console.warn(`getAll(${store}) failed, returning []`, e);
      return [];
    }
  },
  async set(store, data) {
    return this._getImpl().set(store, safeArray(data));
  },
  async add(store, item) {
    return this._getImpl().add(store, item);
  },
  async update(store, item) {
    return this._getImpl().update(store, item);
  },
  async delete(store, id) {
    return this._getImpl().delete(store, id);
  },
  async getById(store, id) {
    return this._getImpl().getById(store, id);
  },
  async getByBranch(store, bid) {
    const result = await this._getImpl().getByBranch(store, bid);
    return safeArray(result);
  },
  _getImpl() {
    if (storageMode === 'firebase' && window.isOnline) return FirebaseDB;
    if (storageMode === 'idb' && window._idb) return IDB;
    return LocalDB;
  },
  setMode(mode) { storageMode = mode; }
};

export async function initDB() {
  try {
    const idbOk = await IDB.init();
    if (idbOk) {
      storageMode = 'idb';
      await IDB.migrateFromLocal();
      console.log('Storage mode: IndexedDB');
    } else {
      storageMode = 'local';
      console.log('Storage mode: localStorage');
    }
  } catch (err) {
    console.error('IDB init failed, falling back to localStorage', err);
    storageMode = 'local';
  }
  // Ensure settings store exists in localStorage
  if (!localStorage.getItem('mlea_settings')) {
    localStorage.setItem('mlea_settings', '[]');
  }
}
