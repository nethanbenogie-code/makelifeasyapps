import { DB } from '../core/db.js';
import { currentUser } from '../core/auth.js';
import { toast, confirm2, prompt2, fc, getSetting, saveSetting, logAct } from '../core/utils.js';
import { getBIR, computeVAT, getNextOR, updateGAT, getGAT, printRcpt } from './bir.js'; // BIR helpers (defined in bir.js)
import { openModal, closeModal } from '../ui/modal.js';
import { sw } from '../ui/render.js';

// Global cart state for this module
let cart = [];
let discAmt = 0;
let discType = 'none';
let held = [];
let selCat = 'All';
let lastSale = null;
let activeCustomer = null;

// Load held sales on init
function loadHeld() {
  held = DB.getAll('heldSales') || [];
}

// --- Cart helpers ---
function addToCart(sku) {
  if (!sku) return;
  const products = DB.getAll('products');
  const p = products.find(p => (p.sku === sku || p.barcode === sku) && p.active);
  if (p && p.stock > 0) {
    const existing = cart.find(i => i.sku === p.sku);
    if (existing) existing.quantity++;
    else cart.push({ ...p, quantity: 1, origPrice: p.price, discPct: 0 });
    renderPOS(document.getElementById('mainContent'));
  } else {
    toast(p ? `Out of stock: ${p.name}` : 'Product not found', 'rose');
  }
}

function removeFromCart(idx) {
  cart.splice(idx, 1);
  if (!cart.length) { discAmt = 0; discType = 'none'; }
  renderPOS(document.getElementById('mainContent'));
}

function clearCart() {
  if (!cart.length) return;
  confirm2('Clear the entire cart?', '🗑️').then(ok => {
    if (ok) { cart = []; discAmt = 0; discType = 'none'; renderPOS(document.getElementById('mainContent')); }
  });
}

function updateCartQty(idx, delta) {
  if (cart[idx]) {
    cart[idx].quantity = Math.max(1, cart[idx].quantity + delta);
    renderPOS(document.getElementById('mainContent'));
  }
}

function setCartQty(idx, val) {
  if (cart[idx]) {
    cart[idx].quantity = Math.max(1, parseInt(val) || 1);
    renderPOS(document.getElementById('mainContent'));
  }
}

function applyItemDiscount(idx) {
  prompt2(`Discount % for "${cart[idx].name}":`, '0', '0', 'number').then(v => {
    const pct = parseFloat(v) || 0;
    if (pct > 0 && pct <= 100) {
      cart[idx].price = parseFloat((cart[idx].origPrice * (1 - pct / 100)).toFixed(2));
      cart[idx].discPct = pct;
      renderPOS(document.getElementById('mainContent'));
    }
  });
}

function applyDiscount(type) {
  const sub = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
  if (type === 'sc' || type === 'pwd') {
    discType = type;
    discAmt = sub * 0.20;
  } else if (type === 'promo') {
    prompt2('Enter promo discount %:', '0', '0', 'number').then(v => {
      const pct = parseFloat(v) || 0;
      discType = 'promo';
      discAmt = sub * (pct / 100);
      renderPOS(document.getElementById('mainContent'));
    });
    return;
  } else {
    discType = 'none';
    discAmt = 0;
  }
  renderPOS(document.getElementById('mainContent'));
}

// Held sales
function holdSale() {
  if (!cart.length) { toast('Cart is empty', 'rose'); return; }
  prompt2('Hold sale note (optional):', 'e.g. Table 3').then(note => {
    const h = {
      id: Date.now(),
      items: JSON.parse(JSON.stringify(cart)),
      discAmt,
      discType,
      note: note || '',
      heldAt: new Date().toISOString(),
      cashierName: currentUser.name
    };
    DB.add('heldSales', h);
    held = DB.getAll('heldSales');
    cart = [];
    discAmt = 0;
    discType = 'none';
    renderPOS(document.getElementById('mainContent'));
    toast('Sale held ✓', 'gold');
  });
}

function resumeHeld(id) {
  const h = DB.getById('heldSales', id);
  if (!h) return;
  cart = JSON.parse(JSON.stringify(h.items));
  discAmt = h.discAmt || 0;
  discType = h.discType || 'none';
  DB.delete('heldSales', id);
  held = DB.getAll('heldSales');
  closeModal();
  renderPOS(document.getElementById('mainContent'));
}

function showHeldList() {
  held = DB.getAll('heldSales');
  openModal(`<h4>⏸ Held Sales (${held.length})</h4>
    ${!held.length ? '<div class="empty-st"><div class="ei">📋</div><p>No held sales</p></div>' :
      held.map(h => `<div class="held-card">
        <div><div style="font-size:.85em;font-weight:600;color:var(--text)">${h.note || 'Sale ' + h.id}</div>
        <div style="font-size:.72em;color:var(--text2);margin-top:2px">${h.items.length} items · ${h.cashierName} · ${new Date(h.heldAt).toLocaleTimeString()}</div>
        <div style="font-size:.78em;color:var(--gold);margin-top:2px">${fc(h.items.reduce((a,i)=>a+i.price*i.quantity,0))}</div></div>
        <div style="display:flex;gap:6px">
          <button class="btn bs bxs" onclick="resumeHeld(${h.id})">Resume</button>
          <button class="btn bd bxs" onclick="deleteHeld(${h.id})">🗑</button>
        </div>
      </div>`).join('')}
    <button class="btn bd bbl" onclick="closeModal()" style="margin-top:8px">Close</button>`);
  // Attach global functions for buttons (expose to window)
  window.resumeHeld = resumeHeld;
  window.deleteHeld = (id) => { DB.delete('heldSales', id); showHeldList(); };
}

// Quick cash buttons
function quickCash(total) {
  const bills = [20, 50, 100, 200, 500, 1000];
  const seen = new Set();
  const out = [];
  bills.forEach(b => { if (b >= total && out.length < 4 && !seen.has(b)) { seen.add(b); out.push(b); } });
  if (!out.length) {
    const c = Math.ceil(total / 100) * 100;
    if (!seen.has(c)) { seen.add(c); out.push(c); }
  }
  const next = Math.ceil(total / 50) * 50;
  if (!seen.has(next) && out.length < 4) { seen.add(next); out.push(next); }
  return out.sort((a, b) => a - b).slice(0, 4);
}

function updateChangeDisplay(total) {
  const cashInput = document.getElementById('cashInput');
  const cash = parseFloat(cashInput?.value) || 0;
  const chgDiv = document.getElementById('chgDisp');
  const chgAmt = document.getElementById('chgAmt');
  const insufMsg = document.getElementById('insufMsg');
  if (!chgDiv) return;
  if (cash >= total) {
    chgDiv.style.display = 'block';
    if (chgAmt) chgAmt.textContent = fc(cash - total);
    if (insufMsg) insufMsg.style.display = 'none';
  } else {
    chgDiv.style.display = 'none';
    if (insufMsg) insufMsg.style.display = 'block';
  }
}

// Payment finalisation
function finalizePay(method, cashTendered, secondAmt = 0) {
  if (!cart.length) { toast('Cart is empty', 'rose'); return; }
  const bir = getBIR();
  const subBD = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
  const effDisc = Math.min(discAmt, subBD);
  const sub = subBD - effDisc;
  const discRatio = subBD > 0 ? (sub / subBD) : 1;
  const scaledItems = cart.map(i => ({ ...i, price: i.price * discRatio }));
  const vatD = computeVAT(sub, bir.vatType, taxRate, scaledItems);
  const total = vatD.grandTotal;

  let changeGiven = 0, splitCard = 0, actualCash = cashTendered;
  if (method === 'split') {
    splitCard = secondAmt;
    changeGiven = Math.max(0, cashTendered + splitCard - total);
  } else if (method === 'cash') {
    changeGiven = secondAmt; // secondAmt = change
  } else {
    actualCash = 0;
    changeGiven = 0;
  }

  const orNum = getNextOR(); // uses cloud function or local fallback
  const branchObj = currentUser.branchId ? DB.getById('branches', currentUser.branchId) : null;
  const gat = updateGAT(total);

  const sale = {
    date: new Date().toISOString().split('T')[0],
    timestamp: new Date().toISOString(),
    total,
    subtotal: sub,
    subtotalBeforeDiscount: subBD,
    discountAmount: effDisc,
    discountType: discType,
    tax: vatD.vatAmount,
    vatableSales: vatD.vatableSales,
    vatExemptSales: vatD.vatExempt,
    zeroRatedSales: vatD.zeroRated,
    paymentMethod: method,
    cashTendered: actualCash,
    changeGiven,
    splitCard,
    cashierId: currentUser.id,
    cashierName: currentUser.name,
    branchId: currentUser.branchId,
    branchName: branchObj ? branchObj.name : 'HQ',
    currency: cur,
    orNumber: orNum,
    vatType: bir.vatType,
    docType: bir.docType,
    grandAccumulatedTotal: gat,
    voided: false,
    items: cart.map(i => ({
      productId: i.id,
      name: i.name,
      quantity: i.quantity,
      price: i.price,
      cost: i.cost || 0,
      unit: i.unit || 'pcs',
      vatExempt: i.vatExempt || false,
      zeroRated: i.zeroRated || false
    }))
  };

  const saleId = DB.add('sales', sale);
  // Deduct stock
  cart.forEach(item => {
    const p = DB.getById('products', item.id);
    if (p) {
      p.stock -= item.quantity;
      DB.update('products', p);
    }
  });
  logAct('Sale', orNum + ': ' + fc(total));
  lastSale = { ...sale, id: saleId };
  // Award loyalty points if customer attached
  if (activeCustomer) {
    const pts = Math.floor(sale.total);
    const cust = DB.getById('customers', activeCustomer.id);
    if (cust) { cust.points = (cust.points || 0) + pts; DB.update('customers', cust); }
    toast(`⭐ ${pts} loyalty points awarded to ${activeCustomer.name}`, 'purple', 3000);
    sale.customerId = activeCustomer.id;
    sale.customerName = activeCustomer.name;
    activeCustomer = null;
  }
  // Reset cart
  cart = [];
  discAmt = 0;
  discType = 'none';
  showSaleComplete(saleId, total, method, orNum, actualCash, changeGiven, splitCard);
}

function doPay(method) {
  if (!cart.length) { toast('Cart is empty', 'rose'); return; }
  const bir = getBIR();
  const subBD = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
  const effDisc = Math.min(discAmt, subBD);
  const sub = subBD - effDisc;
  const discRatio = subBD > 0 ? (sub / subBD) : 1;
  const scaledItems = cart.map(i => ({ ...i, price: i.price * discRatio }));
  const vatD = computeVAT(sub, bir.vatType, taxRate, scaledItems);
  const total = vatD.grandTotal;

  if (method === 'cash') {
    const cashInput = document.getElementById('cashInput');
    const cash = parseFloat(cashInput?.value) || 0;
    if (cash <= 0) { toast('Enter cash amount tendered', 'rose'); return; }
    if (cash < total) { toast(`Cash (${fc(cash)}) is less than total (${fc(total)})`, 'rose'); return; }
    finalizePay('cash', cash, cash - total);
  } else if (method === 'card') {
    finalizePay('card', total, 0);
  }
}

function showSplitPay(total) {
  openModal(`<h4>⚡ Split Payment</h4>
    <p style="font-size:.8em;color:var(--text2);margin-bottom:16px">Total: <strong style="color:var(--gold)">${fc(total)}</strong><br><span style="font-size:.9em">Enter cash — card auto-fills. Or edit card directly.</span></p>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <label style="font-size:.75em;color:var(--text2);min-width:60px">💵 Cash</label>
      <input type="number" id="splitCash" placeholder="0.00" step="0.01" style="margin-bottom:0"
        oninput="const c=parseFloat(this.value)||0;const rem=Math.max(0,${total}-c);document.getElementById('splitCard').value=rem.toFixed(2);document.getElementById('splitRemain').textContent=rem<=0?'✓ Covered':'Remaining: '+rem.toFixed(2)">
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <label style="font-size:.75em;color:var(--text2);min-width:60px">💳 Card</label>
      <input type="number" id="splitCard" placeholder="0.00" step="0.01" style="margin-bottom:0"
        oninput="const c=parseFloat(document.getElementById('splitCash').value)||0;const card=parseFloat(this.value)||0;const rem=${total}-(c+card);document.getElementById('splitRemain').textContent=rem<=0.01?'✓ Covered':'Remaining: '+rem.toFixed(2)">
    </div>
    <div id="splitRemain" style="font-size:.76em;color:var(--text2);text-align:center;margin-bottom:14px;font-family:var(--ff);font-weight:600">Enter amounts above</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <button class="btn bd" onclick="closeModal()">Cancel</button>
      <button class="btn bp" onclick="confirmSplit(${total})">✓ Confirm</button>
    </div>`);
  window.confirmSplit = (total) => {
    const cash = parseFloat(document.getElementById('splitCash')?.value) || 0;
    const card = parseFloat(document.getElementById('splitCard')?.value) || 0;
    if (cash + card < total - 0.01) { toast('Amounts do not cover total', 'rose'); return; }
    closeModal();
    finalizePay('split', cash, card);
  };
}

function showSaleComplete(saleId, total, method, orNum, cashTendered, changeGiven, splitCard) {
  const printModeSetting = getSetting('printMode', 'ask');
  if (printModeSetting === 'thermal') {
    showSaleToast(total, method, orNum, cashTendered, changeGiven);
    setTimeout(() => printRcpt('thermal'), 300);
    setTimeout(() => sw('dashboard'), 900);
    return;
  }
  if (printModeSetting === 'a4') {
    showSaleToast(total, method, orNum, cashTendered, changeGiven);
    setTimeout(() => printRcpt('a4'), 300);
    setTimeout(() => sw('dashboard'), 900);
    return;
  }
  if (printModeSetting === 'none') {
    showSaleToast(total, method, orNum, cashTendered, changeGiven);
    setTimeout(() => sw('dashboard'), 2600);
    return;
  }
  // Default: ask with modal
  openModal(`
    <div class="sale-done">
      <div class="chk">✓</div>
      <h3>Sale Complete</h3>
      <div class="amt">${fc(total)}</div>
      <small style="color:var(--text2)">${orNum} · ${method.toUpperCase()}</small>
    </div>
    ${(method === 'cash' || method === 'split') ? `
    <div style="margin:16px 0;background:var(--bg-elevated);border-radius:var(--r2);overflow:hidden">
      <div style="display:flex;justify-content:space-between;padding:11px 16px;border-bottom:1px solid rgba(255,255,255,.06)"><span style="font-size:.82em;color:var(--text2)">Total Due</span><span style="font-family:var(--fm);font-weight:600">${fc(total)}</span></div>
      ${method === 'split' ? `
      <div style="display:flex;justify-content:space-between;padding:11px 16px;border-bottom:1px solid rgba(255,255,255,.06)"><span style="font-size:.82em;color:var(--text2)">💵 Cash</span><span style="font-family:var(--fm);color:var(--gold)">${fc(cashTendered)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:11px 16px;border-bottom:1px solid rgba(255,255,255,.06)"><span style="font-size:.82em;color:var(--text2)">💳 Card</span><span style="font-family:var(--fm);color:var(--blue)">${fc(splitCard)}</span></div>` :
      `<div style="display:flex;justify-content:space-between;padding:11px 16px;border-bottom:1px solid rgba(255,255,255,.06)"><span style="font-size:.82em;color:var(--text2)">Cash Tendered</span><span style="font-family:var(--fm);color:var(--gold)">${fc(cashTendered)}</span></div>`}
      <div style="display:flex;justify-content:space-between;padding:14px 16px"><span style="font-family:var(--ff);font-weight:700">Change</span><span style="font-family:var(--ff);font-size:1.5em;font-weight:800;color:var(--emerald)">${fc(changeGiven)}</span></div>
    </div>` : '<div style="height:10px"></div>'}
    <p style="text-align:center;font-size:.78em;color:var(--text2);margin-bottom:14px;font-family:var(--ff);letter-spacing:.04em;text-transform:uppercase">Print Receipt</p>
    <div class="print-grid">
      <button class="print-btn" onclick="printRcpt('thermal');closeModal();sw('dashboard')"><span class="pico">🧾</span>Thermal<br><span style="font-size:.7em;color:var(--text2)">58/80mm</span></button>
      <button class="print-btn" onclick="printRcpt('a4');closeModal();sw('dashboard')"><span class="pico">📄</span>A4<br><span style="font-size:.7em;color:var(--text2)">Full page</span></button>
      <button class="print-btn" onclick="closeModal();sw('dashboard')" style="border-color:rgba(240,101,119,.25);color:var(--rose)"><span class="pico">✕</span>No Print</button>
    </div>`);
  // Expose printRcpt globally for modal buttons
  window.printRcpt = printRcpt;
}

function showSaleToast(total, method, orNum, cashTendered, changeGiven) {
  const existing = document.getElementById('saleToast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.id = 'saleToast';
  t.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-elevated);border:2px solid var(--emerald);border-radius:var(--r4);padding:28px 32px;z-index:9999;text-align:center;box-shadow:0 12px 50px rgba(0,0,0,.6);animation:popIn .35s cubic-bezier(.22,1,.36,1);min-width:240px';
  t.innerHTML = `<div style="width:56px;height:56px;background:var(--emerald-soft);border:2px solid var(--emerald);border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:24px">✓</div>
    <div style="font-family:var(--ff);color:var(--emerald);font-size:1em;font-weight:700;margin-bottom:4px">Sale Complete</div>
    <div style="font-family:var(--ff);font-size:1.6em;font-weight:800;color:var(--text);letter-spacing:-.03em">${fc(total)}</div>
    <div style="font-size:.72em;color:var(--text2);margin-top:4px">${orNum} · ${method.toUpperCase()}</div>
    ${(method === 'cash' || method === 'split') ? `<div style="margin-top:14px;border-top:1px solid rgba(255,255,255,.08);padding-top:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="font-size:.78em;color:var(--text2)">Cash</span><span style="font-family:var(--fm);font-size:.82em;color:var(--gold)">${fc(cashTendered)}</span></div>
      <div style="display:flex;justify-content:space-between"><span style="font-family:var(--ff);font-weight:700;font-size:.9em">Change</span><span style="font-family:var(--ff);font-size:1.3em;font-weight:800;color:var(--emerald)">${fc(changeGiven)}</span></div>
    </div>` : ''}`;
  document.body.appendChild(t);
  setTimeout(() => {
    if (t.parentElement) { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); }
  }, 3500);
}

// --- Main render function ---
export function renderPOS(el) {
  loadHeld();
  const search = document.getElementById('posSearch')?.value || '';
  let products = DB.getAll('products').filter(p => p.active);
  const categories = ['All', ...new Set(products.map(p => p.category || 'General'))];
  if (selCat !== 'All') products = products.filter(p => (p.category || 'General') === selCat);
  if (search) products = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || '').toLowerCase().includes(search.toLowerCase()) || (p.barcode || '').includes(search));

  const subBD = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
  const effDisc = Math.min(discAmt, subBD);
  const sub = subBD - effDisc;
  const discRatio = subBD > 0 ? (sub / subBD) : 1;
  const scaledItems = cart.map(i => ({ ...i, price: i.price * discRatio }));
  const bir = getBIR();
  const vatD = computeVAT(sub, bir.vatType, taxRate, scaledItems);
  const total = vatD.grandTotal;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <h4 style="margin:0">POS Terminal</h4>
      <div style="display:flex;gap:6px;align-items:center">
        ${held.length ? `<button class="btn bw bxs" onclick="showHeldList()">⏸ ${held.length}</button>` : ''}
        <span class="bir-badge">🏛️ ${bir.vatType === 'vat' ? 'VAT' : 'Non-VAT'}</span>
      </div>
    </div>
    <div class="scan-wrap"><input type="text" id="scanInput" placeholder="Scan barcode or SKU…" onkeypress="if(event.key==='Enter'){addToCart(event.target.value.trim());event.target.value=''}"></div>
    <div class="scan-hint">⚡ Scanner Ready</div>
    <div class="pos-search" style="margin-top:8px"><input type="text" id="posSearch" placeholder="Search products by name or SKU…" oninput="renderPOS(document.getElementById('mainContent'))"></div>
    <div class="cat-row">${categories.map(c => `<div class="cat-btn ${selCat === c ? 'on' : ''}" onclick="selCat='${c}';renderPOS(document.getElementById('mainContent'))">${c}</div>`).join('')}</div>
    <div class="prod-grid">${products.slice(0, 12).map(p => `
      <div class="prod-card ${p.stock <= 0 ? 'oos' : ''}" onclick="${p.stock > 0 ? `addToCart('${p.sku}')` : ''}" >
        <strong>${p.name}</strong>
        <div class="pc-price">${fc(p.price)}</div>
        <small>${p.unit || 'pcs'} · ${p.stock <= 0 ? '🚫 Out of stock' : 'Stock: ' + p.stock}${p.vatExempt ? ' [VE]' : ''}${p.zeroRated ? ' [0%]' : ''}</small>
      </div>`).join('') || '<div style="grid-column:span 2;text-align:center;padding:20px;color:var(--text3);font-size:.82em">No products found</div>'}
    </div>
    <div class="card" style="margin-top:4px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <h4 style="margin-bottom:0">Cart <span style="font-size:.7em;color:var(--text2);font-weight:400">${cart.length} item${cart.length !== 1 ? 's' : ''}</span></h4>
        <div style="display:flex;gap:6px">
          <button class="btn bpu bxs" onclick="holdSale()">⏸ Hold</button>
          <button class="btn bd bxs" onclick="clearCart()">🗑 Clear</button>
        </div>
      </div>
      ${cart.map((item, i) => `
        <div class="cart-item">
          <div style="flex:1;min-width:0">
            <div style="font-size:.85em;font-weight:500">${item.name}${item.vatExempt ? '<span style="font-size:.6em;color:var(--blue);margin-left:4px">VE</span>' : ''}${item.zeroRated ? '<span style="font-size:.6em;color:var(--emerald);margin-left:4px">0%</span>' : ''}</div>
            <div style="font-size:.72em;color:var(--text2)">${fc(item.price)} / ${item.unit || 'pcs'}${item.discPct ? ` <span style="color:var(--emerald)">-${item.discPct}%</span>` : ''}</div>
          </div>
          <div class="qty-ctl">
            <button class="qb" onclick="updateCartQty(${i},-1)">−</button>
            <input class="qv" type="number" value="${item.quantity}" min="1" onchange="setCartQty(${i},this.value)" onclick="this.select()">
            <button class="qb" onclick="updateCartQty(${i},1)">+</button>
          </div>
          <div style="font-family:var(--ff);color:var(--gold);font-weight:700;font-size:.9em;margin-left:8px;min-width:60px;text-align:right">${fc(item.price * item.quantity)}</div>
          <div style="display:flex;flex-direction:column;gap:3px;margin-left:6px">
            <button class="btn bw bxs" onclick="applyItemDiscount(${i})" title="Item discount">%</button>
            <button class="btn bd bxs" onclick="removeFromCart(${i})">✕</button>
          </div>
        </div>`).join('') || '<div class="empty-st" style="padding:25px 10px"><div class="ei">🛒</div><p>Cart is empty</p></div>'}
      ${cart.length ? `
        <div class="divider"></div>
        <div style="margin-bottom:10px">
          <div style="font-size:.68em;color:var(--text2);font-family:var(--ff);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">BIR Discount</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${['sc', 'pwd', 'promo'].map(t => `<button onclick="applyDiscount('${t}')" style="padding:5px 10px;border-radius:8px;border:1px solid ${discType === t ? 'var(--gold)' : 'var(--border)'};background:${discType === t ? 'var(--gold-soft)' : 'var(--bg-glass)'};color:${discType === t ? 'var(--gold)' : 'var(--text2)'};cursor:pointer;font-size:.7em;font-weight:600;font-family:var(--ff)">${t === 'sc' ? '👴 SC (20%)' : t === 'pwd' ? '♿ PWD (20%)' : '🏷️ Promo'}</button>`).join('')}
            ${discType !== 'none' ? `<button onclick="applyDiscount('none')" style="padding:5px 10px;border-radius:8px;border:1px solid var(--rose);background:var(--rose-soft);color:var(--rose);cursor:pointer;font-size:.7em;font-weight:600;font-family:var(--ff)">✕ Remove</button>` : ''}
          </div>
        </div>
        <div class="divider"></div>
        <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="color:var(--text2);font-size:.82em">Subtotal</span><span>${fc(subBD)}</span></div>
        ${effDisc > 0 ? `<div style="display:flex;justify-content:space-between;padding:3px 0"><span style="color:var(--emerald);font-size:.82em">${discType === 'sc' ? '👴 SC' : discType === 'pwd' ? '♿ PWD' : '🏷️ Promo'} Discount</span><span style="color:var(--emerald)">-${fc(effDisc)}</span></div>` : ''}
        ${bir.vatType === 'vat' ? `
        <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="color:var(--text2);font-size:.82em">VATable Sales</span><span style="font-size:.82em">${fc(vatD.vatableSales)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="color:var(--text2);font-size:.82em">VAT (12%)</span><span style="font-size:.82em">${fc(vatD.vatAmount)}</span></div>` : `
        <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="color:var(--text2);font-size:.82em">VAT-Exempt</span><span style="font-size:.82em">${fc(sub)}</span></div>`}
        <div style="display:flex;justify-content:space-between;padding:12px 0 10px;border-top:1px solid var(--border);margin-top:6px">
          <span style="font-family:var(--ff);font-weight:700;font-size:1.05em">TOTAL</span>
          <span style="font-family:var(--ff);font-size:1.4em;font-weight:800;color:var(--gold)">${fc(total)}</span>
        </div>
        <div style="margin-bottom:12px">
          <div style="font-size:.72em;color:var(--text2);font-family:var(--ff);letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">Cash Tendered</div>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="number" id="cashInput" placeholder="0.00" step="0.01" min="0" style="margin-bottom:0;font-family:var(--fm);font-size:1.05em;text-align:right;border-color:var(--emerald)" oninput="updateChangeDisplay(${total})" onkeypress="if(event.key==='Enter')doPay('cash')">
            <button class="btn bs bsm" style="white-space:nowrap;flex-shrink:0" onclick="document.getElementById('cashInput').value=${total.toFixed(2)};updateChangeDisplay(${total})">Exact</button>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px">
            ${quickCash(total).map(a => `<button onclick="document.getElementById('cashInput').value=${a};updateChangeDisplay(${total})" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:5px 10px;cursor:pointer;color:var(--text);font-family:var(--fm);font-size:.75em;transition:all .15s" onmouseover="this.style.borderColor='var(--emerald)'" onmouseout="this.style.borderColor='var(--border)'">${fc(a)}</button>`).join('')}
          </div>
          <div id="chgDisp" style="margin-top:10px;padding:10px 14px;border-radius:var(--r2);background:var(--bg-elevated);border:1px solid var(--emerald);display:none">
            <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:.78em;color:var(--text2)">Change</span><span id="chgAmt" style="font-family:var(--ff);font-size:1.4em;font-weight:800;color:var(--emerald)">0.00</span></div>
          </div>
          <div id="insufMsg" style="margin-top:6px;font-size:.75em;color:var(--rose);font-weight:600;display:none">⚠ Insufficient amount</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <button class="btn bs" onclick="doPay('cash')">💵 Cash</button>
          <button class="btn bp" onclick="doPay('card')">💳 Card</button>
          <button class="btn bpu" onclick="showSplitPay(${total})">⚡ Split</button>
        </div>` : ''}
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin:6px 0 10px">
      ${activeCustomer ? `<span class="cust-chip" onclick="selectCustomerForSale()">👤 ${activeCustomer.name}${activeCustomer.points ? ' · ⭐' + activeCustomer.points + 'pts' : ''}</span><button class="btn bd bxs" onclick="attachCustomer(null)">✕</button>` : `<button class="btn bb bxs" onclick="selectCustomerForSale()">👤 Add Customer</button>`}
    </div>`;

  // Attach global functions for inline handlers
  window.addToCart = addToCart;
  window.removeFromCart = removeFromCart;
  window.clearCart = clearCart;
  window.updateCartQty = updateCartQty;
  window.setCartQty = setCartQty;
  window.applyItemDiscount = applyItemDiscount;
  window.applyDiscount = applyDiscount;
  window.holdSale = holdSale;
  window.showHeldList = showHeldList;
  window.doPay = doPay;
  window.updateChangeDisplay = updateChangeDisplay;
  window.showSplitPay = showSplitPay;
  window.selCat = selCat;
  window.renderPOS = renderPOS;
  window.selectCustomerForSale = () => {
    // Load customers and open selection modal
    const customers = DB.getAll('customers');
    openModal(`<h4>👤 Select Customer</h4>
      <div class="pos-search" style="margin-bottom:10px"><input type="text" id="custSrch" placeholder="Search by name or phone…" oninput="filterCustomerList()"></div>
      <div id="custList" style="max-height:300px;overflow-y:auto">
        ${customers.map(c => `<div class="card" style="cursor:pointer;margin:6px 0;padding:12px" onclick="attachCustomer(${c.id})">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><strong style="font-family:var(--ff)">${c.name}</strong>${c.phone ? `<span style="font-size:.75em;color:var(--text2);margin-left:8px">${c.phone}</span>` : ''}
            <div style="margin-top:4px"><span class="loyalty-pts">⭐ ${c.points || 0} pts</span>${c.scPwd ? ' <span class="rbadge rb-admin" style="font-size:.6em">SC/PWD</span>' : ''}</div>
            </div>
            <span style="color:var(--gold);font-size:1.2em">→</span>
          </div>
        </div>`).join('') || '<div class="empty-st" style="padding:20px"><div class="ei">👤</div><p>No customers</p></div>'}
      </div>
      ${activeCustomer ? `<button class="btn bd bbl" onclick="attachCustomer(null)" style="margin-top:8px">✕ Remove Customer</button>` : ''}
      <button class="btn bw bbl" onclick="closeModal();showCustomerModal()" style="margin-top:0">+ Add New Customer</button>
      <button class="btn bd bbl" onclick="closeModal()" style="margin-top:0">Cancel</button>`);
    window.filterCustomerList = () => {
      const q = document.getElementById('custSrch')?.value?.toLowerCase() || '';
      const filtered = DB.getAll('customers').filter(c => !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q));
      const list = document.getElementById('custList');
      if (!list) return;
      list.innerHTML = filtered.map(c => `<div class="card" style="cursor:pointer;margin:6px 0;padding:12px" onclick="attachCustomer(${c.id})">
        <strong style="font-family:var(--ff)">${c.name}</strong>${c.phone ? `<span style="font-size:.75em;color:var(--text2);margin-left:8px">${c.phone}</span>` : ''}
        <div style="margin-top:4px"><span class="loyalty-pts">⭐ ${c.points || 0} pts</span>${c.scPwd ? ' <span class="rbadge rb-admin" style="font-size:.6em">SC/PWD</span>' : ''}</div>
      </div>`).join('') || '<p style="text-align:center;color:var(--text3);padding:16px;font-size:.82em">No customers found</p>';
    };
    window.attachCustomer = (id) => {
      closeModal();
      if (!id) { activeCustomer = null; renderPOS(document.getElementById('mainContent')); return; }
      activeCustomer = DB.getById('customers', id);
      if (activeCustomer?.scPwd && discType === 'none') {
        const sub = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
        discType = 'sc';
        discAmt = sub * 0.20;
        toast(`👴 SC/PWD discount applied for ${activeCustomer.name}`, 'gold');
      }
      renderPOS(document.getElementById('mainContent'));
    };
    window.showCustomerModal = () => {
      // Reuse the customer modal from customers.js – we'll import later, but for now a simple version
      openModal(`<h4>Add Customer</h4><label class="inp-label">Full Name *</label><input type="text" id="custName"><label class="inp-label">Phone</label><input type="tel" id="custPhone"><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px"><button class="btn bd" onclick="closeModal()">Cancel</button><button class="btn bp" onclick="saveSimpleCustomer()">Save</button></div>`);
      window.saveSimpleCustomer = () => {
        const name = document.getElementById('custName')?.value.trim();
        if (!name) { toast('Name required', 'rose'); return; }
        const newCust = { name, phone: document.getElementById('custPhone')?.value || '', points: 0, scPwd: false };
        DB.add('customers', newCust);
        closeModal();
        toast('Customer added', 'emerald');
        selectCustomerForSale(); // reopen list
      };
    };
  };
  // Focus scanner
  setTimeout(() => { const si = document.getElementById('scanInput'); if (si) si.focus(); }, 100);
}