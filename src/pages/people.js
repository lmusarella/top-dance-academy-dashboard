import {
  getPersonFull,
  upsertPerson, upsertContact, upsertMembership, upsertCertificate,
  deletePerson, listPeoplePaged, countPeople
} from '../services/api.js';
import { toast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';

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
export async function renderPeople() {
  return `
  <div class="stack">
    <section class="panel glass">
      <div class="panel-head">
        <div>
          <div class="h1">Soci</div>
               
        </div>
        <div class="panel-actions">       
          <button class="btn primary" id="btnNew">Nuovo Socio</button>       
          <button class="btn ghost" id="btnExport">⬇ Export</button>
        </div>
      </div>

      <div class="panel-top">
        <div class="search">
          <input id="peopleQ" placeholder="Cerca per nome, numero quota o numero tessera…" />
        </div>
         <div class="h2">
          Totale soci: <b id="totAll">—</b> • Risultati: <b id="totShown">—</b>
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
          <div id="sentinel" style="height:1px;"></div>
        </div>
      </div>
    </section>
  </div>
  `;
}

export async function bindPeopleEvents() {
  const body = document.querySelector('#peopleBody');
  const status = document.querySelector('#peopleStatus');
  const sentinel = document.querySelector('#sentinel');
  const qInput = document.querySelector('#peopleQ');
  const btnNew = document.querySelector('#btnNew');

  const totAllEl = document.querySelector('#totAll');
  const totShownEl = document.querySelector('#totShown');
  const btnExport = document.querySelector('#btnExport');



  btnExport.addEventListener('click', async () => {
    const all = await fetchAllPaged(({ limit, offset }) =>
      listPeoplePaged({ q: '', limit, offset, sortKey: 'display_name', sortAsc: true })
    );

    exportToXlsx({
      filename: `topdance_people_${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheets: [{ name: 'People', rows: all }]
    });
  });


  const PAGE = 60;

  let q = '';
  let offset = 0;
  let loading = false;
  let done = false;

  function setCounts({ totalAll = null, totalShown = null } = {}) {
    console.log('totalShown', totalShown)
    if (totalAll !== null) totAllEl.textContent = String(totalAll);
    if (totalShown !== null) totShownEl.textContent = String(totalShown);
  }
function chipsHtml(corsiJson) {
  const arr = Array.isArray(corsiJson) ? corsiJson : [];
  if (!arr.length) return `<span class="muted">—</span>`;
  return `
    
      ${arr.map(c => `<span class="meta">${escapeHtml(c.nome)}</span>`).join('')}
   
  `;
}
  function rowHtml(r) {
  
    return `
      <tr>
        <td>
        <b>${esc(r.display_name)}</b>
         <div class="meta">${r.ruolo ? esc(r.ruolo) : ''} • Quota: ${r.nr_quota ?? '—'} • Tessera: ${esc(r.nr_tessera ?? '—')}</div>
        </td>
        <td>
          <div class="meta">
            <span>${r.giorni_rimanenti == null ? '❌ Assente': r.giorni_rimanenti <= 0 ? '🔴 Scaduto': '🟢 Ok'}</span>
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
             ${r.consenso_whatsapp ? `<span>✅ Consenso Whatsapp` : `<span>❌ Consenso Whatsapp`}
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

  async function loadNext() {
    if (loading || done) return;
    loading = true;
    setStatus('Carico…');

    try {
      const rows = await listPeoplePaged({ q, limit: PAGE, offset });
      if (rows.length === 0) {
        done = true;
        setStatus(offset === 0 ? 'Nessun risultato.' : 'Fine lista.');
      } else {
        body.insertAdjacentHTML('beforeend', rows.map(rowHtml).join(''));
        offset += rows.length;
        setStatus(`Mostrati: ${offset}${rows.length < PAGE ? ' • Fine lista.' : ''}`);
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
    done = false;
    await loadNext();

    const totalAll = await countPeople({ q: '' });  // totale soci
    setCounts({ totalAll, totalShown: totalAll });

    if (q) {
      const totalFiltered = await countPeople({ q });
      setCounts({ totalShown: totalFiltered });
      // volendo puoi mostrare anche "Risultati: X" come totale filtrato atteso
      // qui uso lo stesso campo totShown solo per "caricati finora"
      // se vuoi entrambi: aggiungiamo un terzo contatore "Totale ricerca"
    }
  }

  // Infinite scroll con IntersectionObserver (ottimizzato, zero scroll handler)
  const io = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) loadNext();
  }, { root: null, rootMargin: '600px 0px', threshold: 0 });

  io.observe(sentinel);

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
    await resetAndLoad();
  }, 250);

  qInput.addEventListener('input', onSearch);

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
      if (!confirm('Eliminare questa persona?')) return;
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
  form.className = 'form grid2';
  form.innerHTML = `
    <div class="section">Socio</div>

    <label class="field">
      <span>Display name *</span>
      <input name="display_name" required placeholder="COGNOME NOME"/>
    </label>

    <label class="field">
      <span>Nr quota</span>
      <input name="nr_quota" type="number" placeholder="123"/>
    </label>

    <label class="field">
      <span>Corso</span>
      <input name="corso" placeholder="Es. Salsa Base"/>
    </label>

    <label class="field">
      <span>Ruolo</span>
      <select name="ruolo">
        <option value="ALLIEVO">ALLIEVO</option>
        <option value="COLLABORATORE">COLLABORATORE</option>
        <option value="ALTRO">ALTRO</option>
      </select>
    </label>

    <div class="section">Contatti</div>

    <label class="field">
      <span>Telefono</span>
      <input name="telefono" placeholder="+39 ..."/>
    </label>

    <label class="field">
      <span>Email</span>
      <input name="email" type="email" placeholder="nome@email.it"/>
    </label>

    <label class="field">
      <span>Codice fiscale</span>
      <input name="codice_fiscale" placeholder="..."/>
    </label>

    <label class="field">
      <span>Consenso WhatsApp</span>
      <select name="consenso_whatsapp">
        <option value="">—</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    </label>

    <div class="section">Tessera</div>

    <label class="field">
      <span>Nr tessera</span>
      <input name="nr_tessera" placeholder="..."/>
    </label>

    <label class="field">
      <span>Note</span>
      <input name="note" placeholder="..."/>
    </label>

    <div class="section">Certificato</div>

    <label class="field">
      <span>Scadenza (YYYY-MM-DD)</span>
      <input name="scadenza" placeholder="2026-02-14"/>
    </label>

    <label class="field">
      <span>Fonte</span>
      <input name="fonte" placeholder="Import/Manuale"/>
    </label>

    <div class="row span2 actions">
      <button class="btn ghost" type="button" data-cancel>Annulla</button>
      ${isEdit ? `<button class="btn ghost danger" type="button" data-delete>Elimina</button>` : `<span></span>`}
      <button class="btn primary" type="submit">Salva</button>
    </div>
  `;

  const { close } = openModal({
    title: isEdit ? 'Modifica socio' : 'Nuovo socio',
    content: form
  });

  // preload se edit
  if (isEdit) {
    try {
      const full = await getPersonFull(personId);
      fill(form, {
        display_name: full.person.display_name ?? '',
        nr_quota: full.person.nr_quota ?? '',
        corso: full.person.corso ?? '',
        ruolo: full.person.ruolo ?? 'ALLIEVO',

        telefono: full.contact?.telefono ?? '',
        email: full.contact?.email ?? '',
        codice_fiscale: full.contact?.codice_fiscale ?? '',
        consenso_whatsapp: full.contact?.consenso_whatsapp === null || full.contact?.consenso_whatsapp === undefined
          ? ''
          : String(full.contact.consenso_whatsapp),

        nr_tessera: full.membership?.nr_tessera ?? '',
        note: full.membership?.note ?? '',

        scadenza: full.certificate?.scadenza ?? '',
        fonte: full.certificate?.fonte ?? '',
      });
    } catch (e) {
      toast(e?.message ?? 'Errore caricamento', 'error');
    }
  }

  form.querySelector('[data-cancel]').addEventListener('click', close);

  const delBtn = form.querySelector('[data-delete]');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      if (!confirm('Eliminare questa persona?')) return;
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
      corso: strOrNull(fd.get('corso')),
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

      await Promise.all([
        upsertContact(id, {
          telefono: strOrNull(fd.get('telefono')),
          email: strOrNull(fd.get('email')),
          codice_fiscale: strOrNull(fd.get('codice_fiscale')),
          consenso_whatsapp: consensoBool,
        }),
        upsertMembership(id, {
          nr_tessera: strOrNull(fd.get('nr_tessera')),
          note: strOrNull(fd.get('note')),
        }),
        upsertCertificate(id, {
          scadenza: strOrNull(fd.get('scadenza')),
          fonte: strOrNull(fd.get('fonte')),
        }),
      ]);

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