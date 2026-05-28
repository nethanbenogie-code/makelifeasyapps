// Menu definitions per role
const MENU_ITEMS = {
  admin: [
    { icon: "📊", label: "Dashboard", view: "dashboard" },
    { icon: "💳", label: "POS Terminal", view: "pos", badge: "held" },
    { icon: "💰", label: "Sales History", view: "allSales" },
    { icon: "↩️", label: "Returns & Refunds", view: "returns" },
    { icon: "🚫", label: "Voided Transactions", view: "voidedSales" },
    { icon: "📦", label: "Products", view: "allProducts", badge: "lowStock" },
    { icon: "🚚", label: "Suppliers", view: "suppliers" },
    { icon: "📋", label: "Purchase Orders", view: "purchaseOrders" },
    { icon: "🏢", label: "Branches", view: "branches" },
    { icon: "👥", label: "Users", view: "allUsers" },
    { icon: "👤", label: "Customers", view: "customers" },
    { icon: "📑", label: "X-Reading", view: "xReading" },
    { icon: "📋", label: "Z-Reading", view: "zReading" },
    { icon: "🏛️", label: "BIR Setup", view: "birSetup" },
    { icon: "📒", label: "Sales Book", view: "salesBook" },
    { icon: "🏛️", label: "Form 2550M", view: "form2550M" },
    { icon: "📈", label: "Reports", view: "reports" },
    { icon: "📝", label: "Activity Log", view: "actLog" },
    { icon: "📁", label: "Backup & Export", view: "backup" },
    { icon: "⚙️", label: "Settings", view: "settings" },
    { icon: "☁️", label: "Firebase Setup", view: "fbSetup" }
  ],
  manager: [
    { icon: "📊", label: "Dashboard", view: "dashboard" },
    { icon: "💳", label: "POS Terminal", view: "pos", badge: "held" },
    { icon: "💰", label: "Sales", view: "branchSales" },
    { icon: "↩️", label: "Returns", view: "returns" },
    { icon: "📦", label: "Products", view: "inventory", badge: "lowStock" },
    { icon: "🚚", label: "Suppliers", view: "suppliers" },
    { icon: "📋", label: "Purchase Orders", view: "purchaseOrders" },
    { icon: "👥", label: "Cashiers", view: "myUsers" },
    { icon: "👤", label: "Customers", view: "customers" },
    { icon: "📑", label: "X-Reading", view: "xReading" },
    { icon: "📋", label: "Z-Reading", view: "zReading" },
    { icon: "📒", label: "Sales Book", view: "salesBook" },
    { icon: "🏛️", label: "Form 2550M", view: "form2550M" },
    { icon: "📈", label: "Reports", view: "reports" },
    { icon: "📝", label: "Activity Log", view: "actLog" },
    { icon: "📁", label: "Backup", view: "backup" },
    { icon: "⚙️", label: "Settings", view: "settings" }
  ],
  cashier: [
    { icon: "📊", label: "Dashboard", view: "dashboard" },
    { icon: "💳", label: "POS Terminal", view: "pos", badge: "held" }
  ]
};

// Helper: get badge counts (low stock, held sales)
function getBadges() {
  const lowStock = DB.getAll("products").filter(p => p.active && p.stock <= lowStockThresh).length;
  const held = DB.getAll("heldSales").length;
  return { lowStock, held };
}

export function renderSidebar() {
  const nav = document.getElementById("sbNav");
  if (!nav || !currentUser) return;
  const role = currentUser.role;
  const badges = getBadges();
  const items = MENU_ITEMS[role] || MENU_ITEMS.cashier;
  
  let html = "";
  let lastGroup = "";
  items.forEach(item => {
    // Add section headers dynamically (optional)
    if (item.view === "pos" && lastGroup !== "sales") {
      html += `<div class="sb-sec">Sales</div>`;
      lastGroup = "sales";
    }
    if ((item.view === "allProducts" || item.view === "inventory") && lastGroup !== "inventory") {
      html += `<div class="sb-sec">Inventory</div>`;
      lastGroup = "inventory";
    }
    if ((item.view === "allUsers" || item.view === "myUsers") && lastGroup !== "team") {
      html += `<div class="sb-sec">Team</div>`;
      lastGroup = "team";
    }
    if ((item.view === "xReading" || item.view === "zReading") && lastGroup !== "bir") {
      html += `<div class="sb-sec">BIR Compliance</div>`;
      lastGroup = "bir";
    }
    if ((item.view === "customers") && lastGroup !== "crm") {
      html += `<div class="sb-sec">CRM</div>`;
      lastGroup = "crm";
    }
    let badgeHtml = "";
    if (item.badge === "lowStock" && badges.lowStock) {
      badgeHtml = `<span style="color:var(--rose);font-size:.72em;"> (${badges.lowStock})</span>`;
    }
    if (item.badge === "held" && badges.held) {
      badgeHtml = `<span style="color:var(--gold);font-size:.72em;"> (${badges.held})</span>`;
    }
    html += `<div class="sb-item" onclick="sw('${item.view}')">
      <span class="sb-icon">${item.icon}</span>${item.label}${badgeHtml}
    </div>`;
  });
  nav.innerHTML = html;
}