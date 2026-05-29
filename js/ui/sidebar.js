// js/ui/sidebar.js
import { DB } from '../core/db.js';
import { currentUser } from '../core/auth.js';

function getBadges() {
  try {
    const products = DB.getAll('products') || [];
    const productsArray = Array.isArray(products) ? products : [];
    const lowStock = productsArray.filter(p => p.active && p.stock <= (window.lowStockThresh || 10)).length;
    const held = DB.getAll('heldSales') || [];
    const heldCount = Array.isArray(held) ? held.length : 0;
    return { lowStock, held: heldCount };
  } catch (err) {
    console.warn('Error getting badges:', err);
    return { lowStock: 0, held: 0 };
  }
}

export function renderSidebar() {
  const nav = document.getElementById('sbNav');
  if (!nav) {
    console.warn('Sidebar container not found');
    return;
  }
  if (!currentUser || !currentUser.role) {
    console.warn('No current user or role – sidebar not rendered');
    return;
  }

  const role = currentUser.role;
  const badges = getBadges();
  let items = [];

  if (role === 'admin') {
    items = [
      { icon: '📊', label: 'Dashboard', view: 'dashboard' },
      { icon: '💳', label: 'POS Terminal', view: 'pos', badge: 'held' },
      { icon: '💰', label: 'Sales History', view: 'allSales' },
      { icon: '👤', label: 'Customers', view: 'customers' },
      { icon: '📑', label: 'X-Reading', view: 'xReading' },
      { icon: '📋', label: 'Z-Reading', view: 'zReading' },
      { icon: '🏛️', label: 'BIR Setup', view: 'birSetup' },
      { icon: '📈', label: 'Reports', view: 'reports' },
      { icon: '⚙️', label: 'Settings', view: 'settings' }
    ];
  } else {
    items = [
      { icon: '📊', label: 'Dashboard', view: 'dashboard' },
      { icon: '💳', label: 'POS Terminal', view: 'pos', badge: 'held' }
    ];
  }

  let html = '';
  items.forEach(item => {
    let badgeHtml = '';
    if (item.badge === 'held' && badges.held) {
      badgeHtml = `<span style="color:var(--gold);font-size:.72em;"> (${badges.held})</span>`;
    }
    html += `<div class="sb-item" onclick="sw('${item.view}')">
      <span class="sb-icon">${item.icon}</span>${item.label}${badgeHtml}
    </div>`;
  });
  nav.innerHTML = html;
  console.log('Sidebar rendered for role:', role);
}
