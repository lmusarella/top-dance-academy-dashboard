import { listCardPackagesSummary, createCardPackage } from '../services/api.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function packageRow(item) {
  return `
    <tr>
      <td><b>${item.package_order ?? '—'}</b></td>
      <td>${esc(item.code ?? '—')}</td>
      <td>${esc(item.name ?? '—')}</td>
      <td>${item.start_number ?? '—'} - ${item.end_number ?? '—'}</td>
      <td>${item.total_cards ?? 0}</td>
      <td>${item.available_cards ?? 0}</td>
      <td>${item.assigned_cards ?? 0}</td>
      <td>${item.blocked_cards ?? 0}</td>
      <td>${item.used_cards ?? 0}</td>
      <td>${formatDate(item.created_at)}</td>
    </tr>
  `;
}

function normalizeErr(err) {
  const msg = err?.message || 'Operazione non riuscita';
  if (msg.includes('duplicate key') && msg.includes('card_packages_code_key')) {
    return 'Codice pacchetto già esistente.';
  }
  if (msg.includes('duplicate key') && msg.includes('card_packages_package_order_key')) {
    return 'Ordine pacchetto non valido. Riprova.';
  }
  return msg;
}

export async function renderPackageManagement() {
  return `
  <div class="stack">
    <section class="panel glass">
      <div class="panel-head">
        <div>
          <div class="h1">Gestione Pacchetti</div>
          <div class="h2">Gestisci i pacchetti tessere e monitora gli stati</div>
        </div>
        <div class="panel-actions">
          <button class="btn primary" id="btnAddCardPackage">Aggiungi pacchetto</button>
        </div>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Ordine</th>
              <th>Codice</th>
              <th>Nome</th>
              <th>Intervallo tessere</th>
              <th>Totale</th>
              <th>Disponibili</th>
              <th>Assegnate</th>
              <th>Bloccate</th>
              <th>Usate</th>
              <th>Data creazione</th>
            </tr>
          </thead>
          <tbody id="cardPackagesBody"></tbody>
        </table>
      </div>

      <div class="list-footer">
        <div id="cardPackagesStatus" class="muted">Carico pacchetti…</div>
      </div>
    </section>
  </div>
  `;
}

export async function bindPackageManagementEvents() {
  const body = document.querySelector('#cardPackagesBody');
  const statusEl = document.querySelector('#cardPackagesStatus');
  const addBtn = document.querySelector('#btnAddCardPackage');

  if (!body || !statusEl || !addBtn) return;

  const setStatus = (msg) => {
    statusEl.textContent = msg;
  };

  const setLoadingTable = () => {
    body.innerHTML = `
      <tr>
        <td colspan="10" class="muted">Caricamento pacchetti in corso…</td>
      </tr>
    `;
  };

  async function loadPackages() {
    setLoadingTable();
    setStatus('Caricamento…');

    try {
      const rows = await listCardPackagesSummary();

      if (!rows.length) {
        body.innerHTML = `
          <tr>
            <td colspan="10" class="muted">Nessun pacchetto presente. Clicca su “Aggiungi pacchetto” per crearne uno.</td>
          </tr>
        `;
        setStatus('Nessun pacchetto disponibile.');
        return;
      }

      body.innerHTML = rows.map(packageRow).join('');
      setStatus(`Pacchetti caricati: ${rows.length}`);
    } catch (err) {
      body.innerHTML = `
        <tr>
          <td colspan="10" class="muted">Errore nel caricamento pacchetti.</td>
        </tr>
      `;
      setStatus('Errore caricamento.');
      toast(normalizeErr(err), 'error');
    }
  }

  function openCreatePackageModal() {
    const form = document.createElement('form');
    form.className = 'form grid-rows';
    form.innerHTML = `
      <div class="form-row cols-2">
        <label class="field">
          <span>Codice *</span>
          <input name="code" placeholder="Es. PKG-2026-A" required />
        </label>
        <label class="field">
          <span>Nome</span>
          <input name="name" placeholder="Es. Pacchetto Primavera" />
        </label>
      </div>
      <div class="form-row cols-2">
        <label class="field">
          <span>Numero iniziale *</span>
          <input name="start_number" type="number" min="1" step="1" required />
        </label>
        <label class="field">
          <span>Numero finale *</span>
          <input name="end_number" type="number" min="1" step="1" required />
        </label>
      </div>

      <div class="row actions">
        <button class="btn ghost" type="button" data-cancel>Annulla</button>
        <span></span>
        <button class="btn primary" type="submit" data-submit>Crea pacchetto</button>
      </div>
    `;

    const { close } = openModal({
      title: 'Aggiungi pacchetto',
      content: form,
    });

    const submitBtn = form.querySelector('[data-submit]');

    form.querySelector('[data-cancel]')?.addEventListener('click', close);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const fd = new FormData(form);
      const code = String(fd.get('code') || '').trim();
      const nameRaw = String(fd.get('name') || '').trim();
      const startNumber = Number(String(fd.get('start_number') || '').trim());
      const endNumber = Number(String(fd.get('end_number') || '').trim());

      if (!code) {
        toast('Il codice è obbligatorio.', 'error');
        return;
      }
      if (!Number.isInteger(startNumber)) {
        toast('Inserisci un numero iniziale valido.', 'error');
        return;
      }
      if (!Number.isInteger(endNumber)) {
        toast('Inserisci un numero finale valido.', 'error');
        return;
      }
      if (endNumber < startNumber) {
        toast('Il numero finale deve essere maggiore o uguale al numero iniziale.', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creazione…';

      try {
        await createCardPackage({
          code,
          name: nameRaw || null,
          startNumber,
          endNumber,
        });

        close();
        form.reset();
        await loadPackages();
        toast('Pacchetto creato correttamente.', 'ok');
      } catch (err) {
        toast(normalizeErr(err), 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Crea pacchetto';
      }
    });
  }

  addBtn.addEventListener('click', openCreatePackageModal);

  await loadPackages();
}
