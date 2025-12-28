import { getDashboardRows } from '../services/api.js';
import { toast } from '../ui/toast.js';
import { openPersonEditor } from './people.js';
import { exportToXlsx } from '../ui/exportExcel.js';

function chip(days) {
  if (days == null) return `<span >—</span>`;
  if (days < 0) return `<span >🔴 Scaduto (${days})</span>`;
  if (days <= 7) return `<span >🟡 Scade tra ${days} gg</span>`;
  if (days <= 30) return `<span >🔵 Scade tra ${days} gg</span>`;
  return `<span>✅ OK</span>`;
}

export async function renderDashboard() {
  return `
  <div class="stack">
    <section class="hero glass">
      <div class="hero-top">
        <div>
          <div class="h1">Dashboard</div>      
        </div>
        <div class="hero-actions">              
            <button class="btn primary" id="btnReload">Aggiorna</button>
             <button class="btn ghost" id="btnExport">⬇ Export</button>
        </div>
      </div>

      <div class="kpis" id="kpis">
        <button class="kpi" data-kpi="EXPIRED" type="button">
          <div class="k">Scaduti</div><div class="v danger">—</div>
        </button>

        <button class="kpi" data-kpi="DUE7" type="button">
          <div class="k">Entro 7 gg</div><div class="v warn">—</div>
        </button>

        <button class="kpi" data-kpi="DUE30" type="button">
          <div class="k">Entro 30 gg</div><div class="v info">—</div>
        </button>
      </div>

    </section>

    <section class="panel glass">
      <div class="panel-top">
        <div class="search">
          <input id="q" placeholder="Cerca per nome, numero quota o numero tessera…" />
        </div>
         <div class="meta">
            Risultati: <b id="totShown">—</b> / <b id="totAll">—</b>
         </div>
      </div>

      <div class="table-wrap">
        <table class="table" id="dashTable">
          <thead>
            <tr>
              <th>Socio</th>
              <th>Certificato</th>
              <th>Contatti</th>
               <th>Corsi</th>             
            </tr>
          </thead>
          <tbody id="dashBody">
            <tr><td colspan="4" class="muted">Carico dati…</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
  `;
}

export async function bindDashboardEvents() {

  const btnReload = document.querySelector('#btnReload');
  const q = document.querySelector('#q');
  const body = document.querySelector('#dashBody');
  const kpis = document.querySelector('#kpis');
  const btnExport = document.querySelector('#btnExport');
  const totAllEl = document.querySelector('#totAll');
  const totShownEl = document.querySelector('#totShown');
  let kpiFilter = '';
  let rows = [];
  let shown = [];
  function setCounts(totalAll, totalShown) {
    if (totAllEl) totAllEl.textContent = String(totalAll ?? 0);
    if (totShownEl) totShownEl.textContent = String(totalShown ?? 0);
  }
  function matchKpi(r) {
    const d = r?.giorni_rimanenti;
    if (d == null) return false; // in dashboard hai solo scadenza non null, ma safe
    if (kpiFilter === 'EXPIRED') return d < 0;
    if (kpiFilter === 'DUE7') return d >= 0 && d <= 7;
    if (kpiFilter === 'DUE30') return d >= 0 && d <= 30;
    return true; // nessun filtro KPI
  }

  async function load() {
    body.innerHTML = `<tr><td colspan="4" class="muted">Carico dati…</td></tr>`;
    try {
      rows = await getDashboardRows(600);
      computeKpi(rows);
      applyFilter();
    } catch (e) {
      toast(e?.message ?? 'Errore lettura dati', 'error');
      body.innerHTML = `<tr><td colspan="4" class="muted">Errore</td></tr>`;
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
  btnExport?.addEventListener('click', async () => {
    // quali colonne vuoi esportare (ordine incluso)
    const EXPORT_COLS = [
      'person_id',
      'display_name',
      'nr_quota',
      'nr_tessera',
      'ruolo',
      'giorni_rimanenti',
      'scadenza_fmt',
      'telefono',
      'email',
      'consenso_whatsapp',
      'corsi',
      'corso', // la mettiamo noi come stringa
    ];

    const toExport = (shown ?? []).map(r => {
      const flat = {
        ...r,
        corsi: corsiToString(r.corsi), // <-- QUI il fix
      };
      return pick(flat, EXPORT_COLS);
    });

    exportToXlsx({
      filename: `topdance_controllo_certificati_${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheets: [{ name: 'Dashboard', rows: toExport }]
    });
  });
kpis?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-kpi]');
  if (!btn) return;

  const key = btn.getAttribute('data-kpi') || '';

  // toggle: clic su stesso = reset
  kpiFilter = (kpiFilter === key) ? '' : key;

  // UI stato active
  kpis.querySelectorAll('.kpi').forEach(el => el.classList.remove('active'));
  if (kpiFilter) {
    const activeEl = kpis.querySelector(`.kpi[data-kpi="${kpiFilter}"]`);
    activeEl?.classList.add('active');
  }

  applyFilter();
});
  function computeKpi(list) {
    const days = list.map(x => x.giorni_rimanenti).filter(x => x != null);
    const expired = days.filter(d => d < 0).length;
    const due7 = days.filter(d => d >= 0 && d <= 7).length;
    const due30 = days.filter(d => d >= 0 && d <= 30).length;

    const cards = kpis.querySelectorAll('.kpi .v');
    cards[0].textContent = String(expired);
    cards[1].textContent = String(due7);
    cards[2].textContent = String(due30);
  }

  function renderRows(list) {
    shown = Array.isArray(list) ? list : [];
    setCounts(rows.length, shown.length);
    const html = list.map(r => `
      <tr>
        <td>
        <b>${escapeHtml(r.display_name)}</b>
         <div class="meta">${r.ruolo ? escapeHtml(r.ruolo) : ''} • Quota: ${r.nr_quota ?? '—'} • Tessera: ${escapeHtml(r.nr_tessera ?? '—')}</div>
        </td>

        <td>
        <div class="meta">
            ${chip(r.giorni_rimanenti)}
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
             ${r.consenso_whatsapp ? `<span>👍 Consenso Whatsapp` : `<span>👎 Consenso Whatsapp`}
          </div>
          </td>

 <td>${chipsHtml(r.corsi)}</td>
       
      </tr>
    `).join('');

    body.innerHTML = html || `<tr><td colspan="4" class="muted">Nessun dato</td></tr>`;
  }
  function chipsHtml(corsiJson) {
    const arr = Array.isArray(corsiJson) ? corsiJson : [];
    if (!arr.length) return `<span class="muted">—</span>`;
    return `
    
      ${arr.map(c => `<span class="meta">${escapeHtml(c.nome)}</span>`).join('')}
   
  `;
  }
 function applyFilter() {
  const s = (q?.value || '').trim().toLowerCase();

  let filtered = rows;

  // 1) filtro KPI (sempre, anche se input vuoto)
  filtered = filtered.filter(matchKpi);

  // 2) filtro testo (solo se c'è testo)
  if (s) {
    filtered = filtered.filter(r => {
      const hay = `${(r.display_name ?? '').replace(/\s+/g, ' ')}${r.nr_tessera ?? ''}${r.nr_quota ?? ''}`.toLowerCase();
      return hay.includes(s);
    });
  }

  renderRows(filtered);
}

  body.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const editId = btn.getAttribute('data-edit');
    if (editId) {
      await openPersonEditor({ personId: editId, onSaved: load });
      return;
    }

    const tel = btn.getAttribute('data-copy');
    if (tel) {
      try {
        await navigator.clipboard.writeText(tel);
        toast('Telefono copiato', 'ok');
      } catch {
        toast('Impossibile copiare', 'error');
      }
    }
  });


  btnReload?.addEventListener('click', async () => {
    if (q) q.value = '';
     kpiFilter = '';
  kpis?.querySelectorAll('.kpi').forEach(el => el.classList.remove('active'));
    await load();       // load() renderizza già e quindi shown=rows
  });
  q?.addEventListener('input', applyFilter);

  await load();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

