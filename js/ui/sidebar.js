// js/ui/sidebar.js
import { currentUser } from '../core/auth.js';

export function renderSidebar() {
  const nav = document.getElementById('sbNav');
  if (!nav || !currentUser) return;

  const role = currentUser.role;
  let items = [];

  if (role === 'admin') {
    items = [
      { icon: '📊', label: 'Dashboard', view: 'dashboard' },
      { icon: '💳', label: 'POS Terminal', view: 'pos' },
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
      { icon: '💳', label: 'POS Terminal', view: 'pos' }
    ];
  }

  nav.innerHTML = items.map(item => `
    <div class="sb-item" onclick="sw('${item.view}')">
      <span class="sb-icon">${item.icon}</span>${item.label}
    </div>
  `).join('');
}
