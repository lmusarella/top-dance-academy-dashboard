import { isLoggedIn, state } from '../services/state.js';
import { resetAnnualQuotas, signOut } from '../services/api.js';
import { confirmDialog, openModal } from './modal.js';
import { toast } from './toast.js';

export function renderShell(innerHtml) {
  const logged = isLoggedIn();
  const session = state.session;
  const userLabel = session?.user?.user_metadata?.full_name
    || session?.user?.user_metadata?.name
    || session?.user?.email
    || 'Utente';
  const date = new Date();
  const dateLabel = capitalizeFirst(
    date.toLocaleDateString('it-IT', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  );

  return `
  <div class="app-shell">
    <aside class="sidebar glass ${logged ? '' : 'hidden'}" id="sidebar">
      <div class="brand">
         <img class="brand-logo" src="${import.meta.env.BASE_URL}assets/tda_logo.jpg" alt="TopDance" />
        <div>
          <div class="brand-title">TopDanceAcademy</div>
          <div class="brand-sub">Gestione Database</div>
        </div>
      </div>

      <nav class="nav">
        <a class="nav-item" href="#/dashboard">🏠 Dashboard</a>
        <a class="nav-item" href="#/people">👥 Soci</a>
        <a class="nav-item" href="#/tessere">🪪 Tessere</a>
        <a class="nav-item" href="#/courses">🎓 Corsi</a>
      </nav>

      <div class="sidebar-foot">
        <button class="btn ghost" id="logoutBtn">Esci</button>
      </div>
    </aside>

    <section class="main">
      <header class="topbar glass">
        <button class="icon-btn mobile-only" id="menuBtn" title="Menu">☰</button>
        <div class="topbar-title">${logged ? 'Top Dance Academy' : 'Accesso'}</div>
        <div class="spacer"></div>
        ${logged
    ? `
          <div class="topbar-info">
            <div class="topbar-pill" id="currentDate" title="Data corrente">📅 ${dateLabel}</div>
            <div class="topbar-pill" id="currentUser" title="Utente loggato">👤 ${userLabel}</div>
            <button class="icon-btn" id="settingsBtn" title="Impostazioni">⚙️</button>
          </div>
        `
    : ''}
      </header>

      <main class="content">
        ${innerHtml}
      </main>
    </section>
  </div>
  `;
}

export function bindShellEvents() {
  const menuBtn = document.querySelector('#menuBtn');
  const sidebar = document.querySelector('#sidebar');
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
  }

  const logoutBtn = document.querySelector('#logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await signOut();
        toast('Logout effettuato', 'ok');
      } catch (e) {
        toast(e?.message ?? 'Errore logout', 'error');
      } finally {
        location.hash = '#/login';
      }
    });
  }

  // chiudi sidebar su click link (mobile)
  document.querySelectorAll('.nav-item').forEach(a => {
    a.addEventListener('click', () => {
      const sb = document.querySelector('#sidebar');
      sb?.classList.remove('open');
    });
  });

  const settingsBtn = document.querySelector('#settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      const content = document.createElement('div');
      content.className = 'settings-panel';
      content.innerHTML = `
        <div class="settings-section">
          <div class="settings-title">Reset annuale quote</div>
          <div class="settings-desc muted">
            Azzera la colonna quota per tutti gli iscritti. Operazione irreversibile.
          </div>
          <button class="btn danger" data-reset>Reset quote</button>
        </div>
      `;

      const { close } = openModal({ title: 'Impostazioni', content });
      const resetBtn = content.querySelector('[data-reset]');

      resetBtn.addEventListener('click', async () => {
        const confirmed = await confirmDialog({
          title: 'Attenzione',
          message: 'Effettuando il reset delle quote non sarà possibile recuperare i dati degli iscritti.',
          details: 'Sicuri di procedere?',
          confirmText: 'Sì, resetta',
          cancelText: 'Annulla',
          danger: true,
        });
        if (!confirmed) return;

        resetBtn.disabled = true;
        try {
          await resetAnnualQuotas();
          toast('Quote annuali azzerate', 'ok');
          close();
        } catch (e) {
          toast(e?.message ?? 'Errore reset quote', 'error');
        } finally {
          resetBtn.disabled = false;
        }
      });
    });
  }
}

function capitalizeFirst(value) {
  const text = String(value ?? '');
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
