export function openModal(html) {
  const modal = document.getElementById('modal');
  const box = document.getElementById('modalBox');
  if (!modal || !box) return;
  box.innerHTML = html;
  modal.classList.add('on');
}

export function closeModal() {
  const modal = document.getElementById('modal');
  if (modal) modal.classList.remove('on');
}

export function initModal() {
  const modal = document.getElementById('modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }
}