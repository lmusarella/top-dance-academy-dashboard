import { getDashboardRows } from '../services/api.js';
import { toast } from '../ui/toast.js';
import { openPersonEditor } from './people.js';

function chip(days) {
  if (days == null) return `<span class="chip">—</span>`;
  if (days < 0) return `<span class="chip danger">SCADUTO (${days})</span>`;
  if (days <= 7) return `<span class="chip warn">${days} gg</span>`;
  if (days <= 30) return `<span class="chip info">${days} gg</span>`;
  return `<span class="chip ok">OK</span>`;
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
          <button class="btn primary" id="btnNew">+ Nuovo Socio</button>
          <button class="btn ghost" id="btnReload">Aggiorna</button>
        </div>
      </div>

      <div class="kpis" id="kpis">
        <div class="kpi"><div class="k">Scaduti</div><div class="v danger">—</div></div>
        <div class="kpi"><div class="k">Entro 7 gg</div><div class="v warn">—</div></div>
        <div class="kpi"><div class="k">Entro 30 gg</div><div class="v info">—</div></div>
      </div>
    </section>

    <section class="panel glass">
      <div class="panel-top">
        <div class="search">
          <input id="q" placeholder="Cerca (nome, corso, quota, tel, email)" />
        </div>
      </div>

      <div class="table-wrap">
        <table class="table" id="dashTable">
          <thead>
            <tr>
              <th>Socio</th>
              <th>Certificato</th>
              <th>Contatti</th>
              <th class="right">Azioni</th>
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
  const btnNew = document.querySelector('#btnNew');
  const btnReload = document.querySelector('#btnReload');
  const q = document.querySelector('#q');
  const body = document.querySelector('#dashBody');
  const kpis = document.querySelector('#kpis');

  let rows = [];

  async function load() {
    body.innerHTML = `<tr><td colspan="4" class="muted">Carico dati…</td></tr>`;
    try {
      rows = await getDashboardRows(600);
      computeKpi(rows);
      renderRows(rows);
    } catch (e) {
      toast(e?.message ?? 'Errore lettura dati', 'error');
      body.innerHTML = `<tr><td colspan="4" class="muted">Errore</td></tr>`;
    }
  }

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
    const html = list.map(r => `
      <tr>
        <td>
          <div class="dn">${escapeHtml(r.display_name || '—')}</div>
          <div class="meta">
            ${r.corso ? `<span>${escapeHtml(r.corso)}</span>` : ''}
            ${r.nr_quota ? `<span>• Quota ${r.nr_quota}</span>` : ''}
            ${r.ruolo ? `<span>• ${r.ruolo}</span>` : ''}
          </div>
        </td>

        <td>
          <div class="row-inline">
            <span>${r.scadenza ?? '—'}</span>
            ${chip(r.giorni_rimanenti)}
          </div>
        </td>

        <td>
          <div class="meta">
            ${r.telefono ? `<span>📞 ${escapeHtml(r.telefono)}</span>` : `<span class="muted">📞 —</span>`}
            ${r.email ? `<span>✉️ ${escapeHtml(r.email)}</span>` : `<span class="muted">✉️ —</span>`}
          </div>
        </td>

        <td class="right">
          <button class="btn tiny ghost" data-edit="${r.person_id}">Modifica</button>
          <button class="btn tiny ghost" data-copy="${escapeAttr(r.telefono || '')}" ${r.telefono ? '' : 'disabled'}>Copia tel</button>
        </td>
      </tr>
    `).join('');

    body.innerHTML = html || `<tr><td colspan="4" class="muted">Nessun dato</td></tr>`;
  }

  function applyFilter() {
    const s = (q.value || '').trim().toLowerCase();
    if (!s) return renderRows(rows);

    const filtered = rows.filter(r => {
      const hay = `${r.display_name ?? ''} ${r.corso ?? ''} ${r.nr_quota ?? ''} ${r.telefono ?? ''} ${r.email ?? ''}`.toLowerCase();
      return hay.includes(s);
    });
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

  btnNew?.addEventListener('click', async () => {
    await openPersonEditor({ personId: null, onSaved: load });
  });

  btnReload?.addEventListener('click', load);
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
function escapeAttr(s) {
  return escapeHtml(s).replaceAll('\n', ' ');
}
