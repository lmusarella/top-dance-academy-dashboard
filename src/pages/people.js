import {
  getPersonFull,
  upsertPerson, upsertContact, upsertMembership, upsertCertificate,
  deletePerson, listPeoplePaged, countPeople, listCourses, getPersonCourseIds, setPersonCourses, getMaxQuota
} from '../services/api.js';

import { toast } from '../ui/toast.js';
import { openModal, confirmDialog } from '../ui/modal.js';

import { fetchAllPaged } from '../services/api.js';
import { exportToXlsx } from '../ui/exportExcel.js';
function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function formatConsent(value) {
  if (value === true) return 'Sì 👍';
  if (value === false) return 'No 👎';
  return '—';
}
export async function renderPeople() {
  return `
  <div class="stack">
    <section class="panel glass">
      <div class="panel-head">
        <div>
          <div class="h1">Soci</div>
                 <div class="h2">Ordinati in ordine alfabetico</div>
        </div>
        <div class="panel-actions">       
          <button class="btn primary" id="btnNew">Nuovo Socio</button>       
          <button class="btn ghost" id="btnExport">⬇ Export</button>
        </div>
      </div>

    <div class="panel-top">
      <div class="search-row">
        <div class="search">
          <input id="peopleQ"
                 placeholder="Cerca per nome, numero quota o numero tessera…" />
        </div>

        <div class="cert-filter">
          <select id="roleFilter">
            <option value="ALL">Tutti i ruoli</option>
            <option value="ALLIEVO">Allievo</option>
            <option value="COLLABORATORE">Collaboratore</option>
          </select>
        </div>
      </div>

      <div class="h2">
        Risultati: <b id="totShown">—</b> / <b id="totAll">—</b>
      </div>
    </div>

    <div class="panel-top">
      <div class="courses-filter-wrap">
        <button class="btn primary" type="button" id="btnCourses">Seleziona corsi</button>
        <button class="btn ghost" type="button" id="btnCerts">Seleziona certificati</button>
        <div id="coursesChips" class="chips"></div>
        <div id="certsFilterBox" class="panel glass" style="display:none; padding:10px; margin-top:8px">
          <div class="muted" id="certsFilterStatus">Carico certificati…</div>
          <div id="certsFilterList" class="stack" style="gap:6px; margin-top:8px"></div>

          <div class="row" style="justify-content:space-between; margin-top:10px">
            <button class="btn ghost" type="button" id="btnCertsAll">Tutti</button>
            <button class="btn ghost" type="button" id="btnCertsNone">Nessuno</button>
            <button class="btn primary" type="button" id="btnCertsApply">Applica</button>
          </div>
        </div>
        <div id="coursesFilterBox" class="panel glass" style="display:none; padding:10px; margin-top:8px">
          <div class="muted" id="coursesFilterStatus">Carico corsi…</div>
          <div id="coursesFilterList" class="stack" style="gap:6px; margin-top:8px"></div>

          <div class="row" style="justify-content:space-between; margin-top:10px">
            <button class="btn ghost" type="button" id="btnCoursesAll">Tutti</button>
            <button class="btn ghost" type="button" id="btnCoursesNone">Nessuno</button>
            <button class="btn primary" type="button" id="btnCoursesApply">Applica</button>
          </div>
        </div>
      </div>
    </div>

      <div class="table-controls">
        <div class="pagination">
          <button class="btn ghost" id="peoplePrev">←</button>
          <div class="page-info" id="peoplePageInfo">Pagina 1 / 1</div>
          <button class="btn ghost" id="peopleNext">→</button>
        </div>
        <div class="page-size">
          <span>Risultati per pagina</span>
          <select id="peoplePageSize">
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="20" selected>20</option>
            <option value="50">50</option>
          </select>
        </div>
      </div>

        <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Socio</th>
              <th>Certificato</th>
              <th>Contatti</th>
              <th>Corsi</th>          
              <th class="right">Azioni</th>
            </tr>
          </thead>
          <tbody id="peopleBody"></tbody>
        </table>

        <div class="list-footer">
          <div id="peopleStatus" class="muted">Pronto.</div>
        </div>
      </div>
    </section>
  </div>
  `;
}

export async function bindPeopleEvents() {
  const body = document.querySelector('#peopleBody');
  const status = document.querySelector('#peopleStatus');
  const qInput = document.querySelector('#peopleQ');
  const btnNew = document.querySelector('#btnNew');

  const totAllEl = document.querySelector('#totAll');
  const totShownEl = document.querySelector('#totShown');
  const btnExport = document.querySelector('#btnExport');
  const roleFilter = document.querySelector('#roleFilter');
  const pageSizeSelect = document.querySelector('#peoplePageSize');
  const pageInfo = document.querySelector('#peoplePageInfo');
  const prevBtn = document.querySelector('#peoplePrev');
  const nextBtn = document.querySelector('#peopleNext');
  const coursesChips = document.querySelector('#coursesChips');
  const btnCerts = document.querySelector('#btnCerts');
  const certsFilterBox = document.querySelector('#certsFilterBox');
  const certsFilterStatus = document.querySelector('#certsFilterStatus');
  const certsFilterList = document.querySelector('#certsFilterList');
  const btnCertsAll = document.querySelector('#btnCertsAll');
  const btnCertsNone = document.querySelector('#btnCertsNone');
  const btnCertsApply = document.querySelector('#btnCertsApply');
  const btnCourses = document.querySelector('#btnCourses');
  const coursesFilterBox = document.querySelector('#coursesFilterBox');
  const coursesFilterStatus = document.querySelector('#coursesFilterStatus');
  const coursesFilterList = document.querySelector('#coursesFilterList');
  const btnCoursesAll = document.querySelector('#btnCoursesAll');
  const btnCoursesNone = document.querySelector('#btnCoursesNone');
  const btnCoursesApply = document.querySelector('#btnCoursesApply');



  const PAGE_DEFAULT = 20;
  let pageSize = Number(pageSizeSelect?.value || PAGE_DEFAULT);
  let currentPage = 1;
  let totalFiltered = 0;
  let certStatuses = ['ALL'];
  let pendingCertStatuses = ['ALL'];
  let role = 'ALL';
  let selectedCourseIds = [];      // filtri attivi
  let pendingCourseIds = [];       // selezione “nel box” prima di Applica
  let allCoursesCache = null;
  let q = '';
  let loading = false;

  function setCounts({ totalAll = null, totalShown = null } = {}) {
    if (totalAll !== null) totAllEl.textContent = String(totalAll);
    if (totalShown !== null) totShownEl.textContent = String(totalShown);
  }
  function updatePagination() {
    const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    if (pageInfo) pageInfo.textContent = `Pagina ${currentPage} / ${totalPages}`;
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
  }
  function chipsHtml(corsiJson) {
    const arr = Array.isArray(corsiJson) ? corsiJson : [];
    if (!arr.length) return `<span class="muted">—</span>`;
    return `
    
      ${arr.map(c => `<span class="meta">${escapeHtml(c.nome)}</span>`).join('')}
   
  `;
  }
  function setBtnCoursesLabel() {
    if (!selectedCourseIds.length) {
      btnCourses.textContent = 'Seleziona corsi';
    } else {
      btnCourses.textContent = `Corsi selezionati: ${selectedCourseIds.length}`;
    }
  }
  function setBtnCertsLabel() {
    if (!certStatuses.length || certStatuses.includes('ALL')) {
      btnCerts.textContent = 'Seleziona certificati';
    } else {
      btnCerts.textContent = `Certificati selezionati: ${certStatuses.length}`;
    }
  }
  function mapCourseIdToName() {
    const m = new Map();
    for (const c of (allCoursesCache ?? [])) m.set(Number(c.id), c.nome_corso);
    return m;
  }

  function renderSelectedCourseChips() {
    if (!coursesChips) return;

    if (!selectedCourseIds.length) {
      coursesChips.innerHTML = '';
      return;
    }

    const nameById = mapCourseIdToName();

    coursesChips.innerHTML = selectedCourseIds
      .map(id => {
        const label = nameById.get(Number(id)) ?? `Corso #${id}`;
        return `
        <span class="chip" data-course-id="${id}">
          <span>${esc(label)}</span>
          <span class="x" title="Rimuovi" data-remove="${id}">×</span>
        </span>
      `;
      })
      .join('');
  }
  coursesChips?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;

    const id = Number(btn.getAttribute('data-remove'));
    if (!Number.isFinite(id)) return;

    selectedCourseIds = selectedCourseIds.filter(x => Number(x) !== id);
    setBtnCoursesLabel();
    renderSelectedCourseChips();
    await resetAndLoad();
  });
  const CERT_STATUS_OPTIONS = [
    { value: 'ALL', label: 'Tutti i certificati' },
    { value: 'OK', label: '🟢 Ok' },
    { value: 'IN_SCADENZA', label: '🔵 In scadenza (30 gg)' },
    { value: 'EXPIRED', label: '🔴 Scaduti' },
    { value: 'MISSING', label: '❌ Assenti' },
    { value: 'EXPIRED_OR_MISSING', label: '🔴❌ Scaduti o assenti' },
    { value: 'NON_RICHIESTO', label: '🟡 Esenti' },
  ];

  function renderCertsFilterList(selectedStatuses) {
    const selected = new Set((selectedStatuses ?? []).map(String));
    certsFilterStatus.textContent = '';
    certsFilterList.innerHTML = CERT_STATUS_OPTIONS.map((status) => `
      <label class="course-item">
        <input type="checkbox" value="${status.value}" ${selected.has(status.value) ? 'checked' : ''}/>
        <span>${esc(status.label)}</span>
      </label>
    `).join('');
  }

  function normalizePendingCertStatuses(values) {
    const unique = Array.from(new Set((values ?? []).map(String)));
    if (!unique.length || unique.includes('ALL')) return ['ALL'];
    return unique;
  }

  function readPendingCertStatusesFromUI() {
    const selected = Array.from(certsFilterList.querySelectorAll('input[type="checkbox"]:checked'))
      .map(input => input.value)
      .filter(Boolean);
    return normalizePendingCertStatuses(selected);
  }
  function renderCoursesFilterList(allCourses, checkedIds) {
    const checked = new Set((checkedIds ?? []).map(Number));
    const groups = new Map();

    for (const c of (allCourses ?? [])) {
      const key = c.tipo_corso || 'ALTRO';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }

    coursesFilterStatus.textContent = '';

    coursesFilterList.innerHTML = Array.from(groups.entries()).map(([tipo, items]) => `
    <div class="course-group">
      <div class="meta"><b>${esc(tipo)}</b></div>
      <div class="course-grid">
        ${items.map(c => `
          <label class="course-item">
            <input type="checkbox" value="${c.id}" ${checked.has(c.id) ? 'checked' : ''}/>
            <span>${esc(c.nome_corso)}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `).join('') || `<span class="muted">Nessun corso.</span>`;
  }

  async function ensureCoursesLoaded() {
    if (allCoursesCache) return allCoursesCache;
    allCoursesCache = await listCourses({ onlyActive: true });
    return allCoursesCache;
  }

  function readPendingSelectedFromUI() {
    return Array.from(coursesFilterList.querySelectorAll('input[type="checkbox"]:checked'))
      .map(x => Number(x.value))
      .filter(Number.isFinite);
  }
  function syncCertsAllBehavior(event) {
    const input = event.target.closest('input[type="checkbox"]');
    if (!input) return;
    if (input.value === 'ALL' && input.checked) {
      certsFilterList.querySelectorAll('input[type="checkbox"]').forEach((item) => {
        if (item.value !== 'ALL') item.checked = false;
      });
      return;
    }
    if (input.value !== 'ALL' && input.checked) {
      const allInput = certsFilterList.querySelector('input[type="checkbox"][value="ALL"]');
      if (allInput) allInput.checked = false;
    }
  }
  function corsiToString(corsi) {
    const arr = Array.isArray(corsi) ? corsi : [];
    return arr.map(x => x?.nome).filter(Boolean).join(', ');
  }

  function pick(obj, keys) {
    const out = {};
    for (const k of keys) out[k] = obj?.[k];
    return out;
  }
  btnExport.addEventListener('click', async () => {

    const all = await fetchAllPaged(({ limit, offset }) =>
      listPeoplePaged({
        q: q, limit, offset, certStatus: certStatuses, ruolo: role,
        courseIds: selectedCourseIds
      })
    );

    // quali colonne vuoi esportare (ordine incluso)
    const EXPORT_COLS = [
      'id',
      'display_name',
      'nr_quota',
      'nr_tessera',
      'ruolo',
      'giorni_rimanenti',
      'scadenza',
      'telefono',
      'email',
      'consenso_whatsapp',
      'corsi',
      'corso', // la mettiamo noi come stringa
    ];

    const toExport = (all ?? []).map(r => {
      const flat = {
        ...r,
        corsi: corsiToString(r.corsi), // <-- QUI il fix
        scadenza: r.scadenza_fmt ?? null,
      };
      return pick(flat, EXPORT_COLS);
    });

    exportToXlsx({
      filename: `topdance_soci_${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheets: [{ name: 'People', rows: toExport }]
    });
  });

  btnCourses.addEventListener('click', async () => {
    const isOpen = coursesFilterBox.style.display !== 'none';
    if (isOpen) {
      coursesFilterBox.style.display = 'none';
      return;
    }

    coursesFilterBox.style.display = 'block';
    coursesFilterStatus.textContent = 'Carico corsi…';

    try {
      const all = await ensureCoursesLoaded();
      pendingCourseIds = [...selectedCourseIds];
      renderCoursesFilterList(all, pendingCourseIds);
      renderSelectedCourseChips();
    } catch (e) {
      coursesFilterStatus.textContent = 'Errore caricamento corsi';
    }
  });
  btnCerts.addEventListener('click', async () => {
    const isOpen = certsFilterBox.style.display !== 'none';
    if (isOpen) {
      certsFilterBox.style.display = 'none';
      return;
    }

    certsFilterBox.style.display = 'block';
    certsFilterStatus.textContent = 'Seleziona certificati…';
    pendingCertStatuses = [...certStatuses];
    renderCertsFilterList(pendingCertStatuses);
  });

  certsFilterList.addEventListener('change', (event) => {
    syncCertsAllBehavior(event);
  });

  btnCertsAll.addEventListener('click', () => {
    pendingCertStatuses = ['ALL'];
    renderCertsFilterList(pendingCertStatuses);
  });

  btnCertsNone.addEventListener('click', () => {
    pendingCertStatuses = [];
    renderCertsFilterList(pendingCertStatuses);
  });

  btnCertsApply.addEventListener('click', async () => {
    pendingCertStatuses = readPendingCertStatusesFromUI();
    certStatuses = [...pendingCertStatuses];
    setBtnCertsLabel();
    certsFilterBox.style.display = 'none';
    currentPage = 1;
    await resetAndLoad();
  });

  btnCoursesAll.addEventListener('click', async () => {
    const all = await ensureCoursesLoaded();
    pendingCourseIds = all.map(c => c.id);
    renderCoursesFilterList(all, pendingCourseIds);
    renderSelectedCourseChips();
  });

  btnCoursesNone.addEventListener('click', async () => {
    const all = await ensureCoursesLoaded();
    pendingCourseIds = [];
    renderCoursesFilterList(all, pendingCourseIds);
    renderSelectedCourseChips();
  });

  btnCoursesApply.addEventListener('click', async () => {
    pendingCourseIds = readPendingSelectedFromUI();
    selectedCourseIds = [...pendingCourseIds];
    setBtnCoursesLabel();
    coursesFilterBox.style.display = 'none';
    currentPage = 1;
    await resetAndLoad();
    renderSelectedCourseChips();
  });

  // label iniziale
  setBtnCoursesLabel();
  setBtnCertsLabel();

  function rowHtml(r) {

    return `
      <tr>
        <td>
          <b>${esc(r.display_name)}</b>
         <div class="meta">${r.ruolo ? esc(r.ruolo) : ''} • Quota: ${r.nr_quota ?? '—'} • Tessera: ${esc(r.nr_tessera ?? '—')}</div>
        </td>
        <td>
          <div class="meta">
            <span>${r.giorni_rimanenti == null ? '❌ Assente' : r.giorni_rimanenti < 0 ? '🔴 Scaduto' : '🟢 Ok'}</span>
          </div>
          <div class="meta">
             <span>⏳ ${r.scadenza_fmt ?? '—'}</span>
          </div>
        </td>
        <td><div class="meta">
            ${r.telefono ? `<span>📞 ${escapeHtml(r.telefono)}</span>` : `<span class="muted">📞 —</span>`}
            </div>
          <div class="meta">
             ${r.email ? `<span>✉️ ${escapeHtml(r.email)}</span>` : `<span class="muted">✉️ —</span>`}
          </div>
          <div class="meta">
             <span>Consenso WhatsApp: ${formatConsent(r.consenso_whatsapp)}</span>
          </div>
          </td>

        <td>${chipsHtml(r.corsi)}</td>
       
        <td class="right actions-cell">
        <div class="actions">
          <button class="icon-btn sm" data-edit="${r.id}" title="Modifica">✎</button>
          <button class="icon-btn sm danger" data-del="${r.id}" title="Elimina">🗑</button>
        </div>
      </td>
      </tr>
    `;
  }

  function setStatus(msg) {
    status.textContent = msg;
  }

  async function loadPage() {
    if (loading) return;
    loading = true;
    setStatus('Carico…');

    try {
      const offset = (currentPage - 1) * pageSize;
      const rows = await listPeoplePaged({
        q, limit: pageSize, offset, certStatus: certStatuses, ruolo: role,
        courseIds: selectedCourseIds
      });
      if (rows.length === 0) {
        body.innerHTML = '';
        setStatus('Nessun risultato.');
      } else {
        body.innerHTML = rows.map(rowHtml).join('');
        setStatus(`Pagina ${currentPage}`);
      }
    } catch (e) {
      toast(e?.message ?? 'Errore caricamento', 'error');
      setStatus('Errore.');
    } finally {
      loading = false;
    }
  }

  async function resetAndLoad() {
    body.innerHTML = '';
    try {
      const totalAll = await countPeople({ q: '' });  // totale soci
      const hasFilters = q
        || (certStatuses?.length && !certStatuses.includes('ALL'))
        || selectedCourseIds.length > 0
        || role !== 'ALL';
      totalFiltered = hasFilters
        ? await countPeople({ q, certStatus: certStatuses, courseIds: selectedCourseIds, ruolo: role })
        : totalAll;
      setCounts({ totalAll, totalShown: totalFiltered });
      updatePagination();
      await loadPage();
    } catch (e) {
      toast(e?.message ?? 'Errore caricamento', 'error');
      setStatus('Errore.');
    }
  }

  // Debounce ricerca
  let t = null;
  function debounce(fn, ms = 250) {
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  const onSearch = debounce(async () => {
    q = (qInput.value || '').trim();
    currentPage = 1;
    await resetAndLoad();
  }, 250);

  qInput.addEventListener('input', onSearch);

  roleFilter?.addEventListener('change', async () => {
    role = roleFilter.value || 'ALL';
    currentPage = 1;
    await resetAndLoad();
  });

  pageSizeSelect?.addEventListener('change', async () => {
    pageSize = Number(pageSizeSelect.value) || PAGE_DEFAULT;
    currentPage = 1;
    updatePagination();
    await loadPage();
  });
  prevBtn?.addEventListener('click', async () => {
    currentPage = Math.max(1, currentPage - 1);
    updatePagination();
    await loadPage();
  });
  nextBtn?.addEventListener('click', async () => {
    currentPage += 1;
    updatePagination();
    await loadPage();
  });

  btnNew.addEventListener('click', async () => {
    await openPersonEditor({ personId: null, onSaved: resetAndLoad });
  });

  body.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const editId = btn.getAttribute('data-edit');
    if (editId) return openPersonEditor({ personId: editId, onSaved: resetAndLoad });

    const delId = btn.getAttribute('data-del');
    if (delId) {
      const ok = await confirmDialog({
        title: 'Elimina socio',
        message: 'Vuoi eliminare questa persona?',
        details: 'L’operazione rimuove anche contatti, tessera, certificato e corsi collegati.',
        confirmText: 'Elimina',
        cancelText: 'Annulla',
        danger: true,
      });
      if (!ok) return;
      try {
        await deletePerson(delId);
        toast('Eliminato', 'ok');
        await resetAndLoad();
      } catch (e2) {
        toast(e2?.message ?? 'Errore eliminazione', 'error');
      }
    }
  });

  // prima load
  await resetAndLoad();
}

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * Modal editor (create/edit). Esposta per essere usata anche dalla dashboard.
 */
export async function openPersonEditor({ personId, onSaved }) {
  const isEdit = !!personId;

  const form = document.createElement('form');
  form.className = 'form grid-rows';
  form.innerHTML = `


    <div class="section">
    
    <h3>Informazioni Generali</h3>
    
    </div>

    <div class="form-row cols-3">
      <label class="field">
        <span>Nome*</span>
        <input name="display_name" required placeholder="COGNOME NOME"/>
      </label>
      <label class="field">
        <span>Ruolo</span>
        <select name="ruolo">
          <option value="ALLIEVO">ALLIEVO</option>
          <option value="COLLABORATORE">COLLABORATORE</option>
          <option value="ALTRO">ALTRO</option>
        </select>
      </label>
       <label class="field">
        <span>Codice fiscale</span>
        <input name="codice_fiscale" placeholder="..."/>
      </label>
    </div>

    <div class="form-row cols-3">
      <label class="field size-xs">
        <span>Nr quota</span>
        <input name="nr_quota" type="number" placeholder="123"/>
      </label>
 <label class="field size-sm">
        <span>Modulo Safeguarding</span>
        <select name="safeguarding">      
          <option value="true">🟢 Ok</option>
          <option value="false">❌ Assente</option>
        </select>
      </label>
      <label class="field size-md">
        <span>Nr tessera</span>
        <input name="nr_tessera" placeholder="..."/>
      </label>
    </div>

    <div class="form-row cols-1">
      <label class="field">
        <span>Note Tesseramento</span>
        <input name="note" placeholder="..."/>
      </label>
    </div>

    <div class="section"><h3>Contatti</h3></div>

    <div class="form-row cols-3">
      <label class="field">
        <span>Telefono</span>
        <input name="telefono" placeholder="+39 ..."/>
      </label>
      <label class="field size-md">
            <span>Consenso WhatsApp</span>
            <select name="consenso_whatsapp">
              <option value="">—</option>
              <option value="true">Sì 👍</option>
              <option value="false">No 👎</option>
            </select>
        </label>
      <label class="field">
        <span>Email</span>
        <input name="email" type="email" placeholder="nome@email.it"/>
      </label>
    </div>
    
    <div class="section"><h3>Certificato</h3></div>

    <div class="form-row cols-2">
      <label class="field size-md">
        <span>Scadenza (YYYY-MM-DD)</span>
        <input name="scadenza" type="date"/>
      </label>

      <label class="field">
        <span>Fonte</span>
        <input name="fonte" placeholder="Import/Manuale"/>
      </label>
    </div>

        <div class="section"><h3>Corsi</h3></div>


    <div class="form-row cols-1">
      <label class="field">
        <span>Note corso</span>
        <input name="corso" placeholder="..."/>
      </label>
    </div>

    <div class="form-row cols-1">
      <div class="field">
       
        <div id="coursesBox" class="courses-box muted">Carico corsi…</div>
      </div>
    </div>

    <input type="hidden" name="course_ids" value="[]"/>

    <div class="form-row cols-1">
      <div class="row actions">
        <button class="btn ghost" type="button" data-cancel>Annulla</button>
        <span></span>
        <button class="btn primary" type="submit">Salva</button>
      </div>
    </div>
  `;

  const { close } = openModal({
    title: isEdit ? 'Modifica socio' : 'Nuovo socio',
    content: form
  });

  const coursesBox = form.querySelector('#coursesBox');

  // render lista corsi come checkbox
  function renderCoursesOptions(allCourses, selectedIds) {
    const selected = new Set((selectedIds ?? []).map(Number));
    const groups = new Map(); // tipo_corso -> corsi

    for (const c of (allCourses ?? [])) {
      const key = c.tipo_corso || 'ALTRO';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }

    const html = Array.from(groups.entries()).map(([tipo, items]) => {
      return `
        <div class="course-group">
          <div class="meta"><b>${esc(tipo)}</b></div>
          <div class="course-grid">
            ${items.map(c => `
              <label class="course-item">
                <input type="checkbox" value="${c.id}" ${selected.has(c.id) ? 'checked' : ''}/>
                <span>${esc(c.nome_corso)}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    coursesBox.classList.remove('muted');
    coursesBox.innerHTML = html || `<span class="muted">Nessun corso.</span>`;

    // sync hidden field
    const hidden = form.querySelector('[name="course_ids"]');
    const syncHidden = () => {
      const checked = Array.from(coursesBox.querySelectorAll('input[type="checkbox"]:checked'))
        .map(x => Number(x.value));
      hidden.value = JSON.stringify(checked);
    };

    coursesBox.addEventListener('change', syncHidden);
    syncHidden();
  }

  // preload se edit
  if (isEdit) {
    try {
      const full = await getPersonFull(personId);
      console.log('full', full)
      fill(form, {
        display_name: full.person.display_name ?? '',
        nr_quota: full.person.nr_quota ?? '',
        ruolo: full.person.ruolo ?? 'ALLIEVO',
        corso: full.person.corso ?? '',
        telefono: full.contact?.telefono ?? '',
        email: full.contact?.email ?? '',
        codice_fiscale: full.membership?.codice_fiscale ?? '',
        consenso_whatsapp: full.contact?.consenso_whatsapp === null || full.contact?.consenso_whatsapp === undefined
          ? ''
          : String(full.contact.consenso_whatsapp),
        safeguarding: full.membership?.safeguarding === null || full.membership?.safeguarding === undefined ? '' : String(full.membership?.safeguarding),

        nr_tessera: full.membership?.nr_tessera ?? '',
        note: full.membership?.note ?? '',

        scadenza: full.certificate?.scadenza ?? '',
        fonte: full.certificate?.fonte ?? '',
      });
      // carica corsi (lista + selezionati)
      const [allCourses, selectedCourseIds] = await Promise.all([
        listCourses({ onlyActive: true }),
        getPersonCourseIds(personId),
      ]);

      renderCoursesOptions(allCourses, selectedCourseIds);

    } catch (e) {
      toast(e?.message ?? 'Errore caricamento', 'error');
    }
  }
  if (!isEdit) {
    try {
      const allCourses = await listCourses({ onlyActive: true });
      renderCoursesOptions(allCourses, []);
      const maxQuota = await getMaxQuota();
      const nextQuota = Number.isFinite(Number(maxQuota)) ? Number(maxQuota) + 1 : '';
      const quotaField = form.querySelector('[name="nr_quota"]');
      if (quotaField && nextQuota !== '') quotaField.value = String(nextQuota);
    } catch (e) {
      coursesBox.innerHTML = `<span class="muted">Errore caricamento corsi</span>`;
    }
  }

  form.querySelector('[data-cancel]').addEventListener('click', close);

  const delBtn = form.querySelector('[data-delete]');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Elimina socio',
        message: 'Vuoi eliminare questa persona?',
        details: 'L’operazione rimuove anche contatti, tessera, certificato e corsi collegati.',
        confirmText: 'Elimina',
        cancelText: 'Annulla',
        danger: true,
      });
      if (!ok) return;
      try {
        await deletePerson(personId);
        toast('Eliminato', 'ok');
        close();
        await onSaved?.();
      } catch (e) {
        toast(e?.message ?? 'Errore eliminazione', 'error');
      }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fd = new FormData(form);
    const payloadPerson = {
      ...(isEdit ? { id: personId } : {}),
      display_name: String(fd.get('display_name') || '').trim(),
      nr_quota: numOrNull(fd.get('nr_quota')),
      corso: String(fd.get('corso') || ''),
      ruolo: String(fd.get('ruolo') || 'ALLIEVO'),
    };

    if (!payloadPerson.display_name) {
      toast('Display name obbligatorio', 'error');
      return;
    }

    try {
      const id = await upsertPerson(payloadPerson);

      const consenso = String(fd.get('consenso_whatsapp') || '').trim();
      const consensoBool = consenso === '' ? null : consenso === 'true';

      const safeguarding = String(fd.get('safeguarding') || '').trim();
      const safeguardingBool = safeguarding === '' ? null : safeguarding === 'true';

      await Promise.all([
        upsertContact(id, {
          telefono: strOrNull(fd.get('telefono')),
          email: strOrNull(fd.get('email')),
          consenso_whatsapp: consensoBool,
        }),
        upsertMembership(id, {
          nr_tessera: strOrNull(fd.get('nr_tessera')),
          codice_fiscale: strOrNull(fd.get('codice_fiscale')),
          safeguarding: safeguardingBool,
          note: strOrNull(fd.get('note')),
        }),
        upsertCertificate(id, {
          scadenza: strOrNull(fd.get('scadenza')),
          fonte: strOrNull(fd.get('fonte')),
        }),
      ]);
      // sync corsi
      const selectedIds = JSON.parse(String(fd.get('course_ids') || '[]'));
      await setPersonCourses(id, selectedIds);

      toast('Salvato', 'ok');
      close();
      await onSaved?.();
    } catch (e2) {
      toast(e2?.message ?? 'Errore salvataggio', 'error');
    }
  });
}

function fill(form, values) {
  Object.entries(values).forEach(([k, v]) => {
    const el = form.querySelector(`[name="${k}"]`);
    if (el) el.value = v;
  });
}

function strOrNull(v) {
  const s = String(v ?? '').trim();
  return s ? s : null;
}
function numOrNull(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
