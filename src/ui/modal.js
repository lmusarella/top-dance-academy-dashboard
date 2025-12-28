export function openModal({ title, content, onClose }) {
  const root = document.querySelector('#modal-root');
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal glass">
        <div class="modal-head">
          <div class="modal-title"><h2>${escapeHtml(title || '')}</h2></div>
          <button class="icon-btn" data-x title="Chiudi">✕</button>
        </div>
        <div class="modal-body"></div>
      </div>
    </div>
  `;

  const body = root.querySelector('.modal-body');
  if (typeof content === 'string') body.innerHTML = content;
  else body.appendChild(content);

  const close = () => {
    root.innerHTML = '';
    onClose?.();
  };

  root.querySelector('[data-x]').addEventListener('click', close);
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) close();
  });

  return { close, body };
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
