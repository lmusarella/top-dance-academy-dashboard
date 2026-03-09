import {
  listCardPackagesSummary,
  createCardPackage,
  listCardsByPackage,
  updateCardStatus,
  addCardsToPackage,
  updateCardPackage,
  deleteCardPackage,
} from '../services/api.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { confirmDialog } from '../ui/modal.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function normalizeErr(err) {
  const msg = err?.message || 'Operazione non riuscita';
  if (msg.includes('duplicate key') && msg.includes('card_packages_code_key')) {
    return 'Codice pacchetto già esistente.';
  }
  if (msg.includes('duplicate key') && msg.includes('card_packages_package_order_key')) {
    return 'Ordine pacchetto non valido. Riprova.';
  }
  if (msg.includes('duplicate key') && msg.includes('cards_card_number_key')) {
    return 'Almeno un numero tessera esiste già.';
  }
  return msg;
}

function cardStatusLabel(status) {
  if (status === 'available') return 'Disponibile';
  if (status === 'assigned') return 'Assegnata';
  if (status === 'blocked') return 'Bloccata';
  if (status === 'used') return 'Usata';
  return status || '—';
}

function packageAccordionItem(item) {
  return `
    <details class="acc-item" data-package-id="${item.id}">
      <summary class="acc-sum">
        <div>
          <div class="acc-title">#${item.package_order ?? '—'} · ${esc(item.code ?? '—')} · ${esc(item.name ?? 'Senza nome')}</div>
          <div class="acc-sub muted">
            <span>Intervallo: ${item.start_number ?? '—'} - ${item.end_number ?? '—'}</span>
            <span>Totale: ${item.total_cards ?? 0}</span>
            <span>Disponibili: ${item.available_cards ?? 0}</span>
            <span>Assegnate: ${item.assigned_cards ?? 0}</span>
            <span>Bloccate: ${item.blocked_cards ?? 0}</span>
            <span>Usate: ${item.used_cards ?? 0}</span>
          </div>
        </div>
        
      </summary>
      <div class="acc-body">
        <div class="row" style="margin-bottom:10px; gap:8px; flex-wrap:wrap;">
          <button class="btn ghost" type="button" data-action="add-cards">Aggiungi tessere</button>
          <button class="btn ghost" type="button" data-action="edit-package">Modifica pacchetto</button>
          <button class="btn danger" type="button" data-action="delete-package">Elimina pacchetto</button>
        </div>
        <div class="table-wrap">
          <table class="table compact">
            <thead>
              <tr>
                <th>Tessera</th>
                <th>Stato</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody data-cards-body>
              <tr><td colspan="3" class="muted">Apri il pacchetto per caricare le tessere…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </details>
  `;
}

function cardRow(card) {
  const status = card.status ?? 'available';
  const isAssigned = status === 'assigned';
  const isBlocked = status === 'blocked';
  const isUsed = status === 'used';

  return `
    <tr>
      <td>${card.card_number ?? '—'}</td>
      <td>${cardStatusLabel(status)}</td>
      <td>
        <div class="row" style="gap:8px; flex-wrap:wrap;">
          <button class="chip-btn ${isAssigned ? 'active' : ''}" type="button" data-card-toggle="assigned" data-card-id="${card.id}" aria-pressed="${isAssigned ? 'true' : 'false'}" ${isUsed ? 'disabled' : ''}>Assegnata</button>
          <button class="chip-btn ${isBlocked ? 'active' : ''}" type="button" data-card-toggle="blocked" data-card-id="${card.id}" aria-pressed="${isBlocked ? 'true' : 'false'}" ${isUsed ? 'disabled' : ''}>Bloccata</button>
        </div>
      </td>
    </tr>
  `;
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

      <div id="cardPackagesAccordion" class="accordion"></div>

      <div class="list-footer">
        <div id="cardPackagesStatus" class="muted">Carico pacchetti…</div>
      </div>
    </section>
  </div>
  `;
}

export async function bindPackageManagementEvents() {
  const accordion = document.querySelector('#cardPackagesAccordion');
  const statusEl = document.querySelector('#cardPackagesStatus');
  const addBtn = document.querySelector('#btnAddCardPackage');

  if (!accordion || !statusEl || !addBtn) return;

  const setStatus = (msg) => {
    statusEl.textContent = msg;
  };

  const setLoading = () => {
    accordion.innerHTML = '<div class="muted">Caricamento pacchetti in corso…</div>';
  };

  async function loadCardsForPackage(packageId, cardsBodyEl) {
    cardsBodyEl.innerHTML = '<tr><td colspan="3" class="muted">Caricamento tessere…</td></tr>';
    try {
      const cards = await listCardsByPackage(packageId);
      if (!cards.length) {
        cardsBodyEl.innerHTML = '<tr><td colspan="3" class="muted">Nessuna tessera nel pacchetto.</td></tr>';
        return;
      }
      cardsBodyEl.innerHTML = cards.map(cardRow).join('');
    } catch (err) {
      cardsBodyEl.innerHTML = '<tr><td colspan="3" class="muted">Errore caricamento tessere.</td></tr>';
      toast(normalizeErr(err), 'error');
    }
  }

  async function loadPackages() {
    setLoading();
    setStatus('Caricamento…');

    try {
      const rows = await listCardPackagesSummary();

      if (!rows.length) {
        accordion.innerHTML = '<div class="muted">Nessun pacchetto presente. Clicca su “Aggiungi pacchetto” per crearne uno.</div>';
        setStatus('Nessun pacchetto disponibile.');
        return;
      }

      accordion.innerHTML = rows.map(packageAccordionItem).join('');
      setStatus(`Pacchetti caricati: ${rows.length}`);
    } catch (err) {
      accordion.innerHTML = '<div class="muted">Errore nel caricamento pacchetti.</div>';
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
      <label class="field">
        <span>Assegna automaticamente le nuove tessere</span>
        <select name="auto_assign">
          <option value="true" selected>Sì</option>
          <option value="false">No</option>
        </select>
      </label>

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
      const autoAssign = String(fd.get('auto_assign') || 'true') === 'true';

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

        if (autoAssign) {
          const freshPackages = await listCardPackagesSummary();
          const createdPackage = freshPackages.find((pkg) => pkg.code === code);
          if (createdPackage?.id) {
            const existingCards = await listCardsByPackage(createdPackage.id);
            for (const card of existingCards) {
              await updateCardStatus(card.id, 'assigned');
            }
          }
        }

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

  function openAddCardsModal(packageId) {
    const form = document.createElement('form');
    form.className = 'form grid-rows';
    form.innerHTML = `
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
      <label class="field">
        <span>Assegna automaticamente</span>
        <select name="auto_assign">
          <option value="true" selected>Sì</option>
          <option value="false">No</option>
        </select>
      </label>
      <div class="row actions">
        <button class="btn ghost" type="button" data-cancel>Annulla</button>
        <span></span>
        <button class="btn primary" type="submit" data-submit>Aggiungi</button>
      </div>
    `;

    const { close } = openModal({ title: 'Aggiungi tessere al pacchetto', content: form });
    const submitBtn = form.querySelector('[data-submit]');
    form.querySelector('[data-cancel]')?.addEventListener('click', close);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fd = new FormData(form);
      const startNumber = Number(String(fd.get('start_number') || '').trim());
      const endNumber = Number(String(fd.get('end_number') || '').trim());
      const autoAssign = String(fd.get('auto_assign') || 'true') === 'true';

      if (!Number.isInteger(startNumber) || !Number.isInteger(endNumber) || endNumber < startNumber) {
        toast('Intervallo tessere non valido.', 'error');
        return;
      }

      submitBtn.disabled = true;
      try {
        await addCardsToPackage({ packageId, startNumber, endNumber, autoAssign });
        close();
        await loadPackages();
        toast('Tessere aggiunte correttamente.', 'ok');
      } catch (err) {
        toast(normalizeErr(err), 'error');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  function openEditPackageModal(pkg) {
    const form = document.createElement('form');
    form.className = 'form grid-rows';
    form.innerHTML = `
      <div class="form-row cols-2">
        <label class="field">
          <span>Codice *</span>
          <input name="code" value="${esc(pkg.code)}" required />
        </label>
        <label class="field">
          <span>Nome</span>
          <input name="name" value="${esc(pkg.name ?? '')}" />
        </label>
      </div>
      <div class="row actions">
        <button class="btn ghost" type="button" data-cancel>Annulla</button>
        <span></span>
        <button class="btn primary" type="submit" data-submit>Salva</button>
      </div>
    `;

    const { close } = openModal({ title: 'Modifica pacchetto', content: form });
    const submitBtn = form.querySelector('[data-submit]');
    form.querySelector('[data-cancel]')?.addEventListener('click', close);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fd = new FormData(form);
      submitBtn.disabled = true;
      try {
        await updateCardPackage(pkg.id, {
          code: String(fd.get('code') || '').trim(),
          name: String(fd.get('name') || '').trim() || null,
        });
        close();
        await loadPackages();
        toast('Pacchetto aggiornato.', 'ok');
      } catch (err) {
        toast(normalizeErr(err), 'error');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  addBtn.addEventListener('click', openCreatePackageModal);

  accordion.addEventListener('toggle', async (event) => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement)) return;
    if (!details.open) return;
    const packageId = Number(details.getAttribute('data-package-id'));
    const cardsBodyEl = details.querySelector('[data-cards-body]');
    if (!packageId || !cardsBodyEl) return;
    await loadCardsForPackage(packageId, cardsBodyEl);
  }, true);

  accordion.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const cardActionBtn = target.closest('[data-card-toggle]');
    if (cardActionBtn) {
      const toggle = cardActionBtn.getAttribute('data-card-toggle');
      const cardId = Number(cardActionBtn.getAttribute('data-card-id'));
      const details = cardActionBtn.closest('[data-package-id]');
      const packageId = Number(details?.getAttribute('data-package-id'));
      const cardsBodyEl = details?.querySelector('[data-cards-body]');
      if (!cardId || !packageId || !cardsBodyEl) return;

      try {
        const currentPressed = cardActionBtn.getAttribute('aria-pressed') === 'true';
        let nextStatus = 'available';

        if (toggle === 'assigned') {
          nextStatus = currentPressed ? 'available' : 'assigned';
        } else if (toggle === 'blocked') {
          nextStatus = currentPressed ? 'available' : 'blocked';
        }

        await updateCardStatus(cardId, nextStatus);
        await loadCardsForPackage(packageId, cardsBodyEl);
        await loadPackages();
      } catch (err) {
        toast(normalizeErr(err), 'error');
      }
      return;
    }

    const packageActionBtn = target.closest('[data-action]');
    if (!packageActionBtn) return;
    const action = packageActionBtn.getAttribute('data-action');
    const details = packageActionBtn.closest('[data-package-id]');
    const packageId = Number(details?.getAttribute('data-package-id'));
    if (!packageId) return;

    try {
      const packages = await listCardPackagesSummary();
      const pkg = packages.find((row) => row.id === packageId);
      if (!pkg) return;

      if (action === 'add-cards') {
        openAddCardsModal(packageId);
      } else if (action === 'edit-package') {
        openEditPackageModal(pkg);
      } else if (action === 'delete-package') {
        const ok = await confirmDialog({
          title: 'Elimina pacchetto',
          message: `Confermi eliminazione pacchetto ${pkg.code}?`,
          details: 'Saranno eliminate anche le tessere collegate se il database ha la cancellazione in cascata.',
          confirmText: 'Elimina',
          cancelText: 'Annulla',
          danger: true,
        });
        if (!ok) return;
        await deleteCardPackage(packageId);
        await loadPackages();
        toast('Pacchetto eliminato.', 'ok');
      }
    } catch (err) {
      toast(normalizeErr(err), 'error');
    }
  });

  await loadPackages();
}
