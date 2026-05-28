import { DB } from '../core/db.js';
import { currentUser } from '../core/auth.js';
import { fc, getSetting, getLowStockThreshold, logAct } from '../core/utils.js';
import { getBIR, getGAT, printXZ, getDayData } from './bir.js';
import { sw } from '../ui/render.js';

// Helper to get low stock items (used in dashboard)
function getLowStock() {
  const products = DB.getAll('products');
  const thresh = getLowStockThreshold();
  return products.filter(p => p.active && p.stock <= thresh);
}

// Dashboard
export function renderDashboard(el) {
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.substring(0, 7);
  const mySales = (currentUser.role === 'admin' ? DB.getAll('sales') : DB.getByBranch('sales', currentUser.branchId)).filter(s => !s.voided);
  const todaySales = mySales.filter(s => s.date === today);
  const todayRev = todaySales.reduce((a, s) => a + s.total, 0);
  const monthRev = mySales.filter(s => s.date.startsWith(thisMonth)).reduce((a, s) => a + s.total, 0);
  const myProds = currentUser.role === 'admin' ? DB.getAll('products') : DB.getByBranch('products', currentUser.branchId);
  const totalCost = myProds.reduce((s, p) => s + (p.cost || 0) * p.stock, 0);
  const totalVal = myProds.reduce((s, p) => s + p.price * p.stock, 0);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const roleColor = currentUser.role === 'admin' ? 'var(--gold)' : currentUser.role === 'manager' ? 'var(--emerald)' : 'var(--blue)';
  const lowItems = getLowStock();
  const gat = getGAT();
  const bir = getBIR();

  // 7‑day chart
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  const dayTots = days.map(d => mySales.filter(s => s.date === d).reduce((a, s) => a + s.total, 0));
  const maxD = Math.max(...dayTots, 1);

  // Top products
  const allItems = mySales.flatMap(s => s.items || []);
  const pMap = {};
  allItems.forEach(i => { pMap[i.name] = (pMap[i.name] || 0) + i.quantity; });
  const topP = Object.entries(pMap).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const storageMode = getSetting('storageMode', 'local');

  el.innerHTML = `
    <div class="welcome">
      <p style="color:var(--text3);font-size:.75em;margin-bottom:4px;font-family:var(--ff);letter-spacing:.06em;text-transform:uppercase">${greeting}</p>
      <h3>${currentUser.name}</h3>
      <p style="color:var(--text2);font-size:.82em">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <span style="background:rgba(0,0,0,.3);color:${roleColor};border:1px solid ${roleColor}30;border-radius:20px;padding:4px 12px;font-size:.7em;font-weight:600;font-family:var(--ff)">${currentUser.role === 'admin' ? '👑 Administrator' : currentUser.role === 'manager' ? '🎯 Manager' : '👤 Cashier'}</span>
        <span class="bir-badge">🏛️ BIR v5</span>
        <span class="${storageMode === 'firebase' ? 'fb-on' : 'fb-off'}">${storageMode === 'firebase' ? '☁️ Firebase' : '💾 Local'}</span>
      </div>
    </div>
    <div class="metrics">
      <div class="met"><div class="met-v">${fc(todayRev)}</div><div class="met-l">Today's Sales</div></div>
      <div class="met"><div class="met-v">${todaySales.length}</div><div class="met-l">Transactions</div></div>
    </div>
    <div class="metrics" style="margin-top:8px">
      <div class="met"><div class="met-v">${fc(monthRev)}</div><div class="met-l">Monthly Revenue</div></div>
      <div class="met"><div class="met-v" style="color:var(--emerald)">${fc(totalVal - totalCost)}</div><div class="met-l">Potential Profit</div></div>
    </div>
    <div class="card" style="margin-top:12px"><h5>📊 Last 7 Days</h5>
      <div class="bar-chart">${days.map((d, i) => `<div class="bar-wrap"><div class="bar" style="height:${Math.max(4, (dayTots[i] / maxD) * 76)}px" title="${fc(dayTots[i])}"></div><div class="bar-lbl">${d.slice(5)}</div></div>`).join('')}</div>
    </div>
    ${topP.length ? `<div class="card"><h5>🏆 Top Products (All Time)</h5>${topP.map((p, i) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04)"><span style="font-size:.82em">${['🥇', '🥈', '🥉'][i]} ${p[0]}</span><span style="font-family:var(--fm);font-size:.78em;color:var(--gold)">${p[1]} sold</span></div>`).join('')}</div>` : ''}
    <div class="card" style="border-left:3px solid var(--gold)">
      <h5 style="color:var(--gold)">🏛️ BIR Status</h5>
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:.78em"><span style="color:var(--text2)">TIN</span><span style="font-family:var(--fm)">${bir.tin}</span></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:.78em"><span style="color:var(--text2)">PTU No.</span><span style="font-family:var(--fm)">${bir.ptu}</span></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:.78em"><span style="color:var(--text2)">Grand Accum. Total</span><span style="font-family:var(--ff);color:var(--gold);font-weight:700">${fc(gat)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:.78em"><span style="color:var(--text2)">VAT Type</span><span style="color:var(--emerald);font-weight:600">${bir.vatType === 'vat' ? 'VAT-Registered (12%)' : 'Non-VAT'}</span></div>
    </div>
    ${lowItems.length ? `<div class="card" style="border-left:3px solid var(--rose)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h5 style="margin-bottom:0;color:var(--rose)">⚠️ Low Stock (${lowItems.length})</h5>
        ${currentUser.role !== 'cashier' ? `<button class="btn bd bxs" onclick="sw('${currentUser.role === 'admin' ? 'allProducts' : 'inventory'}')">View All</button>` : ''}
      </div>
      ${lowItems.slice(0, 4).map(p => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04)"><span style="font-size:.78em">${p.name}</span><span style="font-family:var(--fm);font-size:.75em;color:${p.stock === 0 ? 'var(--rose)' : '#fbb923'};font-weight:700">${p.stock === 0 ? 'OUT' : p.stock}</span></div>`).join('')}
    </div>` : ''}
    <div style="margin-top:14px">
      <button class="btn bp bbl" onclick="sw('pos')" style="font-size:1em;padding:16px">💳 Start New Sale</button>
      ${currentUser.role !== 'cashier' ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn bs" onclick="sw('xReading')">📑 X-Reading</button><button class="btn bw" onclick="sw('zReading')">📋 Z-Reading</button></div>` : ''}
    </div>`;
}

// X-Reading (non‑reset)
export function renderXR(el) {
  const today = new Date().toISOString().split('T')[0];
  const d = getDayData(today);
  const bir = getBIR();
  const gat = getGAT();
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <h4 style="margin:0">📑 X-Reading</h4><span class="bir-badge">Non-Reset</span>
  </div>
  <div class="card" style="border:1px solid rgba(212,168,83,.3)">
    <p style="font-size:.75em;color:var(--text2);margin-bottom:12px">Snapshot as of this moment. Does NOT reset any counters.</p>
    <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:.8em;color:var(--text2)">Store</span><span style="font-size:.8em;font-weight:600">${bir.name}</span></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:.8em;color:var(--text2)">TIN</span><span style="font-size:.8em;font-family:var(--fm)">${bir.tin}</span></div>
    <div style="display:flex;justify-content:space-between"><span style="font-size:.8em;color:var(--text2)">Date / Time</span><span style="font-size:.8em">${today} ${new Date().toLocaleTimeString('en-PH')}</span></div>
  </div>
  <div class="reading-card">
    <div class="rrow"><span>Transactions Today</span><span>${d.sales.length}</span></div>
    <div class="rrow"><span>Voided Today</span><span style="color:var(--rose)">${d.voided.length}</span></div>
    <div class="rrow"><span>VATable Sales</span><span style="font-family:var(--fm)">${fc(d.vs)}</span></div>
    <div class="rrow"><span>VAT Amount (12%)</span><span style="font-family:var(--fm)">${fc(d.vat)}</span></div>
    <div class="rrow"><span>VAT-Exempt Sales</span><span style="font-family:var(--fm)">${fc(d.ve)}</span></div>
    <div class="rrow tot"><span>GROSS TOTAL</span><span>${fc(d.total)}</span></div>
  </div>
  <div class="reading-card">
    <div class="rrow"><span>👴 SC Discount</span><span>${fc(d.sc)}</span></div>
    <div class="rrow"><span>♿ PWD Discount</span><span>${fc(d.pwd)}</span></div>
    <div class="rrow"><span>🏷️ Promo Discount</span><span>${fc(d.promo)}</span></div>
    <div class="rrow tot"><span>TOTAL DISCOUNTS</span><span>${fc(d.sc + d.pwd + d.promo)}</span></div>
  </div>
  <div class="reading-card">
    <div class="rrow"><span>💵 Cash</span><span>${fc(d.cash)}</span></div>
    <div class="rrow"><span>💳 Card</span><span>${fc(d.card)}</span></div>
    <div class="rrow"><span>⚡ Split</span><span>${fc(d.split)}</span></div>
    <div class="rrow" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
      <span style="color:var(--gold)">Grand Accum. Total (GAT)</span>
      <span style="color:var(--gold);font-weight:700;font-family:var(--fm)">${fc(gat)}</span>
    </div>
  </div>
  <button class="btn bp bbl" onclick="printXZ('x')">🖨 Print X-Reading</button>`;
  window.printXZ = printXZ;
}

// Z-Reading (end of day)
export function renderZR(el) {
  const today = new Date().toISOString().split('T')[0];
  const d = getDayData(today);
  const bir = getBIR();
  const gat = getGAT();
  const done = localStorage.getItem('mlea_last_z') === today;
  const firstOR = d.sales.length ? d.sales[0].orNumber : '—';
  const lastOR = d.sales.length ? d.sales[d.sales.length - 1].orNumber : '—';
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <h4 style="margin:0">📋 Z-Reading</h4>
    <span class="bir-badge" style="${done ? 'background:rgba(240,101,119,.15);border-color:rgba(240,101,119,.4);color:var(--rose)' : ''}">End of Day</span>
  </div>
  ${done ? '<div class="card" style="border:1px solid rgba(240,101,119,.3)"><p style="font-size:.82em;color:var(--rose)">⚠️ Z-Reading already performed today. Only proceed if closing a second shift.</p></div>' : ''}
  <div class="reading-card">
    <div class="rrow"><span>Date</span><span>${today}</span></div>
    <div class="rrow"><span>Beginning OR</span><span style="font-family:var(--fm);font-size:.8em">${firstOR}</span></div>
    <div class="rrow"><span>Ending OR</span><span style="font-family:var(--fm);font-size:.8em">${lastOR}</span></div>
    <div class="rrow"><span>Transactions</span><span>${d.sales.length}</span></div>
    <div class="rrow"><span>Voided</span><span style="color:var(--rose)">${d.voided.length}</span></div>
    <div class="rrow"><span>VATable Sales</span><span>${fc(d.vs)}</span></div>
    <div class="rrow"><span>VAT Amount (12%)</span><span>${fc(d.vat)}</span></div>
    <div class="rrow"><span>Total Discounts</span><span>${fc(d.sc + d.pwd + d.promo)}</span></div>
    <div class="rrow tot"><span>GROSS TOTAL</span><span>${fc(d.total)}</span></div>
    <div class="rrow" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
      <span style="color:var(--gold)">Grand Accum. Total (GAT)</span>
      <span style="color:var(--gold);font-weight:700;font-family:var(--fm)">${fc(gat)}</span>
    </div>
  </div>
  <button class="btn bp bbl" onclick="doZReading()">📋 Perform Z-Reading & Print</button>
  <p style="font-size:.7em;color:var(--text2);text-align:center;margin-top:8px">This action is permanent and logged for BIR audit.</p>`;
  window.doZReading = async () => {
    const ok = await confirm2('Perform Z-Reading for ' + today + '?\nThis marks the end of your business day and is logged permanently.', '📋');
    if (!ok) return;
    localStorage.setItem('mlea_last_z', today);
    logAct('Z-Reading', 'EOD: ' + today + ' | GAT: ' + fc(gat));
    printXZ('z');
    toast('Z-Reading complete ✓', 'emerald');
    sw('zReading');
  };
}