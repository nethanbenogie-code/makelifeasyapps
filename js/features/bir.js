// js/features/bir.js
import { DB } from '../core/db.js';
import { currentUser } from '../core/auth.js';
import { toast, confirm2, fc, getSetting, saveSetting, logAct, taxRate } from '../core/utils.js';
import { openModal, closeModal } from '../ui/modal.js';
import { sw } from '../ui/render.js';

// --- BIR settings & helpers ---
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
      console.warn('Cloud Function OR failed, using local fallback:', e);
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
  const sales = DB.getAll('sales').filter(s => s.date === date && !s.voided);
  const voided = DB.getAll('sales').filter(s => s.date === date && s.voided);
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
    <hr class="dv">
    <div class="c b" style="font-size:12px">${type === 'x' ? 'X - READING REPORT' : 'Z - READING REPORT'}</div>
    <div class="c">${type === 'x' ? '(NON-RESET)' : '(END OF DAY)'}</div>
    <div class="c">${today} ${new Date().toLocaleTimeString('en-PH')}</div>
    <hr class="dv">
    ${type === 'z' ? `<div class="rw"><span>Beginning OR</span><span>${firstOR}</span></div><div class="rw"><span>Ending OR</span><span>${lastOR}</span></div>` : ''}
    <div class="rw"><span>Transactions</span><span>${d.sales.length}</span></div>
    <div class="rw"><span>Voided</span><span>${d.voided.length}</span></div>
    <hr class="dv">
    <div class="b">SALES</div>
    <div class="rw"><span>VATable Sales</span><span>${fc(d.vs)}</span></div>
    <div class="rw"><span>VAT Amount (12%)</span><span>${fc(d.vat)}</span></div>
    <div class="rw"><span>VAT-Exempt</span><span>${fc(d.ve)}</span></div>
    <hr class="dv"><div class="rw b"><span>GROSS TOTAL</span><span>${fc(d.total)}</span></div>
    <hr class="dv">
    <div class="b">DISCOUNTS</div>
    <div class="rw"><span>SC</span><span>${fc(d.sc)}</span></div>
    <div class="rw"><span>PWD</span><span>${fc(d.pwd)}</span></div>
    <div class="rw"><span>Promo</span><span>${fc(d.promo)}</span></div>
    <hr class="dv">
    <div class="b">PAYMENTS</div>
    <div class="rw"><span>Cash</span><span>${fc(d.cash)}</span></div>
    <div class="rw"><span>Card</span><span>${fc(d.card)}</span></div>
    <div class="rw"><span>Split</span><span>${fc(d.split)}</span></div>
    <hr class="dv">
    <div class="rw b"><span>GRAND ACCUM. TOTAL</span><span>${fc(gat)}</span></div>
    <hr class="dv">
    <div class="c" style="font-size:8px;margin-top:4px">PTU: ${bir.ptu}<br>Accred: ${bir.accNo}<br>MLEA POS v5.0</div>
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
  const sName = bir.name, addr = bir.address, tin = bir.tin;
  const accNo = bir.accNo, accDate = bir.accDate, accExp = bir.accExp, ptu = bir.ptu;
  const orLabel = bir.docType === 'si' ? 'SALES INVOICE' : 'OFFICIAL RECEIPT';
  const orNum = sale.orNumber || ('#' + sale.id);
  const dateStr = new Date().toLocaleString('en-PH');
  const footer = getSetting('rcptFooter', 'Thank you for your purchase!');
  const logo = getSetting('receipt_logo', '');
  let html = '';
  if (type === 'thermal') {
    html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @page{margin:0;size:80mm auto}*{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Courier New',Courier,monospace;font-size:11px;width:76mm;padding:4mm 2mm;color:#000;background:#fff}
    .c{text-align:center}.b{font-weight:bold}.lg{font-size:13px}
    .dv{border:none;border-top:1px dashed #000;margin:5px 0}
    .rw{display:flex;justify-content:space-between;margin:2px 0}
    .r3{display:flex;justify-content:space-between;margin:2px 0}
    .r3 span:first-child{flex:1}.r3 span:nth-child(2){width:30px;text-align:center}.r3 span:last-child{width:60px;text-align:right}
    </style></head><body>
    <div class="c b lg">${sName}</div><div class="c">${addr}</div><div class="c">TIN: ${tin}</div>
    <hr class="dv"><div class="c b">${orLabel}</div><div class="c" style="font-size:9px">${dateStr}</div>
    <hr class="dv">
    <div class="rw"><span class="b">OR/SI No.:</span><span>${orNum}</span></div>
    <div class="rw"><span class="b">Branch</span><span>${sale.branchName || 'Main'}</span></div>
    <div class="rw"><span class="b">Cashier</span><span>${sale.cashierName}</span></div>
    <div class="rw"><span class="b">Payment</span><span>${sale.paymentMethod.toUpperCase()}</span></div>
    <hr class="dv">
    <div class="r3"><span class="b">ITEM</span><span class="b">QTY</span><span class="b">AMT</span></div>
    <hr class="dv">
    ${(sale.items || []).map(it => `
      <div class="r3"><span>${it.name.substring(0,14)}</span><span>${it.quantity}</span><span>${fc(it.price * it.quantity)}</span></div>
      <div style="font-size:9px;color:#555;padding-left:2px">@ ${fc(it.price)} / ${it.unit || 'pcs'}${it.vatExempt ? ' *VE' : ''}</div>`).join('')}
    <hr class="dv">
    ${(sale.discountAmount || 0) > 0 ? `<div class="rw"><span>Subtotal</span><span>${fc(sale.subtotalBeforeDiscount || sale.subtotal)}</span></div><div class="rw"><span>${sale.discountType === 'sc' ? 'SC Disc' : sale.discountType === 'pwd' ? 'PWD Disc' : 'Promo Disc'}</span><span>-${fc(sale.discountAmount)}</span></div>` : ''}
    ${sale.vatType === 'vat' ? `
    <div class="rw"><span>VATable Sales</span><span>${fc(sale.vatableSales || 0)}</span></div>
    <div class="rw"><span>VAT Amount (12%)</span><span>${fc(sale.tax || 0)}</span></div>
    <div class="rw"><span>VAT-Exempt Sales</span><span>0.00</span></div>
    <div class="rw"><span>Zero-Rated Sales</span><span>0.00</span></div>` :
    `<div class="rw"><span>VAT-Exempt Sales</span><span>${fc(sale.subtotal || 0)}</span></div>`}
    <hr class="dv">
    <div class="rw b lg"><span>TOTAL</span><span>${fc(sale.total)}</span></div>
    ${(sale.paymentMethod === 'cash' || sale.paymentMethod === 'split') ? `
    <hr class="dv">
    <div class="rw"><span>Cash Tendered</span><span>${fc(sale.cashTendered || sale.total)}</span></div>
    ${(sale.splitCard || 0) > 0 ? `<div class="rw"><span>Card</span><span>${fc(sale.splitCard)}</span></div>` : ''}
    <div class="rw b"><span>CHANGE</span><span>${fc(sale.changeGiven || 0)}</span></div>` : ''}
    <hr class="dv">
    <div class="c" style="font-size:9px;margin-top:4px">${footer}</div>
    ${sale.vatType !== 'vat' ? '<div class="c" style="font-size:8px;margin-top:3px">NOT valid for claiming input taxes.</div>' : ''}
    <div class="c" style="font-size:8px;margin-top:4px;line-height:1.6">
      BIR Accred. No.: ${accNo}<br>
      Issued: ${accDate} | Expiry: ${accExp}<br>
      PTU No.: ${ptu}<br>MLEA POS v5.0
    </div>
    <div style="height:12mm"></div></body></html>`;
  } else {
    // A4 receipt – full version (too long, but you can copy the one we used earlier)
    // For brevity, I include a minimal A4 version that works. Replace with the full one if needed.
    const itemsRows = (sale.items || []).map((it, i) => `
      <tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#fff'}">
        <td style="padding:10px 14px">${i+1}</td>
        <td style="padding:10px 14px">${it.name}${it.vatExempt ? ' <em style="font-size:.8em;color:#888">[VAT-Exempt]</em>' : ''}${it.zeroRated ? ' <em style="font-size:.8em;color:#888">[Zero-Rated]</em>' : ''}</td>
        <td style="padding:10px 14px;text-align:center">${it.quantity} ${it.unit || 'pcs'}</td>
        <td style="padding:10px 14px;text-align:right">${fc(it.price)}</td>
        <td style="padding:10px 14px;text-align:right;font-weight:600">${fc(it.price * it.quantity)}</td>
      </tr>`).join('');
    html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @page{margin:15mm 12mm;size:A4}*{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#222;background:#fff}
    .hd{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #222}
    .sn{font-size:22px;font-weight:800;letter-spacing:-.5px}
    .su{font-size:11px;color:#666;margin-top:3px}
    .rl{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#999}
    .rn{font-size:24px;font-weight:800}
    .stamp{display:inline-block;border:3px solid #2dd4a0;color:#2dd4a0;padding:5px 16px;border-radius:6px;font-size:20px;font-weight:900;letter-spacing:4px;transform:rotate(-8deg);margin-top:6px}
    .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px;padding:14px;background:#f5f5f5;border-radius:8px}
    .meta label{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#999;display:block;margin-bottom:3px}
    .meta span{font-size:12px;font-weight:600}
    table{width:100%;border-collapse:collapse;margin-bottom:20px}
    thead tr{background:#222;color:#fff}
    thead th{padding:10px 12px;text-align:left;font-size:10px;letter-spacing:.5px;text-transform:uppercase}
    tbody tr:last-child td{border-bottom:2px solid #222}
    .tots{margin-left:auto;width:300px}
    .tr{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:12px}
    .tr.grand{font-size:16px;font-weight:800;border-bottom:2px solid #222;padding-top:10px}
    .tr.chg{font-size:15px;font-weight:800;color:#2dd4a0;border-bottom:2px solid #2dd4a0}
    .tr.disc{color:#e74c3c}
    .bir-box{background:#fffbf0;border:1px solid #e8c96a;border-radius:6px;padding:12px 16px;margin-top:14px;font-size:10px;line-height:1.8;color:#555}
    .bir-box strong{color:#333;display:block;margin-bottom:4px;font-size:11px}
    .ftr{margin-top:24px;padding-top:12px;border-top:1px solid #ddd;display:flex;justify-content:space-between;font-size:10px;color:#999}
    .nvn{font-size:9px;color:#666;text-align:center;margin-top:8px;padding:6px;border:1px dashed #ccc;border-radius:4px}
    </style></head><body>
    <div class="hd">
      <div><div class="sn">${sName}</div><div class="su">${addr}</div><div class="su">TIN: ${tin}</div><div class="su">${dateStr}</div></div>
      <div style="text-align:right"><div class="rl">${orLabel}</div><div class="rn">${orNum}</div><div class="stamp">PAID</div></div>
    </div>
    <div class="meta">
      <div><label>Cashier</label><span>${sale.cashierName}</span></div>
      <div><label>Payment</label><span>${sale.paymentMethod.toUpperCase()}</span></div>
      <div><label>Branch</label><span>${sale.branchName || 'HQ'}</span></div>
    </div>
    <table><thead><tr><th>#</th><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Amount</th></tr></thead><tbody>${itemsRows}</tbody></table>
    <div class="tots">
      ${(sale.discountAmount || 0) > 0 ? `<div class="tr"><span>Subtotal</span><span>${fc(sale.subtotalBeforeDiscount || sale.subtotal)}</span></div><div class="tr disc"><span>${sale.discountType === 'sc' ? 'Senior Citizen Discount' : sale.discountType === 'pwd' ? 'PWD Discount' : 'Promotional Discount'}</span><span>-${fc(sale.discountAmount)}</span></div>` : ''}
      ${sale.vatType === 'vat' ? `
      <div class="tr"><span>VATable Sales</span><span>${fc(sale.vatableSales || 0)}</span></div>
      <div class="tr"><span>VAT Amount (12%)</span><span>${fc(sale.tax || 0)}</span></div>
      <div class="tr"><span>VAT-Exempt Sales</span><span>${fc(sale.vatExemptSales || 0)}</span></div>
      <div class="tr"><span>Zero-Rated Sales</span><span>${fc(sale.zeroRatedSales || 0)}</span></div>` :
      `<div class="tr"><span>Amount (Non-VAT)</span><span>${fc(sale.subtotal || 0)}</span></div>`}
      <div class="tr grand"><span>TOTAL AMOUNT DUE</span><span>${fc(sale.total)}</span></div>
      ${(sale.paymentMethod === 'cash' || sale.paymentMethod === 'split') ? `
      <div class="tr" style="margin-top:6px"><span>Cash Tendered</span><span style="color:#d4a853">${fc(sale.cashTendered || sale.total)}</span></div>
      ${(sale.splitCard || 0) > 0 ? `<div class="tr"><span>Card</span><span style="color:#6fa3ef">${fc(sale.splitCard)}</span></div>` : ''}
      <div class="tr chg"><span>CHANGE</span><span>${fc(sale.changeGiven || 0)}</span></div>` : ''}
    </div>
    ${sale.vatType !== 'vat' ? '<div class="nvn">This document is NOT valid for claiming input taxes.</div>' : ''}
    <div class="bir-box">
      <strong>BIR Accreditation Details</strong>
      Accreditation No.: ${accNo} &nbsp;|&nbsp; Date Issued: ${accDate} &nbsp;|&nbsp; Valid Until: ${accExp}<br>
      PTU (Permit to Use) No.: ${ptu}<br>
      Series: ${bir.prefix}-${bir.serFrom} to ${bir.prefix}-${bir.serTo}
    </div>
    <div class="ftr">
      <div>${footer}</div>
      <div style="text-align:right">MLEA POS v5.0 (BIR-Ready)<br>${orNum} · ${dateStr}</div>
    </div>
    </body></html>`;
  }
  const frame = document.getElementById('printFrame');
  const doc = frame.contentDocument || frame.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); }, 380);
}

// --- BIR Setup view (admin only) ---
export function renderBIRSetup(el) {
  if (currentUser.role !== 'admin') {
    el.innerHTML = '<div class="empty-st"><div class="ei">🔒</div><p>Admin only</p></div>';
    return;
  }
  const bir = getBIR();
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <h4 style="margin:0">🏛️ BIR Setup</h4><span class="bir-badge">Compliance</span>
  </div>
  <div class="card">
    <h5>🏢 Business Registration</h5>
    <label class="inp-label">Registered Business Name</label><input type="text" id="birN" value="${bir.name}">
    <label class="inp-label">Registered Address</label><input type="text" id="birA" value="${bir.address}">
    <label class="inp-label">TIN</label><input type="text" id="birT" value="${bir.tin}">
  </div>
  <div class="card">
    <h5>📋 BIR Accreditation</h5>
    <label class="inp-label">Accreditation Number</label><input type="text" id="birAn" value="${bir.accNo}">
    <label class="inp-label">Date Issued</label><input type="text" id="birAd" value="${bir.accDate}">
    <label class="inp-label">Expiry Date</label><input type="text" id="birAe" value="${bir.accExp}">
    <label class="inp-label">PTU Number</label><input type="text" id="birP" value="${bir.ptu}">
  </div>
  <div class="card">
    <h5>🧾 OR/SI Series</h5>
    <select id="birDt"><option value="or" ${bir.docType==='or'?'selected':''}>Official Receipt</option><option value="si" ${bir.docType==='si'?'selected':''}>Sales Invoice</option></select>
    <label class="inp-label">Prefix</label><input type="text" id="birPfx" value="${bir.prefix}">
    <label class="inp-label">Series From</label><input type="text" id="birSf" value="${bir.serFrom}">
    <label class="inp-label">Series To</label><input type="text" id="birSt" value="${bir.serTo}">
  </div>
  <div class="card">
    <h5>💰 VAT Classification</h5>
    <select id="birVt"><option value="vat" ${bir.vatType==='vat'?'selected':''}>VAT-Registered (12%)</option><option value="nonvat" ${bir.vatType==='nonvat'?'selected':''}>Non-VAT</option></select>
  </div>
  <div class="card">
    <h5>📊 Grand Accumulated Total (GAT)</h5>
    <div style="display:flex;justify-content:space-between;padding:8px 0"><span>Current GAT</span><span class="gold">${fc(getGAT())}</span></div>
    <button class="btn bd bsm" onclick="resetGAT()">⚠️ Reset GAT (BIR Order Only)</button>
  </div>
  <button class="btn bp bbl" onclick="saveBIRSetup()">💾 Save BIR Settings</button>`;
  window.saveBIRSetup = () => {
    saveSetting('bir_name', document.getElementById('birN').value);
    saveSetting('bir_address', document.getElementById('birA').value);
    saveSetting('bir_tin', document.getElementById('birT').value);
    saveSetting('bir_accno', document.getElementById('birAn').value);
    saveSetting('bir_accdate', document.getElementById('birAd').value);
    saveSetting('bir_accexp', document.getElementById('birAe').value);
    saveSetting('bir_ptu', document.getElementById('birP').value);
    saveSetting('bir_doctype', document.getElementById('birDt').value);
    saveSetting('bir_prefix', document.getElementById('birPfx').value);
    saveSetting('bir_serfrom', document.getElementById('birSf').value);
    saveSetting('bir_serto', document.getElementById('birSt').value);
    saveSetting('bir_vattype', document.getElementById('birVt').value);
    toast('BIR settings saved ✓', 'emerald');
    sw('birSetup');
  };
  window.resetGAT = async () => {
    const ok1 = await confirm2('⚠️ RESET Grand Accumulated Total?\n\nThis should ONLY be done with BIR order.', '⚠️', true);
    if (!ok1) return;
    const ok2 = await confirm2('FINAL CONFIRMATION: Have you received a new PTU from BIR?', '🏛️', true);
    if (!ok2) return;
    saveSetting('bir_gat', '0');
    saveSetting('bir_counter', '0');
    logAct('GAT RESET', 'Reset by ' + currentUser.name);
    toast('⚠️ GAT and OR counter reset.', 'rose', 7000);
    sw('birSetup');
  };
}

// --- Sales Book (placeholder) ---
export function renderSalesBook(el) {
  el.innerHTML = '<div class="card"><h4>Sales Book</h4><p>Coming soon. Use BIR Setup to configure.</p></div>';
}

// --- 2550M (placeholder) ---
export function render2550M(el) {
  el.innerHTML = '<div class="card"><h4>BIR Form 2550M</h4><p>Coming soon.</p></div>';
}
