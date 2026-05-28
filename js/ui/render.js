const views = new Map();

export function registerView(name, renderFn) {
  views.set(name, renderFn);
}

export function sw(view) {
  const el = document.getElementById('mainContent');
  if (!el) return;
  const fn = views.get(view);
  if (fn) {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => {
      fn(el);
      el.style.transition = 'all .25s ease';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, 80);
  } else {
    console.warn(`View "${view}" not registered`);
  }
}