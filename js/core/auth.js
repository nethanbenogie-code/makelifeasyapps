import { DB } from './db.js';
import { toast, confirm2, logAct, getSetting, saveSetting, lowStockThresh } from './utils.js';
import { renderSidebar } from '../ui/sidebar.js';
import { sw } from '../ui/render.js';

export let currentUser = null;
let pinEntry = '';
let pinFails = 0;
let pinLockUntil = 0;
let sesTimer = null;
let sesWarnTimer = null;

export function setCurrentUser(user) { currentUser = user; window.currentUser = user; }

function resetSesTimer() {
  clearTimeout(sesTimer);
  clearTimeout(sesWarnTimer);
  if (!currentUser) return;
  const mins = parseInt(getSetting('ses_timeout', '30')) || 30;
  const ms = mins * 60 * 1000;
  sesWarnTimer = setTimeout(() => {
    if (currentUser) toast('⏱ Session expiring in 60 seconds. Tap anywhere to stay logged in.', 'gold', 10000);
  }, Math.max(0, ms - 60000));
  sesTimer = setTimeout(() => {
    if (currentUser) {
      toast('Session expired — please sign in again', 'gold');
      logout();
    }
  }, ms);
}
export { resetSesTimer }; // 👈 export for use in main.js

document.addEventListener('click', resetSesTimer);
document.addEventListener('keydown', resetSesTimer);

function checkLock() {
  if (Date.now() < pinLockUntil) {
    const sec = Math.ceil((pinLockUntil - Date.now()) / 1000);
    const lb = document.getElementById('lockoutBar');
    if (lb) { lb.style.display = 'block'; lb.textContent = `🔒 Too many failed attempts. Try again in ${sec}s`; }
    document.querySelectorAll('.pbn').forEach(b => b.disabled = true);
    setTimeout(checkLock, 1000);
    return true;
  }
  const lb = document.getElementById('lockoutBar');
  if (lb) lb.style.display = 'none';
  document.querySelectorAll('.pbn').forEach(b => b.disabled = false);
  pinFails = 0;
  return false;
}

function updatePinDots() {
  document.querySelectorAll('.pin-dot').forEach((d, i) => {
    d.classList.toggle('on', i < pinEntry.length);
    d.classList.remove('err');
  });
}

export function renderLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('syncBar').style.display = 'none';
  const users = DB.getAll('users');
  const usrGrid = document.getElementById('usrGrid');
  if (!usrGrid) return;
  usrGrid.innerHTML = users.filter(u => u.active).map(u => `
    <div class="usr-card" data-userid="${u.id}">
      <span class="av">${u.role === 'admin' ? '👑' : u.role === 'manager' ? '🎯' : '👤'}</span>
      <div class="nm">${u.name}</div>
      <span class="rbadge rb-${u.role}">${u.role}</span>
    </div>
  `).join('');
  pinEntry = '';
  updatePinDots();
  document.getElementById('errMsg').textContent = '';
  if (Date.now() < pinLockUntil) checkLock();

  document.querySelectorAll('.usr-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.usr-card').forEach(c => c.classList.remove('sel'));
      card.classList.add('sel');
      window.selectedUserId = parseInt(card.dataset.userid);
      pinEntry = '';
      pinFails = 0;
      pinLockUntil = 0;
      updatePinDots();
      document.getElementById('errMsg').textContent = '';
    });
  });
}

function submitPin() {
  if (checkLock()) return;
  if (!window.selectedUserId) {
    document.getElementById('errMsg').textContent = 'Select a user first';
    return;
  }
  const users = DB.getAll('users');
  const user = users.find(u => u.id === window.selectedUserId);
  if (!user || !user.active) {
    document.getElementById('errMsg').textContent = !user ? 'User not found' : 'Account deactivated';
    pinEntry = '';
    updatePinDots();
    return;
  }
  if (user.pin === pinEntry) {
    pinFails = 0;
    pinLockUntil = 0;
    currentUser = user;
    window.currentUser = user;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('syncBar').style.display = 'flex';
    const branch = user.branchId ? DB.getById('branches', user.branchId) : null;
    document.getElementById('hdrBranch').innerHTML = user.branchId ? `<span class="br-chip">🏢 ${branch ? branch.name : 'Branch'}</span>` : `<span class="adm-chip">👑 Admin</span>`;
    document.getElementById('hdrTitle').textContent = user.branchId ? (branch ? branch.name : 'Branch') + ' POS' : 'MLEA HQ';
    renderSidebar();
    pinEntry = '';
    window.selectedUserId = null;
    updatePinDots();
    document.getElementById('errMsg').textContent = '';
    resetSesTimer();
    sw('dashboard');
    setTimeout(() => {
      const low = DB.getAll('products').filter(p => p.active && p.stock <= lowStockThresh).length;
      if (low) toast(`⚠️ ${low} low stock item(s)`, 'rose', 5000);
    }, 700);
  } else {
    pinFails++;
    document.getElementById('errMsg').textContent = `Incorrect PIN (${pinFails}/5)`;
    pinEntry = '';
    updatePinDots();
    document.querySelectorAll('.pin-dot').forEach(d => d.classList.add('err'));
    setTimeout(() => document.querySelectorAll('.pin-dot').forEach(d => d.classList.remove('err')), 500);
    if (pinFails >= 5) {
      pinLockUntil = Date.now() + 60000;
      logAct('PIN Lockout', 'User ' + window.selectedUserId);
      checkLock();
    }
  }
}

export function logout() {
  confirm2('Sign out of MLEA POS?', '🚪').then(ok => {
    if (!ok) return;
    currentUser = null;
    window.currentUser = null;
    clearTimeout(sesTimer);
    clearTimeout(sesWarnTimer);
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('syncBar').style.display = 'none';
    document.getElementById('sidebar').classList.remove('on');
    document.getElementById('sbOv').classList.remove('on');
    renderLogin();
  });
}

export function initAuth() {
  // Attach PIN pad listeners
  document.querySelectorAll('.pbn[data-pin]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (checkLock()) return;
      if (!window.selectedUserId) {
        document.getElementById('errMsg').textContent = 'Select a user first';
        return;
      }
      if (pinEntry.length < 4) {
        pinEntry += btn.dataset.pin;
        updatePinDots();
        if (pinEntry.length === 4) setTimeout(submitPin, 180);
      }
    });
  });
  document.querySelector('.pbn.clr')?.addEventListener('click', () => {
    pinEntry = '';
    updatePinDots();
    document.getElementById('errMsg').textContent = '';
  });
  document.querySelector('.pbn.sub')?.addEventListener('click', submitPin);
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
  document.getElementById('logoutBtn2')?.addEventListener('click', logout);

  // Load settings into reactive globals
  const settings = DB.getAll('settings');
  settings.forEach(s => {
    if (s.key === 'currency') window.cur = s.value;
    if (s.key === 'taxRate') window.taxRate = parseFloat(s.value) || 0.12;
    if (s.key === 'lowStockThresh') window.lowStockThresh = parseInt(s.value) || 10;
    if (s.key === 'printMode') window.printMode = s.value || 'ask';
    if (s.key === 'rcptFooter') window.rcptFooter = s.value || 'Thank you for your purchase!';
    // Make renderLogin available globally
    window.renderLogin = renderLogin;
  });
}
