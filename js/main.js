// js/main.js - Entry point for MLEA POS Modular v6

import { initDB, DB } from './core/db.js';
import {
  initAuth,
  renderLogin,
  logout,
  setCurrentUser,
  currentUser,
  resetSesTimer
} from './core/auth.js';
import { initLicense, showLicGate } from './core/license.js';
import { toast, updateSyncBar } from './core/utils.js';
import { renderSidebar } from './ui/sidebar.js';
import { sw, registerView } from './ui/render.js';
import { initModal, openModal, closeModal } from './ui/modal.js';

// ========== TEMPORARY VIEWS (replace with full features later) ==========
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

// Register all views
registerView('dashboard', renderDashboard);
registerView('pos', renderPOS);

// ========== GLOBAL EXPOSURES (for inline onclick handlers) ==========
window.sw = sw;
window.toast = toast;
window.logout = logout;
window.openModal = openModal;
window.closeModal = closeModal;

// Expose DB and currentUser for debugging (optional)
window.DB = DB;
window.currentUser = currentUser;

// ========== INITIALIZATION ==========
async function init() {
  console.log('🚀 Initializing MLEA POS...');

  try {
    // 1. Database (IndexedDB / localStorage)
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

    // 6. Determine which screen to show
    const isActivated = localStorage.getItem('mlea_activated') === 'true';
    const licenseGate = document.getElementById('licenseGate');
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');

    if (isActivated) {
      // License already active → show login screen
      if (licenseGate) licenseGate.style.display = 'none';
      if (loginScreen) loginScreen.style.display = 'flex';
      if (mainApp) mainApp.style.display = 'none';

      // Render user list (Admin user is created by localDB.js)
      renderLogin();
      console.log('✅ Login screen rendered');
    } else {
      // No active license → show license gate
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
