// js/features/bir.js
import { DB } from '../core/db.js';
import { currentUser } from '../core/auth.js';
import { toast, confirm2, fc, getSetting, saveSetting, logAct, taxRate } from '../core/utils.js';
import { openModal, closeModal } from '../ui/modal.js';
import { sw } from '../ui/render.js';

// Helper to always get array
function safeArray(data) {
  return Array.isArray(data) ? data : [];
}

export function getBIR() {
  return {
    tin: getSetting('bir_tin', '000-000-000-000'),
    name: getSetting('bir_name', 'MLEA Store'),
    address: getSetting('bir_address', 'Registered Address'),
    accNo: getSetting('bir_accno', 'FP082010-033-2019-0'),
    accDate: getSetting('bir_accdate', '2019-01-01'),
    accExp: getSetting('bir_accexp', '2024-12-31'),
    ptu: getSetting('bir_ptu', 'PTU-000000'),
    prefix: getSetting('bir_prefix', 'OR'),
    serFrom: getSetting('bir_serfrom', '0000001'),
    serTo: getSetting('bir_serto', '9999999'),
    vatType: getSetting('bir_vattype', 'vat'),
    docType: getSetting('bir_doctype', 'or'),
  };
}

export function getGAT() {
  return parseFloat(getSetting('bir_gat', '0')) || 0;
}

export function updateGAT(amount) {
  const current = getGAT();
  const newGAT = current + amount;
  saveSetting('bir_gat', newGAT.toFixed(2));
  return newGAT;
}

function getLocalNextOR() {
  const bir = getBIR();
  let counter = parseInt(getSetting('bir_counter', '0')) || 0;
  counter++;
  saveSetting('bir_counter', counter.toString());
  const to = parseInt(bir.serTo) || 9999999;
  if (counter >= to - 50) toast(`⚠️ OR series almost exhausted! ${to - counter} receipts remaining`, 'rose', 6000);
  return `${bir.prefix}-${String(counter).padStart(7, '0')}`;
}

let _fbFunctions = null;
export function initBIRFunctions(functionsRef) { _fbFunctions = functionsRef; }

export async function getNextOR() {
  if (_fbFunctions && window.isOnline) {
    try {
      const bir = getBIR();
      const fn = _fbFunctions.httpsCallable(_fbFunctions.functions, 'getNextORNumber');
      const result = await fn({ prefix: bir.prefix, seriesTo: bir.serTo });
      const { orNumber, counter, remaining, nearingEnd } = result.data;
      if (nearingEnd) toast(`⚠️ OR series almost exhausted! ${remaining} receipts remaining`, 'rose', 7000);
      saveSetting('bir_counter', String(counter));
      return orNumber;
    } catch (e) {
      console.warn('Cloud OR failed', e);
    }
  }
  return getLocalNextOR();
}

export function computeVAT(total, vatType, rate, items = null) {
  if (vatType !== 'vat') return { vatableSales: 0, vatAmount: 0, vatExempt: total, zeroRated: 0, grandTotal: total };
  if (items && items.length) {
    let vatableAmt = 0, exemptAmt = 0, zeroAmt = 0;
    items.forEach(i => {
      const lineNet = i.price * i.quantity;
      if (i.zeroRated) zeroAmt += lineNet;
      else if (i.vatExempt) exemptAmt += lineNet;
      else vatableAmt += lineNet;
    });
    const vatableSalesNet = vatableAmt / (1 + rate);
    const vatAmount = vatableAmt - vatableSalesNet;
    return { vatableSales: vatableSalesNet, vatAmount, vatExempt: exemptAmt, zeroRated: zeroAmt, grandTotal: vatableSalesNet + vatAmount + exemptAmt + zeroAmt };
  }
  const vs = total / (1 + rate);
  return { vatableSales: vs, vatAmount: total - vs, vatExempt: 0, zeroRated: 0, grandTotal: total };
}

export function getDayData(date) {
  date = date || new Date().toISOString().split('T')[0];
  const allSales = safeArray(DB.getAll('sales'));
  const sales = allSales.filter(s => s.date === date && !s.voided);
  const voided = allSales.filter(s => s.date === date && s.voided);
  return {
    sales, voided,
    total: sales.reduce((a, s) => a + s.total, 0),
    vat: sales.reduce((a, s) => a + (s.tax || 0), 0),
    vs: sales.reduce((a, s) => a + (s.vatableSales || 0), 0),
    ve: sales.reduce((a, s) => a + (s.vatExemptSales || 0), 0),
    cash: sales.filter(s => s.paymentMethod === 'cash').reduce((a, s) => a + s.total, 0),
    card: sales.filter(s => s.paymentMethod === 'card').reduce((a, s) => a + s.total, 0),
    split: sales.filter(s => s.paymentMethod === 'split').reduce((a, s) => a + s.total, 0),
    sc: sales.filter(s => s.discountType === 'sc').reduce((a, s) => a + (s.discountAmount || 0), 0),
    pwd: sales.filter(s => s.discountType === 'pwd').reduce((a, s) => a + (s.discountAmount || 0), 0),
    promo: sales.filter(s => s.discountType === 'promo').reduce((a, s) => a + (s.discountAmount || 0), 0),
  };
}

export function printXZ(type) {
  const today = new Date().toISOString().split('T')[0];
  const d = getDayData(today);
  const bir = getBIR();
  const gat = getGAT();
  const firstOR = d.sales.length ? d.sales[0].orNumber : '—';
  const lastOR = d.sales.length ? d.sales[d.sales.length - 1].orNumber : '—';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @page{margin:8mm;size:80mm auto}*{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Courier New',Courier,monospace;font-size:10px;width:76mm;color:#000;background:#fff}
    .c{text-align:center}.b{font-weight:bold}.dv{border:none;border-top:1px dashed #000;margin:4px 0}
    .rw{display:flex;justify-content:space-between;margin:2px 0}
    </style></head><body>
    <div class="c b" style="font-size:13px">${bir.name}</div>
    <div class="c">${bir.address}</div><div class="c">TIN: ${bir.tin}</div>
    <hr class="dv"><div class="c b" style="font-size:12px">${type === 'x' ? 'X - READING REPORT' : 'Z - READING REPORT'}</div>
    <div class="c">${type === 'x' ? '(NON-RESET)' : '(END OF DAY)'}</div>
    <div class="c">${today} ${new Date().toLocaleTimeString('en-PH')}</div><hr class="dv">
    ${type === 'z' ? `<div class="rw"><span>Beginning OR</span><span>${firstOR}</span></div><div class="rw"><span>Ending OR</span><span>${lastOR}</span></div>` : ''}
    <div class="rw"><span>Transactions</span><span>${d.sales.length}</span></div>
    <div class="rw"><span>Voided</span><span>${d.voided.length}</span></div><hr class="dv">
    <div class="b">SALES</div>
    <div class="rw"><span>VATable Sales</span><span>${fc(d.vs)}</span></div>
    <div class="rw"><span>VAT Amount (12%)</span><span>${fc(d.vat)}</span></div>
    <div class="rw"><span>VAT-Exempt</span><span>${fc(d.ve)}</span></div>
    <hr class="dv"><div class="rw b"><span>GROSS TOTAL</span><span>${fc(d.total)}</span></div><hr class="dv">
    <div class="b">DISCOUNTS</div>
    <div class="rw"><span>SC</span><span>${fc(d.sc)}</span></div>
    <div class="rw"><span>PWD</span><span>${fc(d.pwd)}</span></div>
    <div class="rw"><span>Promo</span><span>${fc(d.promo)}</span></div><hr class="dv">
    <div class="b">PAYMENTS</div>
    <div class="rw"><span>Cash</span><span>${fc(d.cash)}</span></div>
    <div class="rw"><span>Card</span><span>${fc(d.card)}</span></div>
    <div class="rw"><span>Split</span><span>${fc(d.split)}</span></div><hr class="dv">
    <div class="rw b"><span>GRAND ACCUM. TOTAL</span><span>${fc(gat)}</span></div><hr class="dv">
    <div class="c" style="font-size:8px">PTU: ${bir.ptu}<br>Accred: ${bir.accNo}<br>MLEA POS</div>
    <div style="height:8mm"></div></body></html>`;
  const frame = document.getElementById('printFrame');
  const doc = frame.contentDocument || frame.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); }, 350);
}

let lastSaleGlobal = null;
export function setLastSale(sale) { lastSaleGlobal = sale; }

export async function printRcpt(type) {
  if (!lastSaleGlobal) { toast('No sale data', 'rose'); return; }
  const sale = lastSaleGlobal;
  const bir = getBIR();
  // Simplified for brevity – add your full receipt HTML here
  toast('Print function ready', 'gold');
}

export function renderBIRSetup(el) {
  if (currentUser.role !== 'admin') { el.innerHTML = '<div>Admin only</div>'; return; }
  const bir = getBIR();
  el.innerHTML = `<div><h4>BIR Setup</h4><label>Business Name</label><input id="birName" value="${bir.name}"><button onclick="saveBIR()">Save</button></div>`;
  window.saveBIR = () => {
    saveSetting('bir_name', document.getElementById('birName').value);
    toast('Saved', 'emerald');
  };
}

export function renderSalesBook(el) { el.innerHTML = '<div>Sales Book</div>'; }
export function render2550M(el) { el.innerHTML = '<div>Form 2550M</div>'; }
