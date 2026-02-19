import { listPeopleByQuotaPaged, countPeople, fetchAllPaged, upsertMembership, listCourses } from '../services/api.js';
import { toast } from '../ui/toast.js';
import { exportToXlsx } from '../ui/exportExcel.js';
import { openModal } from '../ui/modal.js';

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function renderTessere() {
  return `
  <div class="stack">
    <section class="panel glass">
      <div class="panel-head">
        <div>
          <div class="h1">Tessere</div>
          <div class="h2">Ordinate per numero quota</div>
        </div>
        <div class="panel-actions">
          <button class="btn ghost" id="btnExportTessere">⬇ Export</button>
        </div>
      </div>

      <div class="panel-top">
        <div class="search-row">
          <div class="search">
            <input id="tessereQ" placeholder="Cerca per nome, numero quota o numero tessera…" />
          </div>
          <div class="cert-filter">
            <select id="tessereRoleFilter">
              <option value="ALL">Tutti i ruoli</option>
              <option value="ALLIEVO">Allievo</option>
              <option value="COLLABORATORE">Collaboratore</option>
            </select>
          </div>
          <div class="cert-filter">
            <select id="tessereSafeguardingFilter">
              <option value="ALL">Modulo Safeguarding: Tutti</option>
              <option value="OK">Modulo Safeguarding: 🟢 Ok</option>
              <option value="ASSENTE">Modulo Safeguarding: ❌ Assente</option>
            </select>
          </div>
          <button class="btn primary" type="button" id="btnTessereCourses">Filtra per corsi</button>
        </div>
        <div class="tessere-toggle-row">
          <button class="chip-btn" id="tessereMissingToggle" type="button" aria-pressed="false">
            Solo record senza tessera
          </button>
        </div>
        <div id="tessereCoursesChips" class="chips"></div>
        <div id="tessereCoursesFilterBox" class="panel glass" style="display:none; padding:10px; margin-top:8px">
          <div class="muted" id="tessereCoursesFilterStatus">Carico corsi…</div>
          <div id="tessereCoursesFilterList" class="stack" style="gap:6px; margin-top:8px"></div>

          <div class="row" style="justify-content:space-between; margin-top:10px">
            <button class="btn ghost" type="button" id="btnTessereCoursesAll">Tutti</button>
            <button class="btn ghost" type="button" id="btnTessereCoursesNone">Nessuno</button>
            <button class="btn primary" type="button" id="btnTessereCoursesApply">Applica</button>
          </div>
        </div>
        <div class="meta">Risultati: <b id="tessereShown">0</b> / <b id="tessereTotal">0</b></div>
      </div>

      <div class="table-controls">
        <div class="pagination">
          <button class="btn ghost" id="tesserePrev">←</button>
          <div class="page-info" id="tesserePageInfo">Pagina 1 / 1</div>
          <button class="btn ghost" id="tessereNext">→</button>
        </div>
        <div class="page-size">
          <span>Risultati per pagina</span>
          <select id="tesserePageSize">
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
              <th>Quota</th>
              <th>Socio</th>
              <th>Tessera</th>
              <th>Note</th>
          
              <th>Modulo Safeguarding</th>
              <th class="right">Azioni</th>
            </tr>
          </thead>
          <tbody id="tessereBody"></tbody>
        </table>

        <div class="list-footer">
          <div id="tessereStatus" class="muted">Pronto.</div>
        </div>
      </div>
    </section>
  </div>
  `;
}

export async function bindTessereEvents() {
  const body = document.querySelector('#tessereBody');
  const status = document.querySelector('#tessereStatus');
  const qInput = document.querySelector('#tessereQ');
  const roleFilter = document.querySelector('#tessereRoleFilter');
  const safeguardingFilter = document.querySelector('#tessereSafeguardingFilter');
  const shownEl = document.querySelector('#tessereShown');
  const totalEl = document.querySelector('#tessereTotal');
  const missingToggle = document.querySelector('#tessereMissingToggle');
  const btnCourses = document.querySelector('#btnTessereCourses');
  const coursesChips = document.querySelector('#tessereCoursesChips');
  const coursesFilterBox = document.querySelector('#tessereCoursesFilterBox');
  const coursesFilterStatus = document.querySelector('#tessereCoursesFilterStatus');
  const coursesFilterList = document.querySelector('#tessereCoursesFilterList');
  const btnCoursesAll = document.querySelector('#btnTessereCoursesAll');
  const btnCoursesNone = document.querySelector('#btnTessereCoursesNone');
  const btnCoursesApply = document.querySelector('#btnTessereCoursesApply');
  const btnExport = document.querySelector('#btnExportTessere');
  const pageSizeSelect = document.querySelector('#tesserePageSize');
  const pageInfo = document.querySelector('#tesserePageInfo');
  const prevBtn = document.querySelector('#tesserePrev');
  const nextBtn = document.querySelector('#tessereNext');

  const PAGE_DEFAULT = 20;
  let pageSize = Number(pageSizeSelect?.value || PAGE_DEFAULT);
  let currentPage = 1;
  let totalFiltered = 0;
  let totalAll = 0;
  let q = '';
  let role = 'ALL';
  let safeguarding = 'ALL';
  let withoutCard = false;
  let selectedCourseIds = [];
  let pendingCourseIds = [];
  let allCoursesCache = null;
  let loading = false;
  let cacheRows = [];
  let shown = 0;

  function setStatus(msg) {
    status.textContent = msg;
  }

  function updateCount(total = null) {
    if (shownEl) shownEl.textContent = String(shown);
    if (totalEl && total !== null) totalEl.textContent = String(total);
  }
  function updatePagination() {
    const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    if (pageInfo) pageInfo.textContent = `Pagina ${currentPage} / ${totalPages}`;
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
  }


  function escHtml(s) {
    return esc(s);
  }

  function setBtnCoursesLabel() {
    if (!btnCourses) return;
    if (!selectedCourseIds.length) {
      btnCourses.textContent = 'Filtra per corsi';
    } else {
      btnCourses.textContent = `Corsi selezionati: ${selectedCourseIds.length}`;
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
          <span>${escHtml(label)}</span>
          <span class="x" title="Rimuovi" data-remove="${id}">×</span>
        </span>
      `;
      })
      .join('');
  }

  function renderCoursesFilterList(allCourses, checkedIds) {
    const checked = new Set((checkedIds ?? []).map(Number));
    const groups = new Map();

    for (const c of (allCourses ?? [])) {
      const key = c.tipo_corso || 'ALTRO';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ id: Number(c.id), nome_corso: c.nome_corso });
    }

    coursesFilterStatus.textContent = '';
    coursesFilterList.innerHTML = Array.from(groups.entries()).map(([tipo, items]) => `
    <div class="course-group">
      <div class="meta"><b>${escHtml(tipo)}</b></div>
      <div class="course-grid">
        ${items.map(c => `
          <label class="course-item">
            <input type="checkbox" value="${c.id}" ${checked.has(c.id) ? 'checked' : ''}/>
            <span>${escHtml(c.nome_corso)}</span>
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

  function rowHtml(r) {
    return `
      <tr>
        <td><b>${r.nr_quota ?? '—'}</b></td>
        <td>
          <b>${esc(r.display_name)}</b>
          <div class="meta">${r.ruolo ? esc(r.ruolo) : ''} • CF: ${r.codice_fiscale ?? '—'}</div>
        </td>
        <td>${esc(r.nr_tessera ?? '—')}</td>
        <td>${esc(!r.note || r.note == '' ? '—' : r.note)}</td>
        <td>${esc(r.safeguarding ? '🟢': '❌')}</td>
        <td class="right">
          <button class="icon-btn sm" data-edit="${r.person_id ?? r.id ?? ''}" title="Modifica">✎</button>
        </td>
      </tr>
    `;
  }

  async function openTesseraEditor(row) {

    const form = document.createElement('form');
    form.className = 'form grid-rows';
    form.innerHTML = `
      <div class="form-row cols-3">
            <label class="field">
              <span>Nr tessera</span>
              <input name="nr_tessera" placeholder="..." />
            </label>
            <label class="field">
              <span>Codice fiscale</span>
              <input name="codice_fiscale" placeholder="..." />
            </label>
            <label class="field size-sm">
              <span>Modulo Safeguarding</span>
              <select name="safeguarding">       
                <option value="true">🟢 Ok</option>
                <option value="false">❌ Assente</option>
              </select>
            </label>
      </div>
      
      <label class="field">
        <span>Note</span>
        <input name="note" placeholder="..." />
      </label>

      <div class="row actions">
        <button class="btn ghost" type="button" data-cancel>Annulla</button>
        <span></span>
        <button class="btn primary" type="submit">Salva</button>
      </div>
    `;

    const { close } = openModal({
      title: 'Modifica tessera: ' + row.display_name,
      content: form
    });

    const fill = (values) => {
      Object.entries(values).forEach(([k, v]) => {
        const el = form.querySelector(`[name="${k}"]`);
        if (el) el.value = v ?? '';
      });
    };

    fill({
      nr_tessera: row.nr_tessera ?? '',
      codice_fiscale: row.codice_fiscale ?? '',
      safeguarding: row.safeguarding ?? '',
      note: row.note ?? '',
    });

    form.querySelector('[data-cancel]').addEventListener('click', close);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const safeguarding = String(fd.get('safeguarding') || '').trim();
      const safeguardingBool = safeguarding === '' ? null : safeguarding === 'true';

      const payloadMembership = {
        person_id: row.person_id ?? row.id,
        nr_tessera: String(fd.get('nr_tessera') || '').trim() || null,
        note: String(fd.get('note') || '').trim() || null,
        codice_fiscale: String(fd.get('codice_fiscale') || '').trim() || null,
        safeguarding: safeguardingBool,
      };

      try {
        await Promise.all([
          upsertMembership(payloadMembership.person_id, payloadMembership),
        ]);
        toast('Aggiornato', 'ok');
        close();
        await resetAndLoad();
      } catch (err) {
        toast(err?.message ?? 'Errore salvataggio', 'error');
      }
    });
  }

  async function loadPage() {
    if (loading) return;
    loading = true;
    setStatus('Carico…');

    try {
      const offset = (currentPage - 1) * pageSize;
      const rows = await listPeopleByQuotaPaged({
        q,
        limit: pageSize,
        offset,
        ruolo: role,
        safeguarding,
        withoutCard,
        courseIds: selectedCourseIds
      });
      if (rows.length === 0) {
        body.innerHTML = '';
        setStatus('Nessun risultato.');
        shown = 0;
        updateCount(totalAll);
        cacheRows = [];
      } else {
        cacheRows = rows;
        body.innerHTML = rows.map(rowHtml).join('');
        updateCount(totalAll);
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
      totalAll = await countPeople({ q: '', ruolo: 'ALL', safeguarding: 'ALL' });
      totalFiltered = await countPeople({ q, ruolo: role, safeguarding, withoutCard, courseIds: selectedCourseIds });
      shown = totalFiltered;
      updateCount(totalAll);
      updatePagination();
      await loadPage();
    } catch (e) {
      toast(e?.message ?? 'Errore caricamento', 'error');
      setStatus('Errore.');
    }
  }

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
  safeguardingFilter?.addEventListener('change', async () => {
    safeguarding = safeguardingFilter.value || 'ALL';
    currentPage = 1;
    await resetAndLoad();
  });
  missingToggle?.addEventListener('click', async () => {
    withoutCard = !withoutCard;
    missingToggle.classList.toggle('active', withoutCard);
    missingToggle.setAttribute('aria-pressed', withoutCard ? 'true' : 'false');
    currentPage = 1;
    await resetAndLoad();
  });
  coursesChips?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;

    const id = Number(btn.getAttribute('data-remove'));
    if (!Number.isFinite(id)) return;

    selectedCourseIds = selectedCourseIds.filter(x => Number(x) !== id);
    setBtnCoursesLabel();
    renderSelectedCourseChips();
    currentPage = 1;
    await resetAndLoad();
  });

  btnCourses?.addEventListener('click', async () => {
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

  btnCoursesAll?.addEventListener('click', async () => {
    const all = await ensureCoursesLoaded();
    pendingCourseIds = all.map(c => c.id);
    renderCoursesFilterList(all, pendingCourseIds);
    renderSelectedCourseChips();
  });

  btnCoursesNone?.addEventListener('click', async () => {
    const all = await ensureCoursesLoaded();
    pendingCourseIds = [];
    renderCoursesFilterList(all, pendingCourseIds);
    renderSelectedCourseChips();
  });

  btnCoursesApply?.addEventListener('click', async () => {
    pendingCourseIds = readPendingSelectedFromUI();
    selectedCourseIds = [...pendingCourseIds];
    setBtnCoursesLabel();
    coursesFilterBox.style.display = 'none';
    currentPage = 1;
    await resetAndLoad();
    renderSelectedCourseChips();
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
  body.addEventListener('click', async (e) => {

    const editBtn = e.target.closest('button[data-edit]');
    if (!editBtn) return;
    const personId = editBtn.getAttribute('data-edit');
    const row = (cacheRows ?? []).find(r => (r.person_id ?? r.id) === personId);
    if (!row) {
      toast('Impossibile trovare la tessera selezionata', 'error');
      return;
    }
    try {

      await openTesseraEditor(row);
    } catch (err) {
      toast(err?.message ?? 'Errore apertura modifica', 'error');
    }
  });
  btnExport?.addEventListener('click', async () => {
    try {
      const all = await fetchAllPaged(({ limit, offset }) =>
        listPeopleByQuotaPaged({ q, limit, offset, ruolo: role, safeguarding, withoutCard, courseIds: selectedCourseIds })
      );

      const EXPORT_COLS = [
        'id',
        'display_name',
        'nr_quota',
        'nr_tessera',
        'ruolo',
        'codice_fiscale',
        'safeguarding',
        'note',
        'telefono',
        'email',
        'consenso_whatsapp',
      ];

      const toExport = (all ?? []).map(r => {
        const flat = { ...r };
        const out = {};
        for (const key of EXPORT_COLS) out[key] = flat[key];
        return out;
      });

      exportToXlsx({
        filename: `topdance_tessere_${new Date().toISOString().slice(0, 10)}.xlsx`,
        sheets: [{ name: 'Tessere', rows: toExport }]
      });
    } catch (e) {
      toast(e?.message ?? 'Errore export', 'error');
    }
  });

  setBtnCoursesLabel();
  renderSelectedCourseChips();
  await resetAndLoad();
}
