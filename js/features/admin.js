import { DB } from '../core/db.js';
import { currentUser, logout } from '../core/auth.js';
import { toast, confirm2, prompt2, fc, getSetting, saveSetting, logAct, updateSyncBar } from '../core/utils.js';
import { openModal, closeModal } from '../ui/modal.js';
import { sw } from '../ui/render.js';
import { renderSidebar } from '../ui/sidebar.js';

// --- Branches (admin only) ---
export function renderBranches(el) {
  if (currentUser.role !== 'admin') {
    el.innerHTML = '<div class="empty-st"><div class="ei">🔒</div><p>Admin only</p></div>';
    return;
  }
  const branches = DB.getAll('branches');
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><h4 style="margin:0">Branches</h4><button class="btn bp bsm" onclick="showAddBranchModal()">+ Add Branch</button></div>
  ${branches.map(b => {
    const users = DB.getByBranch('users', b.id);
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div><strong style="font-family:var(--ff)">${b.name}</strong>
        <p style="color:var(--text2);font-size:.78em;margin-top:4px">${b.address || 'No address'}</p>
        <p style="color:var(--text2);font-size:.75em">${b.phone || 'No phone'} · ${users.length} user${users.length !== 1 ? 's' : ''}</p></div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn bs bxs" onclick="addBranchUser(${b.id})">+ User</button>
          <button class="btn bd bxs" onclick="deleteBranch(${b.id})">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('')}`;
  window.showAddBranchModal = () => {
    openModal(`<h4>Add Branch</h4>
      <label class="inp-label">Branch Name *</label><input type="text" id="mi1" placeholder="e.g. South Branch">
      <label class="inp-label">Address</label><input type="text" id="mi2" placeholder="e.g. 456 South St">
      <label class="inp-label">Phone</label><input type="tel" id="mi3" placeholder="e.g. 555-1234">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">
        <button class="btn bd" onclick="closeModal()">Cancel</button>
        <button class="btn bp" onclick="addBranch()">Create Branch</button>
      </div>`);
  };
  window.addBranch = () => {
    const name = document.getElementById('mi1').value.trim();
    if (!name) { toast('Branch name is required', 'rose'); return; }
    DB.add('branches', { name, address: document.getElementById('mi2').value || '', phone: document.getElementById('mi3').value || '' });
    closeModal();
    sw('branches');
    toast('Branch created ✓', 'emerald');
  };
  window.deleteBranch = async (id) => {
    const ok = await confirm2('Delete this branch? Users assigned to it will not be deleted.', '🏢', true);
    if (ok) { DB.delete('branches', id); sw('branches'); }
  };
  window.addBranchUser = async (bid) => {
    const name = await prompt2('New user name:', 'e.g. Juan dela Cruz');
    if (!name) return;
    const pin = await prompt2('4-digit PIN:', 'e.g. 1234');
    if (!pin || pin.length !== 4) { toast('PIN must be exactly 4 digits', 'rose'); return; }
    const role = await prompt2('Role (cashier or manager):', 'cashier', 'cashier');
    const finalRole = (role || 'cashier').toLowerCase().includes('manager') ? 'manager' : 'cashier';
    DB.add('users', { name, role: finalRole, active: true, pin, branchId: bid });
    sw('branches');
    toast(name + ' added as ' + finalRole + ' ✓', 'emerald');
  };
}

// --- Users management ---
export function renderUsers(el) {
  const users = DB.getAll('users');
  const isAll = (currentView === 'allUsers');
  const filtered = isAll ? users : users.filter(u => u.branchId === currentUser.branchId);
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><h4 style="margin:0">Users</h4><button class="btn bp bsm" onclick="showAddUserModal()">+ Add</button></div>
  ${filtered.map(u => {
    const canDel = currentUser.role === 'admin' && u.id !== currentUser.id || (currentUser.role === 'manager' && u.role === 'cashier' && u.branchId === currentUser.branchId);
    return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:1.4em">${u.role === 'admin' ? '👑' : u.role === 'manager' ? '🎯' : '👤'}</span>
        <div><strong style="font-family:var(--ff)">${u.name}</strong>
          <div style="margin-top:3px;display:flex;gap:6px">
            <span class="rbadge rb-${u.role}">${u.role}</span>
            ${u.active ? '<span style="font-size:.65em;color:var(--emerald)">● Active</span>' : '<span style="font-size:.65em;color:var(--rose)">● Inactive</span>'}
          </div>
        </div>
      </div>
      <div style="display:flex;gap:6px">
        ${currentUser.role === 'admin' || (currentUser.role === 'manager' && u.role === 'cashier') ? `<button class="btn bw bxs" onclick="toggleUser(${u.id})">${u.active ? 'Deact.' : 'Activate'}</button>` : ''}
        ${canDel ? `<button class="btn bd bxs" onclick="deleteUserSafe(${u.id},'${u.name}','${u.role}')">🗑</button>` : ''}
      </div>
    </div></div>`;
  }).join('')}`;
  window.showAddUserModal = async () => {
    const name = await prompt2('User full name:', 'e.g. Juan dela Cruz');
    if (!name) return;
    const pin = await prompt2('Set 4-digit PIN:', 'e.g. 1234');
    if (!pin || pin.length !== 4) { toast('PIN must be exactly 4 digits', 'rose'); return; }
    let role = 'cashier';
    if (currentUser.role === 'admin') {
      const r = await prompt2('Role (1=Cashier, 2=Manager, 3=Admin):', '1', '1');
      if (r === '2') role = 'manager';
      else if (r === '3') role = 'admin';
    }
    DB.add('users', { name, role, active: true, pin, branchId: currentUser.branchId });
    sw(currentView);
    toast(name + ' created as ' + role + ' · PIN: ' + pin, 'emerald', 5000);
  };
  window.deleteUserSafe = async (id, name, role) => {
    if (id === currentUser.id) { toast('You cannot delete your own account', 'rose'); return; }
    if (currentUser.role === 'manager') {
      const t = DB.getById('users', id);
      if (!t || t.role !== 'cashier' || t.branchId !== currentUser.branchId) { toast('You can only delete cashiers in your branch', 'rose'); return; }
    }
    const ok = await confirm2(`Delete user "${name}" (${role})? This cannot be undone.`, '👥', true);
    if (ok) { DB.delete('users', id); sw(currentView); renderLogin(); toast('User deleted ✓', 'emerald'); }
  };
  window.toggleUser = (id) => {
    const u = DB.getById('users', id);
    if (!u || u.id === currentUser.id) { toast('You cannot deactivate yourself', 'rose'); return; }
    u.active = !u.active;
    DB.update('users', u);
    sw(currentView);
    toast(u.name + (u.active ? ' activated' : ' deactivated'), 'emerald');
  };
}

// --- Activity Log ---
export function renderActLog(el) {
  let logs = DB.getAll('activityLogs');
  if (currentUser.role !== 'admin') logs = logs.filter(l => l.branchId === currentUser.branchId);
  logs = logs.slice(-100).reverse();
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <h4 style="margin:0">📝 Activity Log</h4><span class="bir-badge">Audit Trail</span>
  </div>
  <div class="card" style="padding:0;overflow:hidden">
    ${!logs.length ? '<div class="empty-st"><div class="ei">📝</div><p>No activity yet</p></div>' :
      logs.map(l => `<div class="log-item">
        <div class="log-act">${l.action} — <span style="font-family:var(--fm);font-size:.88em;color:var(--text2)">${l.details || ''}</span></div>
        <div class="log-meta">${l.userName || '?'} (${l.userRole || '?'}) · ${new Date(l.timestamp).toLocaleString('en-PH')}</div>
      </div>`).join('')}
  </div>`;
}

// --- Backup & Export ---
export function renderBackup(el) {
  const lastBackup = getSetting('last_backup_ts', '0');
  const lastBackupDate = lastBackup !== '0' ? new Date(parseInt(lastBackup)).toLocaleDateString() : 'Never';
  el.innerHTML = `<div class="card" style="border-left:3px solid var(--gold)">
    <h4>Backup & Export</h4>
    <p style="color:var(--text2);font-size:.8em">Protect your data with regular backups. Last backup: ${lastBackupDate}</p>
  </div>
  <div class="card">
    <h5>📥 Export Options</h5>
    <button class="btn bp bbl" onclick="downloadBackup()">📦 Full System Backup (JSON)</button>
    <button class="btn bs bbl" onclick="exportCSV('sales')">📊 Sales Report CSV</button>
    <button class="btn bw bbl" onclick="exportCSV('inventory')">📋 Inventory CSV</button>
    <button class="btn bb bbl" onclick="exportBIRReport()">🏛️ BIR Monthly Report CSV</button>
  </div>
  <div class="card" style="border:1px solid rgba(240,101,119,.25)">
    <h5 style="color:var(--rose)">⚠ Restore from Backup</h5>
    <p style="font-size:.78em;color:var(--text2);margin-bottom:10px;line-height:1.5">This will replace ALL current data with the backup file. Make sure to export a current backup first.</p>
    <input type="file" id="restoreFile" accept=".json" style="margin-bottom:10px">
    <button class="btn bd bbl" onclick="restoreBackup()">🔄 Restore Data from File</button>
  </div>`;
  window.downloadBackup = () => {
    const data = {};
    const STORES = ['products', 'sales', 'users', 'settings', 'branches', 'activityLogs', 'suppliers', 'purchaseOrders', 'voidedSales', 'heldSales', 'returns', 'customers'];
    STORES.forEach(s => data[s] = DB.getAll(s));
    data.backupDate = new Date().toISOString();
    data.bir = getBIR();
    data.gat = getGAT();
    data.version = '6.0';
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mlea_backup_v6_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    saveSetting('last_backup_ts', String(Date.now()));
    toast('Backup downloaded ✓', 'emerald');
  };
  window.restoreBackup = async () => {
    const file = document.getElementById('restoreFile').files[0];
    if (!file) { toast('Select a backup file', 'rose'); return; }
    const ok = await confirm2('This will REPLACE all current data with the backup. Make sure you have exported a current backup first.', '⚠️', true);
    if (!ok) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const d = JSON.parse(e.target.result);
        if (!d.version) throw new Error('Invalid backup format');
        const STORES = ['products', 'sales', 'users', 'settings', 'branches', 'activityLogs', 'suppliers', 'purchaseOrders', 'voidedSales', 'heldSales', 'returns', 'customers'];
        STORES.forEach(s => { if (d[s]) DB.set(s, d[s]); });
        toast('Data restored ✓ Reloading…', 'emerald');
        setTimeout(() => location.reload(), 1500);
      } catch (err) { toast('Invalid backup file: ' + err.message, 'rose'); }
    };
    reader.readAsText(file);
  };
  window.exportCSV = (type) => {
    let csv = '';
    const d = new Date().toISOString().split('T')[0];
    if (type === 'sales') {
      csv = 'OR No.,Date,Total,VAT,VATable,Payment,Cash Tendered,Change,Cashier,Branch,Disc Type,Disc Amount\n';
      const sales = DB.getAll('sales').filter(s => !s.voided);
      sales.forEach(s => csv += `${s.orNumber || s.id},${s.date},${s.total},${s.tax || 0},${s.vatableSales || 0},${s.paymentMethod},${s.cashTendered || 0},${s.changeGiven || 0},"${s.cashierName || ''}","${s.branchName || ''}",${s.discountType || 'none'},${s.discountAmount || 0}\n`);
    } else {
      csv = 'SKU,Name,Price,Cost,Stock,Unit,Category,Barcode,VAT Status,Branch\n';
      DB.getAll('products').forEach(p => {
        const b = p.branchId ? DB.getById('branches', p.branchId) : null;
        csv += `${p.sku},"${p.name}",${p.price},${p.cost || 0},${p.stock},${p.unit || 'pcs'},"${p.category || ''}",${p.barcode || ''},${p.vatExempt ? 'VAT-Exempt' : p.zeroRated ? 'Zero-Rated' : 'VAT'},"${b ? b.name : 'Global'}"\n`;
      });
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${type}_${d}.csv`;
    a.click();
    toast(type + ' CSV downloaded ✓', 'emerald');
  };
  window.exportBIRReport = () => {
    const m = new Date().toISOString().substring(0, 7);
    const bir = getBIR();
    const sales = DB.getAll('sales').filter(s => s.date.startsWith(m) && !s.voided);
    let csv = `BIR SALES JOURNAL\n"Business: ${bir.name}"\n"TIN: ${bir.tin}"\n"Period: ${m}"\n"PTU: ${bir.ptu}"\n\n`;
    csv += 'OR/SI No.,Date,Cashier,Branch,VATable Sales,VAT Amount,VAT-Exempt,Zero-Rated,Total,Disc Type,Disc Amount,Payment,Cash Tendered,Change\n';
    sales.forEach(s => csv += `${s.orNumber || s.id},${s.date},"${s.cashierName || ''}","${s.branchName || ''}",${(s.vatableSales || 0).toFixed(2)},${(s.tax || 0).toFixed(2)},${(s.vatExemptSales || 0).toFixed(2)},${(s.zeroRatedSales || 0).toFixed(2)},${s.total.toFixed(2)},${s.discountType || 'none'},${(s.discountAmount || 0).toFixed(2)},${s.paymentMethod},${s.cashTendered || 0},${s.changeGiven || 0}\n`);
    csv += `\nVoided Transactions\nOR/SI No.,Date,Amount,Voided By,Reason\n`;
    DB.getAll('sales').filter(s => s.date.startsWith(m) && s.voided).forEach(s => csv += `${s.orNumber || s.id},${s.date},${s.total.toFixed(2)},"${s.voidedBy || ''}","${s.voidReason || ''}"\n`);
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `BIR_Report_${m}.csv`;
    a.click();
    toast('BIR report downloaded ✓', 'emerald');
  };
}

// --- Settings ---
export function renderSettings(el) {
  const cur = getSetting('currency', 'PHP');
  const taxRate = parseFloat(getSetting('taxRate', '0.12')) * 100;
  const lowStockThresh = getSetting('lowStockThresh', '10');
  const sesTimeout = getSetting('ses_timeout', '30');
  const rcptFooter = getSetting('rcptFooter', 'Thank you for your purchase!');
  const printMode = getSetting('printMode', 'ask');
  el.innerHTML = `<h4>Settings</h4>
    <div class="card">
      <h5>💱 Currency</h5>
      <input type="text" id="curSearch" placeholder="🔍 Search currency…" oninput="filterCur(this.value)" style="margin-bottom:8px">
      <select id="curSel" size="5" style="height:130px;border-radius:var(--r2);padding:4px">
        ${Object.entries(CURR).map(([c, v]) => `<option value="${c}" ${cur === c ? 'selected' : ''}>${v.f} ${v.n} (${v.s})</option>`).join('')}
      </select>
      <p style="font-size:.72em;color:var(--gold);margin-top:6px;font-weight:600">Selected: ${CURR[cur]?.f || '?'} ${CURR[cur]?.n || cur} (${CURR[cur]?.s || '?'})</p>
    </div>
    <div class="card">
      <h5>💰 VAT / Tax Rate (%)</h5>
      <div style="display:flex;gap:10px;align-items:center">
        <input type="number" id="taxInp" value="${taxRate}" step="0.1" style="margin-bottom:0">
        <button class="btn bp bsm" onclick="saveTax()">Save</button>
      </div>
    </div>
    <div class="card">
      <h5>📦 Low Stock Threshold</h5>
      <div style="display:flex;gap:10px;align-items:center">
        <input type="number" id="lsInp" value="${lowStockThresh}" min="1" max="999" style="margin-bottom:0">
        <button class="btn bp bsm" onclick="saveLowStock()">Save</button>
      </div>
    </div>
    <div class="card">
      <h5>⏱ Session Timeout (minutes)</h5>
      <div style="display:flex;gap:10px;align-items:center">
        <input type="number" id="sesInp" value="${sesTimeout}" min="5" max="480" style="margin-bottom:0">
        <button class="btn bp bsm" onclick="saveTimeout()">Save</button>
      </div>
    </div>
    <div class="card">
      <h5>🧾 Receipt Footer</h5>
      <input type="text" id="ftrInp" value="${rcptFooter}">
      <button class="btn bp bsm" onclick="saveFooter()">Save</button>
    </div>
    <div class="card">
      <h5>🖨 Default Print Mode</h5>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:10px">
        ${[['ask', '❓ Ask Every Time', 'gold'], ['thermal', '🧾 Auto Thermal', 'emerald'], ['a4', '📄 Auto A4', 'blue'], ['none', '✕ No Print', 'rose']].map(([m, l, c]) => `
        <button onclick="savePrintMode('${m}')" style="padding:12px 8px;border-radius:var(--r2);border:2px solid ${printMode === m ? 'var(--' + c + ')' : 'var(--border)'};background:${printMode === m ? 'var(--' + c + '-soft)' : 'var(--bg-glass)'};color:${printMode === m ? 'var(--' + c + ')' : 'var(--text2)'};cursor:pointer;font-family:var(--ff);font-size:.8em;font-weight:700">${l}</button>`).join('')}
      </div>
      <p style="font-size:.7em;color:var(--gold);font-weight:600">Current: ${printMode === 'ask' ? '❓ Ask' : printMode === 'thermal' ? '🧾 Thermal' : printMode === 'a4' ? '📄 A4' : '✕ No Print'}</p>
    </div>
    <div class="card" style="border:1px solid rgba(212,168,83,.3)">
      <h5 style="color:var(--gold)">Quick Links</h5>
      <button class="btn bp bbl" onclick="sw('birSetup')">🏛️ BIR Setup →</button>
      <button class="btn bs bbl" onclick="sw('fbSetup')" style="margin-top:0">☁️ Firebase Setup →</button>
    </div>`;
  window.filterCur = (q) => {
    const sel = document.getElementById('curSel');
    if (!sel) return;
    sel.innerHTML = Object.entries(CURR).filter(([c, v]) => v.n.toLowerCase().includes(q.toLowerCase()) || c.toLowerCase().includes(q.toLowerCase())).map(([c, v]) => `<option value="${c}" ${cur === c ? 'selected' : ''}>${v.f} ${v.n} (${v.s})</option>`).join('');
  };
  window.saveTax = () => {
    const newRate = parseFloat(document.getElementById('taxInp').value) / 100;
    saveSetting('taxRate', newRate.toString());
    toast('Tax rate saved ✓', 'emerald');
  };
  window.saveLowStock = () => {
    const newThresh = parseInt(document.getElementById('lsInp').value) || 10;
    saveSetting('lowStockThresh', newThresh.toString());
    toast('Saved ✓', 'emerald');
  };
  window.saveTimeout = () => {
    saveSetting('ses_timeout', document.getElementById('sesInp').value);
    toast('Saved ✓', 'emerald');
  };
  window.saveFooter = () => {
    saveSetting('rcptFooter', document.getElementById('ftrInp').value);
    toast('Saved ✓', 'emerald');
  };
  window.savePrintMode = (mode) => {
    saveSetting('printMode', mode);
    sw('settings');
  };
}

// --- Firebase Setup ---
export function renderFBSetup(el) {
  const savedConfig = getSetting('firebase_config', '');
  const storageMode = getSetting('storageMode', 'local');
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <h4 style="margin:0">☁️ Firebase Setup</h4>
    <span class="${storageMode === 'firebase' ? 'fb-on' : 'fb-off'}">${storageMode === 'firebase' ? '☁️ Connected' : '💾 Local Mode'}</span>
  </div>
  <div class="card" style="border:1px solid rgba(111,163,239,.3)">
    <p style="font-size:.82em;color:var(--text2);line-height:1.7;margin-bottom:12px">Firebase enables real-time sync across all devices. Your data is always mirrored locally too — the system works fully offline and syncs when reconnected.</p>
    <div style="font-size:.78em;color:var(--text2);line-height:1.9">
      1. Go to <strong style="color:var(--text)">console.firebase.google.com</strong><br>
      2. Create project → Firestore Database → Start in test mode<br>
      3. Project Settings → Your apps → Add web app → Copy config JSON<br>
      4. Paste config below and click Connect
    </div>
  </div>
  <div class="card">
    <h5>Firebase Config (JSON)</h5>
    <textarea id="fbConfig" rows="8" placeholder='{"apiKey":"...","authDomain":"...","projectId":"...","storageBucket":"...","messagingSenderId":"...","appId":"..."}'>${savedConfig}</textarea>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <button class="btn bd" onclick="disconnectFB()">💾 Use Local</button>
      <button class="btn bp" onclick="connectFB()">☁️ Connect Firebase</button>
    </div>
  </div>
  <div class="card">
    <h5>📤 Migrate Local → Firebase</h5>
    <p style="font-size:.78em;color:var(--text2);margin-bottom:10px">After connecting, push all existing local data up to Firebase.</p>
    <button class="btn bs bbl" onclick="migrateToFB()">📤 Migrate All Local Data</button>
  </div>
  <div class="card" style="border:1px solid rgba(45,212,160,.2)">
    <h5 style="color:var(--emerald)">Current Mode</h5>
    <p style="font-size:.82em;color:${storageMode === 'firebase' ? 'var(--emerald)' : 'var(--blue)'}">${storageMode === 'firebase' ? '☁️ Firebase Firestore — real-time cloud sync active' : '💾 Local Storage — data lives on this device only'}</p>
    ${storageMode === 'firebase' ? `<p style="font-size:.72em;color:var(--text2);margin-top:6px">Network: ${navigator.onLine ? '✅ Online' : '❌ Offline'} · Pending: ${window.offQ ? window.offQ.length : 0} operations</p>` : ''}
  </div>`;
  window.connectFB = async () => {
    const input = document.getElementById('fbConfig')?.value.trim();
    if (!input) { toast('Paste your Firebase config JSON first', 'rose'); return; }
    let config;
    try { config = JSON.parse(input); } catch (e) { toast('Invalid JSON — check your config: ' + e.message, 'rose'); return; }
    if (!config.apiKey || !config.projectId) { toast('Config missing apiKey or projectId', 'rose'); return; }
    toast('Connecting to Firebase…', 'gold', 8000);
    saveSetting('firebase_config', input);
    const ok = await window.FirebaseDB.init(config);
    if (ok) {
      saveSetting('storageMode', 'firebase');
      updateSyncBar();
      renderSidebar();
      toast('Firebase connected ✓', 'emerald');
      sw('fbSetup');
    } else {
      toast('Firebase connection failed. Check config and Firestore rules.', 'rose');
    }
  };
  window.disconnectFB = async () => {
    const ok = await confirm2('Switch to local storage? Firebase data stays intact — local copy will be used going forward.', '💾');
    if (!ok) return;
    saveSetting('storageMode', 'local');
    updateSyncBar();
    renderSidebar();
    toast('Switched to Local Storage', 'gold');
    sw('fbSetup');
  };
  window.migrateToFB = async () => {
    const mode = getSetting('storageMode', 'local');
    if (mode !== 'firebase') { toast('Connect Firebase first', 'rose'); return; }
    const ok = await confirm2('Push all local data to Firebase? Existing Firebase records will be overwritten.', '📤');
    if (!ok) return;
    toast('Migrating…', 'gold', 15000);
    let count = 0;
    const STORES = ['products', 'sales', 'users', 'settings', 'branches', 'activityLogs', 'suppliers', 'purchaseOrders', 'voidedSales', 'heldSales', 'returns', 'customers'];
    for (const store of STORES) {
      const items = DB.getAll(store);
      for (const item of items) {
        const did = store + '_' + item.id;
        item._did = did;
        await window.FirebaseDB._write(store, did, item);
        count++;
      }
    }
    toast('Migration complete! ' + count + ' records pushed ✓', 'emerald');
  };
}