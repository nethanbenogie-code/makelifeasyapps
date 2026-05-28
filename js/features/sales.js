import { DB } from '../core/db.js';
import { currentUser } from '../core/auth.js';
import { toast, confirm2, prompt2, fc, logAct } from '../core/utils.js';
import { getBIR, printRcpt } from './bir.js';
import { openModal, closeModal } from '../ui/modal.js';
import { sw } from '../ui/render.js';

// Helper to get filtered data based on user role/branch
function getMyData(k) {
  const all = DB.getAll(k);
  if (!currentUser) return all;
  if (currentUser.role === 'admin') return all;
  if (currentUser.branchId) {
    if (k === 'activityLogs' || k === 'returns') return all.filter(i => i.branchId === currentUser.branchId || !i.branchId);
    return all.filter(i => i.branchId === currentUser.branchId || !i.branchId);
  }
  return all;
}

// --- Sales History ---
export function renderSales(el) {
  const sales = getMyData('sales').filter(s => !s.voided).slice(-60).reverse();
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <h4 style="margin:0">Sales History</h4>
    <button class="btn bd bsm" onclick="sw('voidedSales')">🚫 Voided</button>
  </div>
  ${!sales.length ? '<div class="empty-st"><div class="ei">💰</div><p>No sales yet</p></div>' : `
  <div class="tbl-wrap"><table><thead><tr>
    <th>OR/SI</th><th>Date</th><th>Total</th><th>Cash</th><th>Change</th><th>Method</th><th>Cashier</th><th></th>
   </tr></thead><tbody>
  ${sales.map(s => `<tr>
    <td style="font-family:var(--fm);font-size:.72em">${s.orNumber || '#' + s.id}</td>
    <td>${s.date}</td>
    <td style="font-family:var(--ff);color:var(--gold);font-weight:700">${fc(s.total)}</td>
    <td style="font-family:var(--fm);font-size:.75em;color:var(--gold)">${(s.paymentMethod === 'cash' || s.paymentMethod === 'split') ? fc(s.cashTendered || 0) : '—'}</td>
    <td style="font-family:var(--fm);font-size:.75em;color:var(--emerald)">${(s.paymentMethod === 'cash' || s.paymentMethod === 'split') ? fc(s.changeGiven || 0) : '—'}</td>
    <td><span style="background:${s.paymentMethod === 'cash' ? 'var(--emerald-soft)' : s.paymentMethod === 'card' ? 'var(--blue-soft)' : 'var(--purple-soft)'};color:${s.paymentMethod === 'cash' ? 'var(--emerald)' : s.paymentMethod === 'card' ? 'var(--blue)' : 'var(--purple)'};padding:2px 8px;border-radius:10px;font-size:.7em;font-weight:600">${s.paymentMethod}</span></td>
    <td>${s.cashierName || '—'}</td>
    <td style="white-space:nowrap">
      <button class="btn bw bxs" onclick="reprintSale(${s.id})">🖨</button>
      ${currentUser.role !== 'cashier' ? `<button class="btn bd bxs" onclick="voidSale(${s.id})">🚫</button>` : ''}
    </td>
  </tr>`).join('')}
  </tbody></table></div>`}`;
  window.reprintSale = reprintSale;
  window.voidSale = voidSale;
}

function reprintSale(id) {
  const sale = DB.getById('sales', id);
  if (!sale) { toast('Not found', 'rose'); return; }
  window.lastSale = sale;
  openModal(`<h4 style="margin-bottom:16px">🖨 Reprint ${sale.orNumber || '#' + id}</h4>
    <div class="print-grid">
      <button class="print-btn" onclick="printRcpt('thermal');closeModal()"><span class="pico">🧾</span>Thermal</button>
      <button class="print-btn" onclick="printRcpt('a4');closeModal()"><span class="pico">📄</span>A4</button>
      <button class="print-btn" onclick="closeModal()" style="border-color:rgba(240,101,119,.25);color:var(--rose)"><span class="pico">✕</span>Cancel</button>
    </div>
    <button class="btn bd bbl" onclick="closeModal()" style="margin-top:4px">Close</button>`);
}

async function voidSale(id) {
  const sale = DB.getById('sales', id);
  if (!sale) { toast('Sale not found', 'rose'); return; }
  if (sale.voided) { toast('Already voided', 'rose'); return; }
  const reason = await prompt2('Reason for void (required for BIR):', 'e.g. Wrong item entered');
  if (!reason || !reason.trim()) { toast('Void reason is required', 'rose'); return; }
  const ok = await confirm2(`Void ${sale.orNumber || '#' + id} for ${fc(sale.total)}?\nThis is permanent and logged for BIR audit.`, '🚫', true);
  if (!ok) return;
  // Restore stock
  (sale.items || []).forEach(item => {
    const p = DB.getById('products', item.productId);
    if (p) { p.stock += item.quantity; DB.update('products', p); }
  });
  sale.voided = true;
  sale.voidReason = reason;
  sale.voidedBy = currentUser.name;
  sale.voidedAt = new Date().toISOString();
  DB.update('sales', sale);
  // Adjust GAT
  const gatSetting = DB.getAll('settings').find(s => s.key === 'bir_gat');
  if (gatSetting) {
    gatSetting.value = Math.max(0, parseFloat(gatSetting.value) - sale.total).toFixed(2);
    DB.update('settings', gatSetting);
  }
  DB.add('voidedSales', {
    originalSaleId: id,
    orNumber: sale.orNumber,
    amount: sale.total,
    reason,
    voidedBy: currentUser.name,
    timestamp: new Date().toISOString()
  });
  logAct('VOID', `${sale.orNumber || '#' + id}: ${fc(sale.total)} — ${reason}`);
  toast('Transaction voided and logged ✓', 'emerald');
  sw('allSales');
}

// --- Voided Transactions ---
export function renderVoided(el) {
  const voided = getMyData('sales').filter(s => s.voided);
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <h4 style="margin:0">🚫 Voided Transactions</h4><span class="bir-badge">BIR Audit Trail</span>
  </div>
  <div class="card" style="border:1px solid rgba(240,101,119,.25);margin-bottom:12px">
    <p style="font-size:.78em;color:var(--text2);line-height:1.6">Kept permanently for BIR compliance. Cannot be deleted.</p>
  </div>
  ${!voided.length ? '<div class="empty-st"><div class="ei">✅</div><p>No voided transactions</p></div>' : `
  <div class="tbl-wrap"><table><thead><tr><th>OR #</th><th>Date</th><th>Amount</th><th>Voided By</th><th>Reason</th></tr></thead><tbody>
  ${voided.map(s => `<tr>
    <td style="font-family:var(--fm);font-size:.72em">${s.orNumber || '#' + s.id}</td>
    <td>${s.date}</td>
    <td style="color:var(--rose);font-family:var(--fm)">${fc(s.total)}</td>
    <td>${s.voidedBy || '—'}</td>
    <td style="font-size:.75em">${s.voidReason || '—'}</td>
  </tr>`).join('')}
  </tbody></table></div>`}`;
}

// --- Returns & Refunds ---
export function renderReturns(el) {
  const returns = getMyData('returns').slice(-30).reverse();
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <h4 style="margin:0">↩️ Returns & Refunds</h4>
    <button class="btn bp bsm" onclick="showReturnModal()">+ New Return</button>
  </div>
  <div class="card" style="border:1px solid rgba(240,101,119,.2);margin-bottom:12px">
    <p style="font-size:.78em;color:var(--text2);line-height:1.6">Returns are for items brought back after purchase. Stock is restored and the refund amount is recorded for BIR reporting. Different from voids.</p>
  </div>
  ${!returns.length ? '<div class="empty-st"><div class="ei">↩️</div><p>No returns yet</p></div>' : `
  <div class="tbl-wrap"><table><thead><tr><th>Date</th><th>OR Ref</th><th>Refund</th><th>Reason</th><th>By</th></tr></thead><tbody>
  ${returns.map(r => `<tr>
    <td>${r.date || ''}</td>
    <td style="font-family:var(--fm);font-size:.72em">${r.orNumber || '—'}</td>
    <td style="color:var(--rose);font-family:var(--fm)">${fc(r.refundAmount || 0)}</td>
    <td style="font-size:.75em">${r.reason || '—'}</td>
    <td>${r.processedBy || '—'}</td>
  </tr>`).join('')}
  </tbody></table></div>`}`;
  window.showReturnModal = showReturnModal;
}

function showReturnModal() {
  openModal(`<h4>↩️ New Return</h4>
    <label class="inp-label">Original OR/SI Number *</label>
    <input type="text" id="retOR" placeholder="e.g. OR-0000001">
    <label class="inp-label">Reason for Return *</label>
    <textarea id="retReason" placeholder="e.g. Defective item, wrong size, customer changed mind" rows="3"></textarea>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">
      <button class="btn bd" onclick="closeModal()">Cancel</button>
      <button class="btn bp" onclick="processReturn()">Process Return</button>
    </div>`);
}

async function processReturn() {
  const orNum = document.getElementById('retOR')?.value.trim() || '';
  const reason = document.getElementById('retReason')?.value.trim() || '';
  if (!orNum) { toast('OR number is required', 'rose'); return; }
  if (!reason) { toast('Return reason is required', 'rose'); return; }
  const sale = DB.getAll('sales').find(s => s.orNumber === orNum && !s.voided);
  if (!sale) { toast('Sale not found: ' + orNum, 'rose'); return; }
  const ok = await confirm2(`Process return for ${orNum}?\nRefund amount: ${fc(sale.total)}.\nStock will be restored.`, '↩️');
  if (!ok) return;
  DB.add('returns', {
    date: new Date().toISOString().split('T')[0],
    orNumber: orNum,
    saleId: sale.id,
    items: sale.items,
    refundAmount: sale.total,
    reason,
    processedBy: currentUser.name,
    branchId: currentUser.branchId,
    timestamp: new Date().toISOString()
  });
  // Restore stock
  (sale.items || []).forEach(item => {
    const p = DB.getById('products', item.productId);
    if (p) { p.stock += item.quantity; DB.update('products', p); }
  });
  // Reduce GAT
  const gatSetting = DB.getAll('settings').find(s => s.key === 'bir_gat');
  if (gatSetting) {
    gatSetting.value = Math.max(0, parseFloat(gatSetting.value) - sale.total).toFixed(2);
    DB.update('settings', gatSetting);
  }
  logAct('Return', 'OR ' + orNum + ': ' + fc(sale.total) + ' — ' + reason);
  closeModal();
  toast('Return processed. Refund: ' + fc(sale.total), 'emerald');
  sw('returns');
}