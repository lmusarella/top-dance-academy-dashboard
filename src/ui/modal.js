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

  return { close, body };
}
/**
 * Pretty confirm modal.
 * @returns {Promise<boolean>}
 */
export function confirmDialog({
  title = 'Conferma',
  message = 'Sei sicuro?',
  confirmText = 'Conferma',
  cancelText = 'Annulla',
  danger = false,
  details = '',
} = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'confirm';

    wrap.innerHTML = `
      <div class="confirm-body">
        <div class="confirm-title">${escapeHtml(message)}</div>
        ${details ? `<div class="confirm-details muted">${escapeHtml(details)}</div>` : ''}
      </div>

      <div class="confirm-actions">
        <button type="button" class="btn ghost" data-cancel>${escapeHtml(cancelText)}</button>
        <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-ok>
          ${escapeHtml(confirmText)}
        </button>
      </div>
    `;

    const { close } = openModal({ title, content: wrap });

    const okBtn = wrap.querySelector('[data-ok]');
    const cancelBtn = wrap.querySelector('[data-cancel]');

    // chiusura -> default "false"
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      close();
      resolve(v);
    };

    okBtn.addEventListener('click', () => finish(true));
    cancelBtn.addEventListener('click', () => finish(false));

    // UX: Esc = cancel
    const onKey = (e) => {
      if (e.key === 'Escape') finish(false);
      if (e.key === 'Enter') finish(true);
    };
    document.addEventListener('keydown', onKey);

    // quando chiude il modal, pulisci listener e risolvi false se non già fatto
    const origClose = close;
    // patch leggero: intercettiamo close per cleanup
    // se non vuoi patchare, dimmi e lo gestiamo diversamente
    wrap._cleanup = () => document.removeEventListener('keydown', onKey);
    // assicurati di pulire in entrambi i casi:
    const closeAndCleanup = () => {
      try { wrap._cleanup?.(); } catch {}
      origClose();
    };

    // rimpiazzo close locale
    // eslint-disable-next-line no-unused-vars
    const _ = close; // evita warning in alcuni setup
    // override dei pulsanti
    okBtn.addEventListener('click', () => closeAndCleanup());
    cancelBtn.addEventListener('click', () => closeAndCleanup());

    // focus sul bottone giusto
    setTimeout(() => (danger ? cancelBtn : okBtn).focus(), 0);

    // se l’utente chiude con X/backdrop (dipende da openModal), fallback a false
    // (se openModal espone qualche hook, possiamo agganciarci meglio)
    const observer = new MutationObserver(() => {
      if (!document.body.contains(wrap) && !settled) {
        wrap._cleanup?.();
        settled = true;
        resolve(false);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
