// js/main.js – Full integration
import { initDB, DB } from './core/db.js';
import { initAuth, renderLogin, logout, setCurrentUser, currentUser, resetSesTimer } from './core/auth.js';
import { initLicense, showLicGate } from './core/license.js';
import { toast, updateSyncBar } from './core/utils.js';
import { renderSidebar } from './ui/sidebar.js';
import { sw, registerView } from './ui/render.js';
import { initModal, openModal, closeModal } from './ui/modal.js';

// Import all real feature modules
import { renderPOS } from './features/pos.js';
import { renderProducts, renderSuppliers, renderPOs } from './features/inventory.js';
import { renderSales, renderVoided, renderReturns } from './features/sales.js';
import { renderDashboard, renderXR, renderZR } from './features/reports.js';
import { renderBIRSetup, renderSalesBook, render2550M, printRcpt, setLastSale } from './features/bir.js';
import { renderBranches, renderUsers, renderActLog, renderBackup, renderSettings, renderFBSetup } from './features/admin.js';
import { renderCustomers } from './features/customers.js';

// Register all real views
registerView('dashboard', renderDashboard);
registerView('pos', renderPOS);
registerView('allProducts', renderProducts);
registerView('inventory', renderProducts);
registerView('suppliers', renderSuppliers);
registerView('purchaseOrders', renderPOs);
registerView('allSales', renderSales);
registerView('branchSales', renderSales);
registerView('voidedSales', renderVoided);
registerView('returns', renderReturns);
registerView('xReading', renderXR);
registerView('zReading', renderZR);
registerView('birSetup', renderBIRSetup);
registerView('salesBook', renderSalesBook);
registerView('form2550M', render2550M);
registerView('branches', renderBranches);
registerView('allUsers', renderUsers);
registerView('myUsers', renderUsers);
registerView('actLog', renderActLog);
registerView('backup', renderBackup);
registerView('settings', renderSettings);
registerView('fbSetup', renderFBSetup);
registerView('customers', renderCustomers);

// Expose globals
window.sw = sw;
window.toast = toast;
window.logout = logout;
window.openModal = openModal;
window.closeModal = closeModal;
window.DB = DB;
window.currentUser = currentUser;
window.printRcpt = printRcpt;
window.setLastSale = setLastSale;

// Sidebar toggle
function initSidebarToggle() {
  const menuBtn = document.getElementById('menuBtn');
  const sidebar = document.getElementById('sidebar');
  const sbOv = document.getElementById('sbOv');
  if (menuBtn && sidebar && sbOv) {
    menuBtn.onclick = () => { sidebar.classList.toggle('on'); sbOv.classList.toggle('on'); };
    sbOv.onclick = () => { sidebar.classList.remove('on'); sbOv.classList.remove('on'); };
  } else setTimeout(initSidebarToggle, 500);
}

async function init() {
  console.log('🚀 Initializing MLEA POS...');
  try {
    await initDB();
    initModal();
    await initLicense();
    initAuth();
    updateSyncBar();
    initSidebarToggle();

    const isActivated = localStorage.getItem('mlea_activated') === 'true';
    if (isActivated) {
      document.getElementById('licenseGate').style.display = 'none';
      document.getElementById('loginScreen').style.display = 'flex';
      document.getElementById('mainApp').style.display = 'none';
      renderLogin();
    } else {
      document.getElementById('licenseGate').style.display = 'flex';
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('mainApp').style.display = 'none';
    }
  } catch (err) {
    console.error('Init error:', err);
    document.getElementById('mainContent').innerHTML = `<div class="card"><h5>Error</h5><p>${err.message}</p></div>`;
  }
}
init();
