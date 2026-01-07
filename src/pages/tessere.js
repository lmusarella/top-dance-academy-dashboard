import { listPeopleByQuotaPaged, countPeople, fetchAllPaged } from '../services/api.js';
import { toast } from '../ui/toast.js';
import { exportToXlsx } from '../ui/exportExcel.js';

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatConsent(value) {
  if (value === true) return 'Sì';
  if (value === false) return 'No';
  return '—';
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
        <div class="search">
          <input id="tessereQ" placeholder="Cerca per nome, numero quota o numero tessera…" />
        </div>
        <div class="meta">Mostrati: <b id="tessereCount">0</b></div>
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
        <div class="loader" id="tessereLoader" hidden>
          <span class="spinner"></span>
          <span>Carico dati…</span>
        </div>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Quota</th>
              <th>Socio</th>
              <th>Tessera</th>
              <th>Contatti</th>
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
  const countEl = document.querySelector('#tessereCount');
  const btnExport = document.querySelector('#btnExportTessere');
  const pageSizeSelect = document.querySelector('#tesserePageSize');
  const pageInfo = document.querySelector('#tesserePageInfo');
  const prevBtn = document.querySelector('#tesserePrev');
  const nextBtn = document.querySelector('#tessereNext');
  const loader = document.querySelector('#tessereLoader');

  const PAGE_DEFAULT = 20;
  let pageSize = Number(pageSizeSelect?.value || PAGE_DEFAULT);
  let currentPage = 1;
  let totalFiltered = 0;
  let q = '';
  let loading = false;
  let shown = 0;

  function setStatus(msg) {
    status.textContent = msg;
  }

  function updateCount() {
    if (countEl) countEl.textContent = String(shown);
  }
  function setLoading(isLoading) {
    if (loader) loader.hidden = !isLoading;
  }
  function updatePagination() {
    const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    if (pageInfo) pageInfo.textContent = `Pagina ${currentPage} / ${totalPages}`;
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
  }

  function rowHtml(r) {
    return `
      <tr>
        <td><b>${r.nr_quota ?? '—'}</b></td>
        <td>
          <b>${esc(r.display_name)}</b>
          <div class="meta">${r.ruolo ? esc(r.ruolo) : ''}</div>
        </td>
        <td>${esc(r.nr_tessera ?? '—')}</td>
        <td>
          <div class="meta">
            ${r.telefono ? `<span>📞 ${esc(r.telefono)}</span>` : `<span class="muted">📞 —</span>`}
          </div>
          <div class="meta">
            ${r.email ? `<span>✉️ ${esc(r.email)}</span>` : `<span class="muted">✉️ —</span>`}
          </div>
          <div class="meta">
            <span>Consenso WhatsApp: ${formatConsent(r.consenso_whatsapp)}</span>
          </div>
        </td>
      </tr>
    `;
  }

  async function loadPage() {
    if (loading) return;
    loading = true;
    setStatus('Carico…');
    setLoading(true);

    try {
      const offset = (currentPage - 1) * pageSize;
      const rows = await listPeopleByQuotaPaged({ q, limit: pageSize, offset });
      if (rows.length === 0) {
        body.innerHTML = '';
        setStatus('Nessun risultato.');
      } else {
        body.innerHTML = rows.map(rowHtml).join('');
        updateCount();
        setStatus(`Pagina ${currentPage}`);
      }
    } catch (e) {
      toast(e?.message ?? 'Errore caricamento', 'error');
      setStatus('Errore.');
    } finally {
      loading = false;
      setLoading(false);
    }
  }

  async function resetAndLoad() {
    body.innerHTML = '';
    totalFiltered = await countPeople({ q });
    shown = totalFiltered;
    updateCount();
    updatePagination();
    await loadPage();
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
  btnExport?.addEventListener('click', async () => {
    try {
      const all = await fetchAllPaged(({ limit, offset }) =>
        listPeopleByQuotaPaged({ q, limit, offset })
      );

      const EXPORT_COLS = [
        'id',
        'display_name',
        'nr_quota',
        'nr_tessera',
        'ruolo',
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

  await resetAndLoad();
}
