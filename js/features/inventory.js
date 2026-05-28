import { DB } from '../core/db.js';
import { currentUser } from '../core/auth.js';
import { toast, confirm2, prompt2, fc, getSetting, saveSetting, logAct } from '../core/utils.js';
import { openModal, closeModal } from '../ui/modal.js';
import { sw } from '../ui/render.js';

let lowStockThresh = getSetting('lowStockThresh', 10);

// --- Products ---
export function renderProducts(el) {
  const products = (currentUser.role === 'admin' ? DB.getAll('products') : DB.getByBranch('products', currentUser.branchId)).filter(p => p.active);
  const lowItems = products.filter(p => p.stock <= lowStockThresh);
  const suppliers = DB.getAll('suppliers');

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

  // Attach global functions for inline buttons
  window.showProductModal = (id) => showProductModal(id);
  window.adjStock = (id) => adjStock(id);
  window.deleteProduct = (id) => deleteProduct(id);
}

function showProductModal(id = null) {
  const p = id ? DB.getById('products', id) : null;
  const suppliers = DB.getAll('suppliers');
  const cv = p ? (p.vatExempt ? 'exempt' : (p.zeroRated ? 'zero' : 'vat')) : 'vat';
  const branchSelect = currentUser.role === 'admin' ? `<label class="inp-label">Branch</label><select id="miBranch"><option value="">🌐 All Branches (Global)</option>${DB.getAll('branches').map(b => `<option value="${b.id}" ${p && p.branchId === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}</select>` : '';
  openModal(`<h4>${p ? 'Edit' : 'Add'} Product</h4>
    <label class="inp-label">Product Name *</label><input type="text" id="mi1" value="${p ? p.name : ''}" placeholder="e.g. White Rice">
    <label class="inp-label">Selling Price *</label><input type="number" id="mi2" value="${p ? p.price : ''}" step="0.01" placeholder="0.00">
    <label class="inp-label">Cost Price</label><input type="number" id="mi3" value="${p ? p.cost || 0 : 0}" step="0.01" placeholder="0.00">
    <label class="inp-label">Stock Quantity</label><input type="number" id="mi4" value="${p ? p.stock : 0}" placeholder="0">
    <label class="inp-label">Category</label><input type="text" id="mi5" value="${p ? p.category || '' : 'General'}" placeholder="General">
    <label class="inp-label">Barcode (for scanner)</label><input type="text" id="mi6" value="${p ? p.barcode || '' : ''}" placeholder="e.g. 123456789">
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
    name,
    price,
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
  const suppliers = DB.getAll('suppliers');
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><h4 style="margin:0">Suppliers</h4><button class="btn bp bsm" onclick="showSupplierModal()">+ Add</button></div>
  ${suppliers.map(s => `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><strong style="font-family:var(--ff)">${s.name}</strong>
      ${s.contact ? `<p style="font-size:.78em;color:var(--text2);margin-top:3px">👤 ${s.contact}</p>` : ''}
      ${s.phone ? `<p style="font-size:.75em;color:var(--text2)">📞 ${s.phone}</p>` : ''}
      ${s.email ? `<p style="font-size:.72em;color:var(--text2)">✉ ${s.email}</p>` : ''}</div>
      <div style="display:flex;gap:6px">
        <button class="btn bw bxs" onclick="showSupplierModal(${s.id})">✎</button>
        <button class="btn bd bxs" onclick="deleteSupplier(${s.id})">🗑</button>
      </div>
    </div>
  </div>`).join('')}
  ${!suppliers.length ? '<div class="empty-st"><div class="ei">🚚</div><p>No suppliers yet</p></div>' : ''}`;
  window.showSupplierModal = (id) => showSupplierModal(id);
  window.deleteSupplier = (id) => deleteSupplier(id);
}

function showSupplierModal(id = null) {
  const s = id ? DB.getById('suppliers', id) : null;
  openModal(`<h4>${s ? 'Edit' : 'Add'} Supplier</h4>
    <label class="inp-label">Supplier Name *</label><input type="text" id="mi1" value="${s ? s.name : ''}" placeholder="e.g. ABC Trading">
    <label class="inp-label">Contact Person</label><input type="text" id="mi2" value="${s ? s.contact || '' : ''}" placeholder="e.g. Maria Santos">
    <label class="inp-label">Phone</label><input type="tel" id="mi3" value="${s ? s.phone || '' : ''}" placeholder="555-0001">
    <label class="inp-label">Email</label><input type="email" id="mi4" value="${s ? s.email || '' : ''}" placeholder="supplier@email.com">
    <label class="inp-label">Address</label><input type="text" id="mi5" value="${s ? s.address || '' : ''}" placeholder="123 Supplier St">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">
      <button class="btn bd" onclick="closeModal()">Cancel</button>
      <button class="btn bp" onclick="saveSupplier(${id || 'null'})">Save</button>
    </div>`);
}

function saveSupplier(id) {
  const name = document.getElementById('mi1').value.trim();
  if (!name) { toast('Name required', 'rose'); return; }
  const data = {
    name,
    contact: document.getElementById('mi2').value || '',
    phone: document.getElementById('mi3').value || '',
    email: document.getElementById('mi4').value || '',
    address: document.getElementById('mi5').value || ''
  };
  if (id) {
    const s = DB.getById('suppliers', id);
    if (s) { Object.assign(s, data); DB.update('suppliers', s); }
  } else {
    DB.add('suppliers', data);
  }
  closeModal();
  sw('suppliers');
  toast('Saved ✓', 'emerald');
}

async function deleteSupplier(id) {
  const ok = await confirm2('Delete this supplier?', '🚚', true);
  if (ok) { DB.delete('suppliers', id); sw('suppliers'); }
}

// --- Purchase Orders ---
export function renderPOs(el) {
  const pos = currentUser.role === 'admin' ? DB.getAll('purchaseOrders') : DB.getByBranch('purchaseOrders', currentUser.branchId);
  const suppliers = DB.getAll('suppliers');
  const statusColors = { draft: 'var(--text2)', ordered: 'var(--gold)', received: 'var(--emerald)' };
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><h4 style="margin:0">Purchase Orders</h4><button class="btn bp bsm" onclick="showPOModal()">+ New PO</button></div>
  ${pos.slice().reverse().map(po => {
    const sup = suppliers.find(sp => sp.id === po.supplierId);
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div><strong style="font-family:var(--ff)">PO #${po.id}</strong>
        <p style="font-size:.76em;color:var(--text2);margin-top:3px">${sup ? sup.name : 'N/A'} · ${po.date || po.createdAt?.split('T')[0]}</p>
        <p style="font-size:.72em;margin-top:2px">${(po.items || []).length} items</p></div>
        <div style="text-align:right">
          <div style="font-family:var(--ff);color:var(--gold);font-weight:700">${fc(po.total || 0)}</div>
          <div style="font-size:.7em;color:${statusColors[po.status] || 'var(--text2)'};font-weight:600;text-transform:uppercase">${po.status || 'draft'}</div>
        </div>
      </div>
      <div style="margin-top:10px;display:flex;gap:6px">
        ${po.status !== 'received' ? `<button class="btn bs bxs" onclick="receivePO(${po.id})">✓ Receive</button>` : ''}
        <button class="btn bd bxs" onclick="deletePO(${po.id})">🗑</button>
      </div>
    </div>`;
  }).join('')}
  ${!pos.length ? '<div class="empty-st"><div class="ei">📋</div><p>No purchase orders</p></div>' : ''}`;
  window.showPOModal = showPOModal;
  window.receivePO = receivePO;
  window.deletePO = deletePO;
}

function showPOModal() {
  const suppliers = DB.getAll('suppliers');
  openModal(`<h4>New Purchase Order</h4>
    <label class="inp-label">Supplier</label>
    <select id="mi0"><option value="">Select Supplier</option>${suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select>
    <label class="inp-label">Item Name</label><input type="text" id="mi1" placeholder="e.g. Rice 50kg">
    <label class="inp-label">Quantity</label><input type="number" id="mi2" value="1" min="1">
    <label class="inp-label">Cost per Unit</label><input type="number" id="mi3" step="0.01" placeholder="0.00">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">
      <button class="btn bd" onclick="closeModal()">Cancel</button>
      <button class="btn bp" onclick="savePO()">Create Order</button>
    </div>`);
}

function savePO() {
  const supplierId = parseInt(document.getElementById('mi0').value) || null;
  const name = document.getElementById('mi1').value;
  const qty = parseInt(document.getElementById('mi2').value) || 0;
  const cost = parseFloat(document.getElementById('mi3').value) || 0;
  if (!name || qty <= 0) { toast('Item name and quantity required', 'rose'); return; }
  const items = [{ name, quantity: qty, cost, total: qty * cost, productId: null }];
  const matchedProd = DB.getAll('products').find(p => p.name.toLowerCase() === name.toLowerCase());
  if (matchedProd) items[0].productId = matchedProd.id;
  const total = items.reduce((s, i) => s + i.total, 0);
  DB.add('purchaseOrders', {
    supplierId,
    items,
    total,
    status: 'ordered',
    date: new Date().toISOString().split('T')[0],
    branchId: currentUser.branchId
  });
  closeModal();
  sw('purchaseOrders');
  toast('Purchase order created ✓', 'emerald');
}

async function receivePO(id) {
  const po = DB.getById('purchaseOrders', id);
  if (!po) return;
  const ok = await confirm2('Mark PO #' + id + ' as received? This will add stock to matching products.', '📦');
  if (!ok) return;
  po.status = 'received';
  DB.update('purchaseOrders', po);
  for (const item of po.items || []) {
    let product = item.productId ? DB.getById('products', item.productId) : null;
    if (!product) product = DB.getAll('products').find(p => p.name.toLowerCase() === item.name.toLowerCase());
    if (product) {
      product.stock += item.quantity;
      product.cost = item.cost;
      DB.update('products', product);
    } else {
      toast(`⚠️ Product not found for PO item: ${item.name}`, 'rose', 5000);
    }
  }
  logAct('PO Received', '#' + id);
  sw('purchaseOrders');
  toast('PO received — stock updated ✓', 'emerald');
}

async function deletePO(id) {
  const ok = await confirm2('Delete this purchase order?', '📋', true);
  if (ok) { DB.delete('purchaseOrders', id); sw('purchaseOrders'); }
}