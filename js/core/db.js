// js/core/db.js – Simplified localStorage-only version
import { LocalDB } from './localDB.js';

export const DB = {
  async getAll(store) {
    return LocalDB.getAll(store);
  },
  async set(store, data) {
    LocalDB.set(store, data);
  },
  async add(store, item) {
    return LocalDB.add(store, item);
  },
  async update(store, item) {
    LocalDB.update(store, item);
  },
  async delete(store, id) {
    LocalDB.delete(store, id);
  },
  async getById(store, id) {
    return LocalDB.getById(store, id);
  },
  async getByBranch(store, bid) {
    return LocalDB.getByBranch(store, bid);
  }
};

export async function initDB() {
  console.log('Storage mode: localStorage (simplified)');
}
