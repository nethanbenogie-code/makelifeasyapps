import { DB } from '../core/db.js';
import { toast, confirm2, fc } from '../core/utils.js';
import { openModal, closeModal } from '../ui/modal.js';
import { sw } from '../ui/render.js';

export function renderCustomers(el) {
  const customers = DB.getAll('customers');
  const search = document.getElementById('custSearch')?.value?.toLowerCase() || '';
  const filtered = customers.filter(c => !search || c.name.toLowerCase().includes(search) || (c.phone || '').includes(search) || (c.email || '').toLowerCase().includes(search));
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <h4 style="margin:0">👤 Customers</h4>
      <button class="btn bp bsm" onclick="showCustomerModal()">+ Add Customer</button>
    </div>
    <div class="pos-search" style="margin-bottom:12px"><input type="text" id="custSearch" placeholder="Search customers…" oninput="renderCustomers(document.getElementById('mainContent'))"></div>
    ${!filtered.length ? '<div class="empty-st"><div class="ei">👤</div><p>No customers yet</p></div>' :
      filtered.map(c => `<div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong style="font-family:var(--ff)">${c.name}</strong>
            ${c.phone ? `<p style="font-size:.78em;color:var(--text2);margin-top:3px">📞 ${c.phone}</p>` : ''}
            ${c.email ? `<p style="font-size:.75em;color:var(--text2)">✉ ${c.email}</p>` : ''}
            <div style="margin-top:6px;display:flex;gap:8px;align-items:center">
              <span class="loyalty-pts">⭐ ${c.points || 0} pts</span>
              ${c.scPwd ? '<span class="rbadge rb-admin">SC/PWD</span>' : ''}
              ${c.tin ? `<span style="font-size:.65em;color:var(--text3);font-family:var(--fm)">TIN: ${c.tin}</span>` : ''}
            </div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn bw bxs" onclick="showCustomerModal(${c.id})">✎</button>
            <button class="btn bd bxs" onclick="deleteCustomer(${c.id})">🗑</button>
          </div>
        </div>
      </div>`).join('')}`;
  window.showCustomerModal = (id) => {
    const c = id ? DB.getById('customers', id) : null;
    openModal(`<h4>${c ? 'Edit' : 'Add'} Customer</h4>
      <label class="inp-label">Full Name *</label><input type="text" id="custN" value="${c ? c.name : ''}" placeholder="e.g. Maria Santos">
      <label class="inp-label">Phone</label><input type="tel" id="custP" value="${c ? c.phone || '' : ''}" placeholder="09XX-XXX-XXXX">
      <label class="inp-label">Email</label><input type="email" id="custE" value="${c ? c.email || '' : ''}" placeholder="maria@email.com">
      <label class="inp-label">TIN (for SC/PWD receipts)</label><input type="text" id="custTIN" value="${c ? c.tin || '' : ''}" placeholder="000-000-000-000">
      <label class="inp-label">Address</label><input type="text" id="custA" value="${c ? c.address || '' : ''}" placeholder="123 Main St">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <input type="checkbox" id="custSC" ${c && c.scPwd ? 'checked' : ''} style="width:auto;margin-bottom:0">
        <label style="font-size:.82em;color:var(--text2)">Senior Citizen / PWD (auto-apply 20% discount)</label>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button class="btn bd" onclick="closeModal()">Cancel</button>
        <button class="btn bp" onclick="saveCustomer(${id || 'null'})">Save Customer</button>
      </div>`);
  };
  window.saveCustomer = (id) => {
    const name = document.getElementById('custN').value.trim();
    if (!name) { toast('Name is required', 'rose'); return; }
    const data = {
      name,
      phone: document.getElementById('custP').value || '',
      email: document.getElementById('custE').value || '',
      tin: document.getElementById('custTIN').value || '',
      address: document.getElementById('custA').value || '',
      scPwd: document.getElementById('custSC').checked,
      points: id ? (DB.getById('customers', id)?.points || 0) : 0,
    };
    if (id) {
      const c = DB.getById('customers', id);
      if (c) { Object.assign(c, data); DB.update('customers', c); }
    } else {
      DB.add('customers', data);
    }
    closeModal();
    sw('customers');
    toast('Customer saved ✓', 'emerald');
  };
  window.deleteCustomer = async (id) => {
    const ok = await confirm2('Delete this customer record?', '👤', true);
    if (ok) { DB.delete('customers', id); sw('customers'); }
  };
}