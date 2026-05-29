// Complete console fix - paste all and press Enter
(async () => {
  // 1. Force DB.getAll to always return array (synchronous)
  const originalGetAll = DB.getAll;
  DB.getAll = (store) => {
    const res = originalGetAll(store);
    return Array.isArray(res) ? res : [];
  };
  
  // 2. Import CURR and make it global
  const utils = await import('./core/utils.js');
  window.CURR = utils.CURR;
  
  // 3. Reload dashboard
  sw('dashboard');
  console.log('✅ All fixes applied. Dashboard should appear.');
})();
