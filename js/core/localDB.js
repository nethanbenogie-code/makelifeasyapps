// js/core/localDB.js
const STORES = ['products', 'sales', 'users', 'settings', 'branches', 'activityLogs',
                'suppliers', 'purchaseOrders', 'voidedSales', 'heldSales', 'returns', 'customers'];

export const LocalDB = {
  init() {
    STORES.forEach(s => {
      if (!localStorage.getItem('mlea_' + s)) {
        localStorage.setItem('mlea_' + s, '[]');
      }
    });
    // 🔥 Seed default admin user if none exists
    const users = this.getAll('users');
    if (!users || users.length === 0) {
      this.add('users', {
        id: 1,
        name: 'Admin',
        role: 'admin',
        active: true,
        pin: '1234',
        branchId: null
      });
    }
    // Seed default branch if needed
    const branches = this.getAll('branches');
    if (!branches || branches.length === 0) {
      this.add('branches', { name: 'Main Branch', address: 'Head Office', phone: '555-0000' });
    }
    // Seed sample product if needed (optional)
    const products = this.getAll('products');
    if (!products || products.length === 0) {
      this.add('products', {
        sku: 'SKU001',
        name: 'Sample Product',
        price: 99.99,
        cost: 50,
        stock: 50,
        category: 'General',
        unit: 'pcs',
        active: true,
        barcode: '123456789',
        branchId: null,
        supplierId: null,
        vatExempt: false,
        zeroRated: false
      });
    }
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
    const nextId = items.reduce((max, i) => Math.max(max, i.id || 0), 0) + 1;
    item.id = nextId;
    item.createdAt = item.createdAt || new Date().toISOString();
    items.push(item);
    this.set(k, items);
    return item.id;
  },
  update(k, item) {
    const items = this.getAll(k);
    const idx = items.findIndex(i => i.id === item.id);
    if (idx !== -1) {
      item.updatedAt = new Date().toISOString();
      items[idx] = { ...items[idx], ...item };
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
