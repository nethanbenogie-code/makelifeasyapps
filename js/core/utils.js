// js/core/utils.js
import { DB } from './db.js';

export const CURR = {
  PHP: { s: '₱', n: 'Philippine Peso', f: '🇵🇭', d: 2 },
  USD: { s: '$', n: 'US Dollar', f: '🇺🇸', d: 2 },
  EUR: { s: '€', n: 'Euro', f: '🇪🇺', d: 2 },
  GBP: { s: '£', n: 'British Pound', f: '🇬🇧', d: 2 },
  // ... (add other currencies as needed, but at least PHP is required)
};

export let cur = 'PHP';
export let taxRate = 0.12;
export let lowStockThresh = 10;
export let printMode = 'ask';
export let rcptFooter = 'Thank you for your purchase!';

export function fc(amount) {
  const c = CURR[cur] || CURR.PHP;
  const n = parseFloat(amount) || 0;
  return c.s + (c.d === 0 ? Math.round(n).toLocaleString() : n.toFixed(2));
}

export function toast(msg, color = 'gold', dur = 3200) {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;
  const t = document.createElement('div');
  t.className = 'toast';
  const colorMap = { gold: 'var(--gold)', rose: 'var(--rose)', emerald: 'var(--emerald)', blue: 'var(--blue)', purple: 'var(--purple)' };
  t.style.cssText = `background:var(--bg-elevated);border:1px solid ${colorMap[color] || 'var(--gold)'};color:${colorMap[color] || 'var(--gold)'}`;
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity .4s';
    setTimeout(() => t.remove(), 400);
  }, dur);
}

export function dlg(opts) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'dlg-overlay';
    const icon = opts.icon || '💬';
    const type = opts.type || 'alert';
    const color = opts.color || 'var(--gold)';
    el.innerHTML = `<div class="dlg-box">
      <div class="dlg-icon">${icon}</div>
      <div class="dlg-title" style="color:${color}">${opts.title || ''}</div>
      <div class="dlg-msg">${opts.msg || ''}</div>
      ${type === 'prompt' ? `<div class="dlg-input"><input type="${opts.inputType || 'text'}" id="dlgInput" placeholder="${opts.placeholder || ''}" value="${opts.defaultVal || ''}" style="margin-bottom:0"></div>` : ''}
      <div class="dlg-btns">
        ${type !== 'alert' ? `<button class="btn bd" id="dlgCancel">${opts.cancelLabel || 'Cancel'}</button>` : ''}
        <button class="btn ${type === 'confirm' && opts.danger ? 'bd' : 'bp'}" id="dlgOk">${opts.okLabel || 'OK'}</button>
      </div>
    </div>`;
    document.body.appendChild(el);
    setTimeout(() => {
      const inp = el.querySelector('#dlgInput');
      if (inp) inp.focus();
      const ok = el.querySelector('#dlgOk');
      const cancel = el.querySelector('#dlgCancel');
      const finish = val => { el.remove(); resolve(val); };
      ok.onclick = () => {
        if (type === 'prompt') finish(el.querySelector('#dlgInput').value);
        else finish(true);
      };
      if (cancel) cancel.onclick = () => finish(type === 'prompt' ? null : false);
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter') ok.click();
        if (e.key === 'Escape' && cancel) cancel.click();
      });
    }, 50);
  });
}

export const alert2 = (msg, icon = 'ℹ️', color = 'var(--blue)') => dlg({ type: 'alert', icon, msg, color, okLabel: 'OK' });
export const confirm2 = (msg, icon = '⚠️', danger = false) => dlg({ type: 'confirm', icon, msg, color: danger ? 'var(--rose)' : 'var(--gold)', danger, okLabel: 'Confirm', cancelLabel: 'Cancel' });
export const prompt2 = (msg, placeholder = '', defaultVal = '', inputType = 'text') => dlg({ type: 'prompt', icon: '✏️', msg, placeholder, defaultVal, inputType, okLabel: 'Save', cancelLabel: 'Cancel', color: 'var(--gold)' });

export function getSetting(key, def = '') {
  try {
    const all = DB.getAll('settings');
    if (!Array.isArray(all)) return def;
    const found = all.find(s => s.key === key);
    return found ? found.value : def;
  } catch { return def; }
}

export function saveSetting(key, value) {
  let all = DB.getAll('settings');
  if (!Array.isArray(all)) all = [];
  const found = all.find(s => s.key === key);
  if (found) {
    found.value = value;
    DB.update('settings', found);
  } else {
    DB.add('settings', { key, value });
  }
  if (key === 'currency') cur = value;
  if (key === 'taxRate') taxRate = parseFloat(value) || 0.12;
  if (key === 'lowStockThresh') lowStockThresh = parseInt(value) || 10;
  if (key === 'printMode') printMode = value || 'ask';
  if (key === 'rcptFooter') rcptFooter = value || 'Thank you for your purchase!';
}

export function getLowStockThreshold() { return lowStockThresh; }

export function logAct(action, details) {
  const currentUser = window.currentUser;
  if (!currentUser) return;
  DB.add('activityLogs', {
    userId: currentUser.id,
    userName: currentUser.name,
    userRole: currentUser.role,
    branchId: currentUser.branchId,
    action, details, timestamp: new Date().toISOString()
  });
}

export function updateSyncBar() {
  const bar = document.getElementById('syncBar');
  if (!bar) return;
  bar.style.display = 'flex';
  const mode = getSetting('storageMode', 'local');
  const dot = document.getElementById('syncDot');
  const label = document.getElementById('syncLabel');
  const msg = document.getElementById('syncMsg');
  if (mode === 'firebase') {
    dot.className = 'sdot cloud';
    label.textContent = '☁️ Firebase';
    msg.textContent = navigator.onLine ? 'Online' : 'Offline — queuing';
  } else {
    dot.className = 'sdot local';
    label.textContent = '💾 Local';
    msg.textContent = 'Local only';
  }
}

export function setSyncStatus(mode, text) {
  const dot = document.getElementById('syncDot');
  const label = document.getElementById('syncLabel');
  const msg = document.getElementById('syncMsg');
  if (!dot) return;
  dot.className = 'sdot ' + mode;
  label.textContent = mode === 'cloud' ? '☁️ Firebase' : mode === 'local' ? '💾 Local' : '📴 Offline';
  if (msg) msg.textContent = text || '';
}
