const STORES = ['products', 'sales', 'users', 'settings', 'branches', 'activityLogs', 'suppliers', 'purchaseOrders', 'voidedSales', 'heldSales', 'returns', 'customers'];

export const LocalDB = {
  init() {
    STORES.forEach(s => {
      if (!localStorage.getItem('mlea_' + s)) localStorage.setItem('mlea_' + s, '[]');
    });
  },
  getAll(k) {
    try {
      return JSON.parse(localStorage.getItem('mlea_' + k) || '[]');
    } catch {
      return [];
    }
  },
  set(k, d) {
    localStorage.setItem('mlea_' + k, JSON.stringify(d));
  },
  add(k, item) {
    const items = this.getAll(k);
    item.id = items.reduce((max, i) => Math.max(max, i.id || 0), 0) + 1;
    item.createdAt = new Date().toISOString();
    items.push(item);
    this.set(k, items);
    return item.id;
  },
  update(k, item) {
    const items = this.getAll(k);
    const idx = items.findIndex(i => i.id === item.id);
    if (idx !== -1) {
      item.updatedAt = new Date().toISOString();
      items[idx] = item;
      this.set(k, items);
    }
  },
  delete(k, id) {
    this.set(k, this.getAll(k).filter(i => i.id !== id));
  },
  getById(k, id) {
    return this.getAll(k).find(i => i.id === id) || null;
  },
  getByBranch(k, bid) {
    return this.getAll(k).filter(i => i.branchId === bid);
  }
};

LocalDB.init();