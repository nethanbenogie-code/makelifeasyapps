// js/main.js – Complete entry point for MLEA POS Modular v6

// Core modules
import { initDB, DB } from './core/db.js';
import { initAuth, renderLogin, logout, setCurrentUser, currentUser, resetSesTimer } from './core/auth.js';
import { initLicense, showLicGate } from './core/license.js';
import { toast, updateSyncBar } from './core/utils.js';
import { renderSidebar } from './ui/sidebar.js';
import { sw, registerView } from './ui/render.js';
import { initModal, openModal, closeModal } from './ui/modal.js';

// ========== TEMPORARY VIEWS (replace with full modules later) ==========
function renderDashboard(el) {
  el.innerHTML = `
    <div class="card">
      <h4>Dashboard</h4>
      <p>Welcome to MLEA POS Modular v6. If you see this, the app is working!</p>
      <button class="btn bp" onclick="sw('pos')">Go to POS (demo)</button>
    </div>
    <div class="card">
      <h5>Quick Actions</h5>
      <button class="btn bs" onclick="toast('Test toast message', 'gold')">Test Toast</button>
      <button class="btn bd" onclick="logout()">Sign Out</button>
    </div>
  `;
}

function renderPOS(el) {
  el.innerHTML = `
    <div class="card">
      <h4>POS Terminal</h4>
      <p>This is a placeholder. The full POS module will be added later.</p>
      <button class="btn bb" onclick="sw('dashboard')">Back to Dashboard</button>
    </div>
  `;
}

// Placeholder for any missing views (prevents "not registered" errors)
const placeholder = (el) => {
  el.innerHTML = `
    <div class="card">
      <h4>Coming Soon</h4>
      <p>This feature will be available after you add the full module.</p>
      <button class="btn bb" onclick="sw('dashboard')">Back to Dashboard</button>
    </div>
  `;
};

// Register all views (existing + placeholders)
registerView('dashboard', renderDashboard);
registerView('pos', renderPOS);
registerView('allSales', placeholder);
registerView('customers', placeholder);
registerView('xReading', placeholder);
registerView('zReading', placeholder);
registerView('birSetup', placeholder);
registerView('reports', placeholder);
registerView('settings', placeholder);

// ========== GLOBAL EXPOSURES (for inline onclick handlers) ==========
window.sw = sw;
window.toast = toast;
window.logout = logout;
window.openModal = openModal;
window.closeModal = closeModal;
window.DB = DB;
window.currentUser = currentUser;

// ========== SIDEBAR TOGGLE (attach once DOM is ready) ==========
function initSidebarToggle() {
  const menuBtn = document.getElementById('menuBtn');
  const sidebar = document.getElementById('sidebar');
  const sbOv = document.getElementById('sbOv');
  if (menuBtn && sidebar && sbOv) {
    menuBtn.onclick = () => {
      sidebar.classList.toggle('on');
      sbOv.classList.toggle('on');
    };
    sbOv.onclick = () => {
      sidebar.classList.remove('on');
      sbOv.classList.remove('on');
    };
    console.log('Sidebar toggle initialized');
  } else {
    console.warn('Sidebar elements not found, retrying in 500ms');
    setTimeout(initSidebarToggle, 500);
  }
}

// ========== INITIALIZATION ==========
async function init() {
  console.log('🚀 Initializing MLEA POS...');

  try {
    // 1. Database (synchronous localStorage)
    await initDB();
    console.log('✅ Database initialized');

    // 2. Modal system
    initModal();

    // 3. License (attaches Activate button handler)
    await initLicense();
    console.log('✅ License module ready');

    // 4. Authentication (PIN pad, login UI)
    initAuth();
    console.log('✅ Auth module ready');

    // 5. Sync bar UI
    updateSyncBar();

    // 6. Sidebar toggle (after DOM is fully loaded)
    initSidebarToggle();

    // 7. Determine which screen to show
    const isActivated = localStorage.getItem('mlea_activated') === 'true';
    const licenseGate = document.getElementById('licenseGate');
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');

    if (isActivated) {
      if (licenseGate) licenseGate.style.display = 'none';
      if (loginScreen) loginScreen.style.display = 'flex';
      if (mainApp) mainApp.style.display = 'none';
      // Render the user list (Admin should appear)
      renderLogin();
      console.log('✅ Login screen rendered');
    } else {
      if (licenseGate) licenseGate.style.display = 'flex';
      if (loginScreen) loginScreen.style.display = 'none';
      if (mainApp) mainApp.style.display = 'none';
      console.log('⏳ Waiting for license activation');
    }
  } catch (err) {
    console.error('❌ Initialization error:', err);
    const content = document.getElementById('mainContent');
    if (content) {
      content.innerHTML = `<div class="card" style="border-left:3px solid var(--rose)">
        <h5 style="color:var(--rose)">Startup Error</h5>
        <p>${err.message}</p>
        <button class="btn bp" onclick="location.reload()">Reload</button>
      </div>`;
    }
    toast('Failed to start POS: ' + err.message, 'rose', 5000);
  }
}

// Start the app
init();
