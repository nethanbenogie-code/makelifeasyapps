// js/features/inventory.js
import { DB } from '../core/db.js';
import { currentUser } from '../core/auth.js';
import { toast, confirm2, prompt2, fc, getSetting, saveSetting, logAct } from '../core/utils.js';
import { openModal, closeModal } from '../ui/modal.js';
import { sw } from '../ui/render.js';

let lowStockThresh = getSetting('lowStockThresh', 10);

// Helper to always get array
function safeArray(data) {
  return Array.isArray(data) ? data : [];
}

// --- Products ---
export function renderProducts(el) {
  let products = DB.getAll('products');
  products = safeArray(products).filter(p => p.active);
  if (currentUser.role !== 'admin') {
    products = products.filter(p => p.branchId === currentUser.branchId);
  }
  const lowItems = products.filter(p => p.stock <= lowStockThresh);
  const suppliers = safeArray(DB.getAll('suppliers'));

  let html = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><h4 style="margin:0">Products</h4><button class="btn bp bsm" onclick="showProductModal()">+ Add</button></div>`;
  if (lowItems.length) {
    html += `<div style="background:rgba(240,101,119,.08);border:1px solid rgba(240,101,119,.25);border-radius:var(--r2);padding:12px 16px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="font-family:var(--ff);font-weight:700;font-size:.85em;color:var(--rose)">⚠️ ${lowItems.length} Low Stock</span>
        <span style="font-size:.68em;color:var(--text2)">Threshold: ≤${lowStockThresh}</span>
      </div>
      ${lowItems.map(p => `<div style="display:flex;justify-content:space-between;padding:6px 10px;background:rgba(0,0,0,.2);border-radius:6px;margin-bottom:4px">
        <span style="font-size:.78em">${p.name}</span>
        <span style="font-family:var(--fm);font-size:.75em;color:${p.stock === 0 ? 'var(--rose)' : '#fbb923'};font-weight:700">${p.stock === 0 ? 'OUT' : p.stock + ' left'}</span>
      </div>`).join('')}
    </div>`;
  }
  html += `<div class="tbl-wrap"><table><thead><tr>
    <th>Name</th><th>Price</th><th>Stock</th><th>Unit</th><th>Cat.</th><th>Barcode</th><th>VAT</th>
    ${currentUser.role === 'admin' ? '<th>Branch</th>' : ''}
    <th></th>
   </tr></thead><tbody>`;

  products.forEach(p => {
    const branchName = p.branchId ? (DB.getById('branches', p.branchId) || { name: '?' }).name : '🌐 Global';
    const vatLabel = p.vatExempt ? '<span style="color:var(--blue);font-size:.72em">VE</span>' : (p.zeroRated ? '<span style="color:var(--emerald);font-size:.72em">0%</span>' : '<span style="color:var(--text2);font-size:.72em">VAT</span>');
    html += `<tr>
      <td><strong style="color:var(--text)">${p.name}</strong></td>
      <td style="color:var(--gold);font-family:var(--fm)">${fc(p.price)}</td>
      <td class="${p.stock <= lowStockThresh ? 'stock-low' : ''}">${p.stock}</td>
      <td style="font-size:.75em">${p.unit || 'pcs'}</td>
      <td>${p.category || '—'}</td>
      <td style="font-family:var(--fm);font-size:.7em">${p.barcode || '—'}</td>
      <td>${vatLabel}</td>
      ${currentUser.role === 'admin' ? `<td style="font-size:.72em">${branchName}</td>` : ''}
      <td style="white-space:nowrap">
        <button class="btn bs bxs" onclick="adjStock(${p.id})">+</button>
        <button class="btn bw bxs" onclick="showProductModal(${p.id})">✎</button>
        <button class="btn bd bxs" onclick="deleteProduct(${p.id})">🗑</button>
      </td>
    </tr>`;
  });
  html += `</tbody></table></div>${!products.length ? '<div class="empty-st"><div class="ei">📦</div><p>No products yet</p></div>' : ''}`;
  el.innerHTML = html;

  window.showProductModal = (id) => showProductModal(id);
  window.adjStock = (id) => adjStock(id);
  window.deleteProduct = (id) => deleteProduct(id);
}

function showProductModal(id = null) {
  const p = id ? DB.getById('products', id) : null;
  const suppliers = safeArray(DB.getAll('suppliers'));
  const cv = p ? (p.vatExempt ? 'exempt' : (p.zeroRated ? 'zero' : 'vat')) : 'vat';
  const branchSelect = currentUser.role === 'admin' ? `<label class="inp-label">Branch</label><select id="miBranch"><option value="">🌐 All Branches (Global)</option>${safeArray(DB.getAll('branches')).map(b => `<option value="${b.id}" ${p && p.branchId === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}</select>` : '';
  openModal(`<h4>${p ? 'Edit' : 'Add'} Product</h4>
    <label class="inp-label">Product Name *</label><input type="text" id="mi1" value="${p ? p.name : ''}" placeholder="e.g. White Rice">
    <label class="inp-label">Selling Price *</label><input type="number" id="mi2" value="${p ? p.price : ''}" step="0.01" placeholder="0.00">
    <label class="inp-label">Cost Price</label><input type="number" id="mi3" value="${p ? p.cost || 0 : 0}" step="0.01" placeholder="0.00">
    <label class="inp-label">Stock Quantity</label><input type="number" id="mi4" value="${p ? p.stock : 0}" placeholder="0">
    <label class="inp-label">Category</label><input type="text" id="mi5" value="${p ? p.category || '' : 'General'}" placeholder="General">
    <label class="inp-label">Barcode</label><input type="text" id="mi6" value="${p ? p.barcode || '' : ''}" placeholder="e.g. 123456789">
    <label class="inp-label">Unit of Measure</label><input type="text" id="mi7" value="${p ? p.unit || 'pcs' : 'pcs'}" placeholder="pcs / kg / box">
    ${branchSelect}
    <label class="inp-label">VAT Classification</label>
    <select id="miVat"><option value="vat" ${cv === 'vat' ? 'selected' : ''}>VAT (12%)</option><option value="exempt" ${cv === 'exempt' ? 'selected' : ''}>VAT-Exempt</option><option value="zero" ${cv === 'zero' ? 'selected' : ''}>Zero-Rated</option></select>
    <label class="inp-label">Supplier</label>
    <select id="miSup"><option value="">No Supplier</option>${suppliers.map(s => `<option value="${s.id}" ${p && p.supplierId === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}</select>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">
      <button class="btn bd" onclick="closeModal()">Cancel</button>
      <button class="btn bp" onclick="saveProduct(${id || 'null'})">Save Product</button>
    </div>`);
}

function saveProduct(id) {
  const name = document.getElementById('mi1').value.trim();
  const price = parseFloat(document.getElementById('mi2').value);
  if (!name || isNaN(price)) { toast('Name and price are required', 'rose'); return; }
  const vt = document.getElementById('miVat')?.value || 'vat';
  const branchEl = document.getElementById('miBranch');
  const branchId = branchEl ? (branchEl.value ? parseInt(branchEl.value) : null) : currentUser.branchId;
  const data = {
    name, price,
    cost: parseFloat(document.getElementById('mi3').value) || 0,
    stock: parseInt(document.getElementById('mi4').value) || 0,
    category: document.getElementById('mi5').value || 'General',
    barcode: document.getElementById('mi6').value || '',
    unit: document.getElementById('mi7').value || 'pcs',
    vatExempt: vt === 'exempt',
    zeroRated: vt === 'zero',
    supplierId: document.getElementById('miSup').value ? parseInt(document.getElementById('miSup').value) : null,
    active: true,
    branchId
  };
  if (id) {
    const p = DB.getById('products', id);
    if (p) { Object.assign(p, data); DB.update('products', p); }
  } else {
    data.sku = 'SKU' + Date.now();
    DB.add('products', data);
  }
  closeModal();
  sw(currentUser.role === 'admin' ? 'allProducts' : 'inventory');
  toast('Product saved ✓', 'emerald');
}

async function adjStock(id) {
  const p = DB.getById('products', id);
  if (!p) return;
  const val = await prompt2(`Update stock for "${p.name}" (current: ${p.stock}):`, String(p.stock), String(p.stock), 'number');
  const qty = parseInt(val);
  if (isNaN(qty)) return;
  p.stock = Math.max(0, qty);
  DB.update('products', p);
  sw(currentUser.role === 'admin' ? 'allProducts' : 'inventory');
  toast('Stock updated ✓', 'emerald');
}

async function deleteProduct(id) {
  const ok = await confirm2('Delete this product? This cannot be undone.', '📦', true);
  if (ok) { DB.delete('products', id); sw(currentUser.role === 'admin' ? 'allProducts' : 'inventory'); }
}

// --- Suppliers ---
export function renderSuppliers(el) {
  let suppliers = DB.getAll('suppliers');
  suppliers = safeArray(suppliers);
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><h4 style="margin:0">Suppliers</h4><button class="btn bp bsm" onclick="showSupplierModal()">+ Add</button></div>
  ${suppliers.map(s => `<div class="card"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><strong>${s.name}</strong>${s.contact ? `<p>👤 ${s.contact}</p>` : ''}${s.phone ? `<p>📞 ${s.phone}</p>` : ''}</div><div><button class="btn bw bxs" onclick="showSupplierModal(${s.id})">✎</button><button class="btn bd bxs" onclick="deleteSupplier(${s.id})">🗑</button></div></div></div>`).join('')}
  ${!suppliers.length ? '<div class="empty-st"><div class="ei">🚚</div><p>No suppliers yet</p></div>' : ''}`;
  window.showSupplierModal = (id) => showSupplierModal(id);
  window.deleteSupplier = (id) => deleteSupplier(id);
}

function showSupplierModal(id = null) {
  const s = id ? DB.getById('suppliers', id) : null;
  openModal(`<h4>${s ? 'Edit' : 'Add'} Supplier</h4>
    <label>Name *</label><input id="mi1" value="${s ? s.name : ''}">
    <label>Contact</label><input id="mi2" value="${s ? s.contact || '' : ''}">
    <label>Phone</label><input id="mi3" value="${s ? s.phone || '' : ''}">
    <label>Email</label><input id="mi4" value="${s ? s.email || '' : ''}">
    <label>Address</label><input id="mi5" value="${s ? s.address || '' : ''}">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px"><button class="btn bd" onclick="closeModal()">Cancel</button><button class="btn bp" onclick="saveSupplier(${id || 'null'})">Save</button></div>`);
}

function saveSupplier(id) {
  const name = document.getElementById('mi1').value.trim();
  if (!name) { toast('Name required', 'rose'); return; }
  const data = { name, contact: document.getElementById('mi2').value, phone: document.getElementById('mi3').value, email: document.getElementById('mi4').value, address: document.getElementById('mi5').value };
  if (id) { const s = DB.getById('suppliers', id); if (s) { Object.assign(s, data); DB.update('suppliers', s); } }
  else DB.add('suppliers', data);
  closeModal(); sw('suppliers'); toast('Saved ✓', 'emerald');
}

async function deleteSupplier(id) {
  const ok = await confirm2('Delete this supplier?', '🚚', true);
  if (ok) { DB.delete('suppliers', id); sw('suppliers'); }
}

// --- Purchase Orders ---
export function renderPOs(el) {
  let pos = DB.getAll('purchaseOrders');
  pos = safeArray(pos);
  if (currentUser.role !== 'admin') pos = pos.filter(po => po.branchId === currentUser.branchId);
  const suppliers = safeArray(DB.getAll('suppliers'));
  const statusColors = { draft: 'var(--text2)', ordered: 'var(--gold)', received: 'var(--emerald)' };
  el.innerHTML = `<div><h4>Purchase Orders</h4><button class="btn bp" onclick="showPOModal()">+ New PO</button></div>
  ${pos.slice().reverse().map(po => {
    const sup = suppliers.find(s => s.id === po.supplierId);
    return `<div class="card"><div><strong>PO #${po.id}</strong><p>${sup ? sup.name : 'N/A'} · ${po.date || po.createdAt?.split('T')[0]}</p><p>${(po.items || []).length} items</p></div><div><div>${fc(po.total || 0)}</div><div style="color:${statusColors[po.status]}">${po.status || 'draft'}</div></div><div>${po.status !== 'received' ? `<button onclick="receivePO(${po.id})">✓ Receive</button>` : ''}<button onclick="deletePO(${po.id})">🗑</button></div></div>`;
  }).join('')}
  ${!pos.length ? '<div>No purchase orders</div>' : ''}`;
  window.showPOModal = showPOModal;
  window.receivePO = receivePO;
  window.deletePO = deletePO;
}

function showPOModal() {
  const suppliers = safeArray(DB.getAll('suppliers'));
  openModal(`<h4>New PO</h4><select id="poSup"><option value="">Select Supplier</option>${suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select>
    <label>Item Name</label><input id="poName"><label>Quantity</label><input id="poQty" type="number" value="1"><label>Cost</label><input id="poCost" type="number" step="0.01">
    <div><button class="btn bd" onclick="closeModal()">Cancel</button><button class="btn bp" onclick="savePO()">Create</button></div>`);
}

function savePO() {
  const supplierId = parseInt(document.getElementById('poSup').value) || null;
  const name = document.getElementById('poName').value;
  const qty = parseInt(document.getElementById('poQty').value) || 0;
  const cost = parseFloat(document.getElementById('poCost').value) || 0;
  if (!name || qty <= 0) { toast('Invalid item', 'rose'); return; }
  const items = [{ name, quantity: qty, cost, total: qty * cost, productId: null }];
  const matched = safeArray(DB.getAll('products')).find(p => p.name.toLowerCase() === name.toLowerCase());
  if (matched) items[0].productId = matched.id;
  const total = items.reduce((s, i) => s + i.total, 0);
  DB.add('purchaseOrders', { supplierId, items, total, status: 'ordered', date: new Date().toISOString().split('T')[0], branchId: currentUser.branchId });
  closeModal(); sw('purchaseOrders'); toast('PO created ✓', 'emerald');
}

async function receivePO(id) {
  const po = DB.getById('purchaseOrders', id);
  if (!po) return;
  const ok = await confirm2('Mark as received? Stock will be added.', '📦');
  if (!ok) return;
  po.status = 'received';
  DB.update('purchaseOrders', po);
  for (const item of po.items || []) {
    let prod = item.productId ? DB.getById('products', item.productId) : null;
    if (!prod) prod = safeArray(DB.getAll('products')).find(p => p.name.toLowerCase() === item.name.toLowerCase());
    if (prod) { prod.stock += item.quantity; prod.cost = item.cost; DB.update('products', prod); }
    else toast(`⚠️ Product "${item.name}" not found`, 'rose', 5000);
  }
  logAct('PO Received', '#' + id);
  sw('purchaseOrders');
  toast('PO received – stock updated ✓', 'emerald');
}

async function deletePO(id) {
  const ok = await confirm2('Delete this PO?', '📋', true);
  if (ok) { DB.delete('purchaseOrders', id); sw('purchaseOrders'); }
}
