// js/main.js
import { initDB, DB } from './core/db.js';
import { initAuth, renderLogin, logout, setCurrentUser, currentUser, resetSesTimer } from './core/auth.js';
import { initLicense, showLicGate } from './core/license.js';
import { toast, updateSyncBar } from './core/utils.js';
import { renderSidebar } from './ui/sidebar.js';
import { sw, registerView } from './ui/render.js';
import { initModal, openModal, closeModal } from './ui/modal.js';

function renderDashboard(el) {
  el.innerHTML = `<div class="card"><h4>Dashboard</h4><p>Welcome to MLEA POS.</p><button class="btn bp" onclick="sw('pos')">POS</button></div>`;
}
function renderPOS(el) { el.innerHTML = `<div class="card"><h4>POS Terminal</h4><p>Ready for sales.</p></div>`; }
const placeholder = (el) => { el.innerHTML = `<div class="card"><h4>Coming Soon</h4><button onclick="sw('dashboard')">Back</button></div>`; };

registerView('dashboard', renderDashboard);
registerView('pos', renderPOS);
['allSales','customers','xReading','zReading','birSetup','reports','settings','inventory','allProducts','suppliers','purchaseOrders'].forEach(v => registerView(v, placeholder));

window.sw = sw; window.toast = toast; window.logout = logout; window.openModal = openModal; window.closeModal = closeModal; window.DB = DB; window.currentUser = currentUser;

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
  await initDB(); initModal(); await initLicense(); initAuth(); updateSyncBar(); initSidebarToggle();
  if (localStorage.getItem('mlea_activated') === 'true') {
    document.getElementById('licenseGate').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
    renderLogin();
  } else {
    document.getElementById('licenseGate').style.display = 'flex';
  }
}
init();
