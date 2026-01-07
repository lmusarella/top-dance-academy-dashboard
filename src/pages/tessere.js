import { listPeopleByQuotaPaged } from '../services/api.js';
import { toast } from '../ui/toast.js';

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
      </div>

      <div class="panel-top">
        <div class="search">
          <input id="tessereQ" placeholder="Cerca per nome, numero quota o numero tessera…" />
        </div>
        <div class="meta">Mostrati: <b id="tessereCount">0</b></div>
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
          <div id="tessereSentinel" style="height:1px;"></div>
        </div>
      </div>
    </section>
  </div>
  `;
}

export async function bindTessereEvents() {
  const body = document.querySelector('#tessereBody');
  const status = document.querySelector('#tessereStatus');
  const sentinel = document.querySelector('#tessereSentinel');
  const qInput = document.querySelector('#tessereQ');
  const countEl = document.querySelector('#tessereCount');

  const PAGE = 70;
  let q = '';
  let offset = 0;
  let loading = false;
  let done = false;
  let shown = 0;

  function setStatus(msg) {
    status.textContent = msg;
  }

  function updateCount() {
    if (countEl) countEl.textContent = String(shown);
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

  async function loadNext() {
    if (loading || done) return;
    loading = true;
    setStatus('Carico…');

    try {
      const rows = await listPeopleByQuotaPaged({ q, limit: PAGE, offset });
      if (rows.length === 0) {
        done = true;
        setStatus(offset === 0 ? 'Nessun risultato.' : 'Fine lista.');
      } else {
        body.insertAdjacentHTML('beforeend', rows.map(rowHtml).join(''));
        offset += rows.length;
        shown += rows.length;
        updateCount();
        setStatus(`Mostrati: ${shown}${rows.length < PAGE ? ' • Fine lista.' : ''}`);
        if (rows.length < PAGE) done = true;
      }
    } catch (e) {
      toast(e?.message ?? 'Errore caricamento', 'error');
      setStatus('Errore.');
      done = true;
    } finally {
      loading = false;
    }
  }

  async function resetAndLoad() {
    body.innerHTML = '';
    offset = 0;
    shown = 0;
    done = false;
    updateCount();
    await loadNext();
  }

  const io = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) loadNext();
  }, { root: null, rootMargin: '600px 0px', threshold: 0 });

  io.observe(sentinel);

  let t = null;
  function debounce(fn, ms = 250) {
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  const onSearch = debounce(async () => {
    q = (qInput.value || '').trim();
    await resetAndLoad();
  }, 250);

  qInput.addEventListener('input', onSearch);

  await resetAndLoad();
}
