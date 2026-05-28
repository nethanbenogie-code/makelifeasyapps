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

// Local OR counter fallback (if cloud function unavailable)
function getLocalNextOR() {
  const bir = getBIR();
  let counter = parseInt(getSetting('bir_counter', '0')) || 0;
  counter++;
  saveSetting('bir_counter', counter.toString());
  const to = parseInt(bir.serTo) || 9999999;
  if (counter >= to - 50) toast(`⚠️ OR series almost exhausted! ${to - counter} receipts remaining`, 'rose', 6000);
  return `${bir.prefix}-${String(counter).padStart(7, '0')}`;
}

// Cloud Function OR (atomic) – expects that _fbFunctions is set globally
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

// VAT computation with item‑level flags
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

// Daily aggregate for X/Z reading
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

// Print X or Z reading (thermal)
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

// Main receipt printing (thermal or A4) – requires lastSale global
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
      <div class="r3"><span>${it.name.substring(0, 14)}</span><span>${it.quantity}</span><span>${fc(it.price * it.quantity)}</span></div>
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
    } else { // A4
    // Generate barcode for OR number (if bwip-js loaded)
    let barcodeImg = '';
    if (typeof generateBarcodeDataURL === 'function') {
      try {
        barcodeImg = await generateBarcodeDataURL(sale.orNumber || sale.id);
      } catch(e) { console.warn('Barcode generation failed', e); }
    }
    const logoHtml = logo ? `<div style="text-align:center; margin-bottom:8px"><img src="${logo}" style="max-height:80px; max-width:200px; object-fit:contain"></div>` : '';
    const barcodeHtml = barcodeImg ? `<div style="text-align:center; margin-top:8px"><img src="${barcodeImg}" style="height:40px; width:auto"></div>` : '';
    const itemsRows = (sale.items || []).map((it, i) => `
      <tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#fff'}">
        <td style="padding:10px 14px">${i+1}</td>
        <td style="padding:10px 14px">${it.name}${it.vatExempt ? ' <em style="font-size:.8em;color:#888">[VAT-Exempt]</em>' : ''}${it.zeroRated ? ' <em style="font-size:.8em;color:#888">[Zero-Rated]</em>' : ''}</td>
        <td style="padding:10px 14px;text-align:center">${it.quantity} ${it.unit || 'pcs'}</td>
        <td style="padding:10px 14px;text-align:right">${fc(it.price)}</td>
        <td style="padding:10px 14px;text-align:right;font-weight:600">${fc(it.price * it.quantity)}</td>
      </tr>`).join('');
    html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @page { margin: 15mm 12mm; size: A4; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #222; background: #fff; }
    .hd { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px solid #222; }
    .sn { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    .su { font-size: 11px; color: #666; margin-top: 3px; }
    .rl { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #999; }
    .rn { font-size: 24px; font-weight: 800; }
    .stamp { display: inline-block; border: 3px solid #2dd4a0; color: #2dd4a0; padding: 5px 16px; border-radius: 6px; font-size: 20px; font-weight: 900; letter-spacing: 4px; transform: rotate(-8deg); margin-top: 6px; }
    .meta { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 20px; padding: 14px; background: #f5f5f5; border-radius: 8px; }
    .meta label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #999; display: block; margin-bottom: 3px; }
    .meta span { font-size: 12px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead tr { background: #222; color: #fff; }
    thead th { padding: 10px 12px; text-align: left; font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase; }
    tbody tr:last-child td { border-bottom: 2px solid #222; }
    .tots { margin-left: auto; width: 300px; }
    .tr { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; font-size: 12px; }
    .tr.grand { font-size: 16px; font-weight: 800; border-bottom: 2px solid #222; padding-top: 10px; }
    .tr.chg { font-size: 15px; font-weight: 800; color: #2dd4a0; border-bottom: 2px solid #2dd4a0; }
    .tr.disc { color: #e74c3c; }
    .bir-box { background: #fffbf0; border: 1px solid #e8c96a; border-radius: 6px; padding: 12px 16px; margin-top: 14px; font-size: 10px; line-height: 1.8; color: #555; }
    .bir-box strong { color: #333; display: block; margin-bottom: 4px; font-size: 11px; }
    .ftr { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; font-size: 10px; color: #999; }
    .nvn { font-size: 9px; color: #666; text-align: center; margin-top: 8px; padding: 6px; border: 1px dashed #ccc; border-radius: 4px; }
    </style></head><body>
    ${logoHtml}
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
    ${barcodeHtml}
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
    const rows = (sale.items || []).map((it, i) => `
      <tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#fff'}">
        <td style="padding:10px 14px">${i + 1}</td>
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
    <table><thead><tr><th>#</th><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
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
    <label class="inp-label">Registered Business Name</label><input type="text" id="birN" value="${bir.name}" placeholder="e.g. MLEA Trading Corporation">
    <label class="inp-label">Registered Address</label><input type="text" id="birA" value="${bir.address}" placeholder="e.g. 123 Main St, Cebu City">
    <label class="inp-label">TIN (Tax Identification Number)</label><input type="text" id="birT" value="${bir.tin}" placeholder="000-000-000-000">
  </div>
  <div class="card">
    <h5>📋 BIR Accreditation</h5>
    <label class="inp-label">Accreditation Number</label><input type="text" id="birAn" value="${bir.accNo}" placeholder="e.g. FP082010-033-2019-0">
    <label class="inp-label">Date Issued (YYYY-MM-DD)</label><input type="text" id="birAd" value="${bir.accDate}" placeholder="2019-01-01">
    <label class="inp-label">Expiry Date (YYYY-MM-DD)</label><input type="text" id="birAe" value="${bir.accExp}" placeholder="2024-12-31">
    <label class="inp-label">PTU (Permit to Use) Number</label><input type="text" id="birP" value="${bir.ptu}" placeholder="e.g. PTU-123456">
  </div>
  <div class="card">
    <h5>🧾 OR/SI Series</h5>
    <label class="inp-label">Document Type</label>
    <select id="birDt"><option value="or" ${bir.docType === 'or' ? 'selected' : ''}>Official Receipt (OR) — for Services</option><option value="si" ${bir.docType === 'si' ? 'selected' : ''}>Sales Invoice (SI) — for Goods</option></select>
    <label class="inp-label">Series Prefix</label><input type="text" id="birPfx" value="${bir.prefix}" placeholder="OR">
    <label class="inp-label">Series From</label><input type="text" id="birSf" value="${bir.serFrom}" placeholder="0000001">
    <label class="inp-label">Series To</label><input type="text" id="birSt" value="${bir.serTo}" placeholder="9999999">
  </div>
  <div class="card">
    <h5>💰 VAT Classification</h5>
    <select id="birVt"><option value="vat" ${bir.vatType === 'vat' ? 'selected' : ''}>VAT-Registered (12%)</option><option value="nonvat" ${bir.vatType === 'nonvat' ? 'selected' : ''}>Non-VAT</option></select>
  </div>
  <div class="card">
    <h5>📊 Grand Accumulated Total (GAT)</h5>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0">
      <span style="font-size:.82em;color:var(--text2)">Current GAT</span>
      <span style="font-family:var(--ff);font-size:1.2em;font-weight:700;color:var(--gold)">${fc(getGAT())}</span>
    </div>
    <p style="font-size:.72em;color:var(--text2);margin-bottom:10px">GAT is never reset unless instructed by BIR.</p>
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
    const ok1 = await confirm2('⚠️ RESET Grand Accumulated Total?\n\nThis should ONLY be done when:\n• BIR explicitly orders a reset in writing\n• A new PTU/Permit to Use has been issued\n\nResetting without a new PTU will cause duplicate OR numbers — a serious BIR violation.', '⚠️', true);
    if (!ok1) return;
    const ok2 = await confirm2('FINAL CONFIRMATION\n\nHave you received a new PTU (Permit to Use) from BIR?\n\nIf NO — do not proceed. Duplicate OR numbers are a BIR violation.', '🏛️', true);
    if (!ok2) return;
    saveSetting('bir_gat', '0');
    saveSetting('bir_counter', '0');
    logAct('GAT RESET', '⚠️ GAT and OR counter reset to zero by ' + currentUser.name + ' — requires new PTU');
    toast('⚠️ GAT and OR counter reset. Ensure new PTU is configured in BIR Setup.', 'rose', 7000);
    sw('birSetup');
  };
}

// --- Sales Book (RR 9-2009) ---
export function renderSalesBook(el) {
  const m = new Date().toISOString().substring(0, 7);
  const bir = getBIR();
  const sales = (currentUser.role === 'admin' ? DB.getAll('sales') : DB.getByBranch('sales', currentUser.branchId))
    .filter(s => s.date.startsWith(m) && !s.voided)
    .sort((a, b) => (a.orNumber || '').localeCompare(b.orNumber || ''));
  let runningTotal = 0;
  const rows = sales.map(s => {
    runningTotal += s.total;
    return `<tr><td>${s.date}</td><td style="font-family:var(--fm);font-size:.9em">${s.orNumber || s.id}</td><td>${s.cashierName || '—'}</td>
      <td>${fc(s.vatableSales || 0)}</td><td>${fc(s.tax || 0)}</td><td>${fc(s.vatExemptSales || 0)}</td><td>${fc(s.zeroRatedSales || 0)}</td>
      <td>${fc(s.total)}</td><td>${fc(runningTotal)}</td></tr>`;
  }).join('');
  const totVat = sales.reduce((a, s) => a + (s.vatableSales || 0), 0);
  const totTax = sales.reduce((a, s) => a + (s.tax || 0), 0);
  const totEx = sales.reduce((a, s) => a + (s.vatExemptSales || 0), 0);
  const totZr = sales.reduce((a, s) => a + (s.zeroRatedSales || 0), 0);
  const totGross = sales.reduce((a, s) => a + s.total, 0);
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <h4 style="margin:0">📒 BIR Sales Book</h4><span class="bir-badge">RR 9-2009</span>
    </div>
    <div class="card" style="border-left:3px solid var(--gold);margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:.8em;margin-bottom:4px"><span style="color:var(--text2)">Business</span><span style="font-weight:600">${bir.name}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:.8em;margin-bottom:4px"><span style="color:var(--text2)">TIN</span><span style="font-family:var(--fm)">${bir.tin}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:.8em"><span style="color:var(--text2)">Period</span><span>${m}</span></div>
    </div>
    <div style="overflow-x:auto">
      <table class="bir-tbl">
        <thead><tr><th>Date</th><th>OR/SI No.</th><th>Cashier</th><th>VATable Sales</th><th>VAT Amount</th><th>VAT-Exempt</th><th>Zero-Rated</th><th>Gross Amount</th><th>Running Total</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text3)">No sales this month</td></tr>'}</tbody>
        <tfoot><tr><td colspan="3"><strong>TOTAL</strong></td><td>${fc(totVat)}</td><td>${fc(totTax)}</td><td>${fc(totEx)}</td><td>${fc(totZr)}</td><td>${fc(totGross)}</td><td>${fc(runningTotal)}</td></tr></tfoot>
      </table>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
      <button class="btn bp" onclick="exportSalesBook()">📥 Export CSV</button>
      <button class="btn bw" onclick="printSalesBook()">🖨 Print</button>
    </div>`;
  window.exportSalesBook = () => {
    let csv = `SALES JOURNAL / SALES BOOK\n"Business: ${bir.name}"\n"TIN: ${bir.tin}"\n"Period: ${m}"\n\nDate,OR/SI No.,Cashier,VATable Sales,VAT Amount,VAT-Exempt,Zero-Rated,Gross Amount,Running Total\n`;
    let run = 0;
    sales.forEach(s => {
      run += s.total;
      csv += `${s.date},${s.orNumber || s.id},"${s.cashierName || ''}",${(s.vatableSales || 0).toFixed(2)},${(s.tax || 0).toFixed(2)},${(s.vatExemptSales || 0).toFixed(2)},${(s.zeroRatedSales || 0).toFixed(2)},${s.total.toFixed(2)},${run.toFixed(2)}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `SalesBook_${m}.csv`;
    a.click();
    toast('Sales Book exported ✓', 'emerald');
  };
  window.printSalesBook = () => {
    const rowsPrint = sales.map(s => {
      runningTotal += s.total;
      return `<tr><td>${s.date}</td><td>${s.orNumber || s.id}</td><td>${s.cashierName || ''}</td><td>${fc(s.vatableSales || 0)}</td><td>${fc(s.tax || 0)}</td><td>${fc(s.vatExemptSales || 0)}</td><td>${fc(s.zeroRatedSales || 0)}</td><td>${fc(s.total)}</td><td>${fc(runningTotal)}</td></tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@page{margin:15mm 10mm;size:A4 landscape}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#222}h2{font-size:14px;margin-bottom:4px}.sub{font-size:10px;color:#666;margin-bottom:12px}table{width:100%;border-collapse:collapse;margin-top:10px}th{background:#1a2744;color:#d4a853;padding:7px 8px;text-align:center;font-size:9px;letter-spacing:.5px;text-transform:uppercase;border:1px solid #2a3a5a}td{padding:6px 8px;border:1px solid #ddd;font-size:10px}td:not(:first-child):not(:nth-child(2)):not(:nth-child(3)){text-align:right}tfoot td{font-weight:bold;background:#f5f5f5;border-top:2px solid #222}</style></head><body><h2>SALES JOURNAL / SALES BOOK</h2><div class="sub">Business: ${bir.name} &nbsp;|&nbsp; TIN: ${bir.tin} &nbsp;|&nbsp; Period: ${m}</div><table><thead><tr><th>Date</th><th>OR/SI No.</th><th>Cashier</th><th>VATable Sales</th><th>VAT Amount</th><th>VAT-Exempt</th><th>Zero-Rated</th><th>Gross Amount</th><th>Running Total</th></tr></thead><tbody>${rowsPrint}</tbody><tfoot><tr><td colspan="3">TOTAL</td><td>${fc(totVat)}</td><td>${fc(totTax)}</td><td>${fc(totEx)}</td><td>${fc(totZr)}</td><td>${fc(totGross)}</td><td>${fc(runningTotal)}</td></tr></tfoot></table></body></html>`;
    const frame = document.getElementById('printFrame');
    const doc = frame.contentDocument || frame.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); }, 350);
  };
}

// --- 2550M VAT Return Summary ---
export function render2550M(el) {
  const m = new Date().toISOString().substring(0, 7);
  const bir = getBIR();
  const sales = (currentUser.role === 'admin' ? DB.getAll('sales') : DB.getByBranch('sales', currentUser.branchId)).filter(s => s.date.startsWith(m) && !s.voided);
  const returns = DB.getAll('returns').filter(r => r.date && r.date.startsWith(m));
  const grossSales = sales.reduce((a, s) => a + s.total, 0);
  const vatableSales = sales.reduce((a, s) => a + (s.vatableSales || 0), 0);
  const outputVAT = sales.reduce((a, s) => a + (s.tax || 0), 0);
  const vatExempt = sales.reduce((a, s) => a + (s.vatExemptSales || 0), 0);
  const zeroRated = sales.reduce((a, s) => a + (s.zeroRatedSales || 0), 0);
  const scDisc = sales.filter(s => s.discountType === 'sc').reduce((a, s) => a + (s.discountAmount || 0), 0);
  const pwdDisc = sales.filter(s => s.discountType === 'pwd').reduce((a, s) => a + (s.discountAmount || 0), 0);
  const refunds = returns.reduce((a, r) => a + (r.refundAmount || 0), 0);
  const vatOnRefunds = refunds * (taxRate / (1 + taxRate));
  const netVATDue = outputVAT - vatOnRefunds;

  const row = (label, amount, highlight = false) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.05);${highlight ? 'background:rgba(212,168,83,.08);' : ''}">
      <span style="font-size:.8em;color:${highlight ? 'var(--gold)' : 'var(--text2)'}">${label}</span>
      <span style="font-family:var(--fm);font-size:.85em;color:${highlight ? 'var(--gold)' : 'var(--text)'};">${fc(amount)}</span>
    </div>`;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <h4 style="margin:0">🏛️ BIR Form 2550M</h4><span class="bir-badge">Monthly VAT</span>
    </div>
    <div class="card" style="border-left:3px solid var(--gold);margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:.8em;margin-bottom:4px"><span style="color:var(--text2)">Business</span><span>${bir.name}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:.8em;margin-bottom:4px"><span style="color:var(--text2)">TIN</span><span style="font-family:var(--fm)">${bir.tin}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:.8em"><span style="color:var(--text2)">Taxable Month</span><span>${m}</span></div>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <div style="background:var(--bg-elevated);padding:10px 12px;font-family:var(--ff);font-size:.78em;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em">Part I — Output Tax</div>
      ${row('Gross Sales / Receipts', grossSales)}
      ${row('Less: Sales Returns & Allowances', refunds)}
      ${row('Less: Discounts (SC + PWD)', scDisc + pwdDisc)}
      ${row('Net Sales', grossSales - refunds - scDisc - pwdDisc)}
      ${row('VATable Sales (Net of VAT)', vatableSales)}
      ${row('VAT-Exempt Sales', vatExempt)}
      ${row('Zero-Rated Sales', zeroRated)}
      ${row('Output VAT (12% × VATable Sales)', outputVAT, true)}
      <div style="background:var(--bg-elevated);padding:10px 12px;font-family:var(--ff);font-size:.78em;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;margin-top:4px">Part II — VAT Adjustments</div>
      ${row('VAT on Sales Returns', vatOnRefunds)}
      <div style="background:var(--bg-elevated);padding:10px 12px;font-family:var(--ff);font-size:.78em;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;margin-top:4px">Part III — Net VAT Payable</div>
      ${row('Net VAT Due (Estimated)', netVATDue, true)}
    </div>
    <div class="card" style="border:1px solid rgba(240,101,119,.2);margin-top:4px">
      <p style="font-size:.75em;color:var(--text2);line-height:1.6">⚠️ This is a <strong style="color:var(--text)">summary estimate only</strong>. The actual BIR Form 2550M must be filed via the BIR eFPS or eBIRForms system. Input VAT (purchases) is not included here. Consult your accountant for the official filing.</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
      <button class="btn bp" onclick="export2550M()">📥 Export Summary</button>
      <button class="btn bw" onclick="sw('salesBook')">📒 Sales Book</button>
    </div>`;
  window.export2550M = () => {
    let csv = `BIR FORM 2550M SUMMARY (ESTIMATE)\n"Business: ${bir.name}"\n"TIN: ${bir.tin}"\n"Period: ${m}"\n\nDescription,Amount\n`;
    csv += `Gross Sales,${grossSales.toFixed(2)}\nSales Returns,${refunds.toFixed(2)}\n`;
    csv += `SC+PWD Discounts,${(scDisc + pwdDisc).toFixed(2)}\n`;
    csv += `VATable Sales (net of VAT),${vatableSales.toFixed(2)}\nOutput VAT (12%),${outputVAT.toFixed(2)}\n`;
    csv += `VAT-Exempt Sales,${vatExempt.toFixed(2)}\nZero-Rated Sales,${zeroRated.toFixed(2)}\n`;
    csv += `VAT on Returns,${vatOnRefunds.toFixed(2)}\nEstimated Net VAT Due,${netVATDue.toFixed(2)}\n`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `2550M_Summary_${m}.csv`;
    a.click();
    toast('2550M summary exported ✓', 'emerald');
  };
}