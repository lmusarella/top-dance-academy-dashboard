import { listCertificatesPaged } from '../services/api.js';
import { toast } from '../ui/toast.js';
import { openPersonEditor } from './people.js';
let CERT_MODE = {
  onlyExpired: false,
  title: 'Certificati'
};

export function setCertificatesMode(mode = {}) {
  CERT_MODE = { ...CERT_MODE, ...mode };
}
function chip(days) {
  if (days == null) return `<span class="chip">—</span>`;
  if (days < 0) return `<span class="chip danger">SCADUTO (${days})</span>`;
  if (days <= 7) return `<span class="chip warn">${days} gg</span>`;
  if (days <= 30) return `<span class="chip info">${days} gg</span>`;
  return `<span class="chip ok">OK</span>`;
}

export async function renderCertificates() {
  return `
  <div class="stack">
    <section class="panel glass">
      <div class="panel-head">
        <div>
          <div class="h1">Certificati</div>       
        </div>
        <div class="panel-actions">
          <button class="btn ghost" id="btnExport">⬇ Export</button>
        </div>
      </div>

      <div class="panel-top">
        <div class="search">
          <input id="q" placeholder="Cerca per nome…" />
        </div>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th class="sortable" data-k="display_name">Socio</th>
              <th class="sortable" data-k="scadenza">Scadenza</th>
              <th class="sortable" data-k="giorni_rimanenti">Giorni</th>
              <th class="right">Azioni</th>
            </tr>
          </thead>
          <tbody id="body"></tbody>
        </table>
        <div class="list-footer">
          <div id="status" class="muted">Pronto.</div>
          <div id="sentinel" style="height:1px;"></div>
        </div>
      </div>
    </section>
  </div>`;
}

export async function bindCertificatesEvents() {
  const body = document.querySelector('#body');
  const status = document.querySelector('#status');
  const sentinel = document.querySelector('#sentinel');
  const qInput = document.querySelector('#q');

  const PAGE = 70;
  let q = '';
  let offset = 0;
  let done = false;
  let loading = false;

  let sortKey = 'giorni_rimanenti';
  let sortAsc = true;

  function setStatus(s){ status.textContent = s; }
  function row(r){
    return `
      <tr>
        <td>
          <div class="dn">${esc(r.display_name)}</div>
        
        </td>
        <td>${r.scadenza ?? '—'}</td>
        <td>${chip(r.giorni_rimanenti)}</td>
        <td class="right">
          <button class="icon-btn sm" data-edit="${r.person_id}" title="Modifica">✎</button>
        </td>
      </tr>`;
  }

  async function loadNext(){
    if (loading || done) return;
    loading = true;
    setStatus('Carico…');

    try{
      const rows = await listCertificatesPaged({ q, limit: PAGE, offset, sortKey, sortAsc, onlyExpired: false });
      if (!rows.length){
        done = true;
        setStatus(offset === 0 ? 'Nessun risultato.' : 'Fine lista.');
      } else {
        body.insertAdjacentHTML('beforeend', rows.map(row).join(''));
        offset += rows.length;
        setStatus(`Mostrati: ${offset}${rows.length < PAGE ? ' • Fine lista.' : ''}`);
        if (rows.length < PAGE) done = true;
      }
    } catch(e){
      toast(e?.message ?? 'Errore', 'error');
      setStatus('Errore.');
      done = true;
    } finally {
      loading = false;
    }
  }

  async function reset(){
    body.innerHTML = '';
    offset = 0;
    done = false;
    await loadNext();
  }

  // infinite
  const io = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) loadNext();
  }, { rootMargin: '600px 0px' });
  io.observe(sentinel);

  // debounce search
  let t=null;
  qInput.addEventListener('input', () => {
    clearTimeout(t);
    t=setTimeout(() => { q = qInput.value.trim(); reset(); }, 250);
  });

  // sort headers
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.getAttribute('data-k');
      if (!k) return;
      if (sortKey === k) sortAsc = !sortAsc;
      else { sortKey = k; sortAsc = true; }
      reset();
    });
  });

  body.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.getAttribute('data-edit');
    if (id) await openPersonEditor({ personId: id, onSaved: reset });
  });

  await reset();
}

function esc(s){
  return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}
