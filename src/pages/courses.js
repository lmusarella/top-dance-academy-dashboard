
import { toast } from '../ui/toast.js';
import {
  refreshCourseCount,
  listCoursesWithCounts,
  listCourseParticipants,
  searchPeople,
  addPeopleToCourse,
  removePersonFromCourse
} from '../services/api.js';
import {  confirmDialog } from '../ui/modal.js';
const cacheParticipants = new Map(); // courseId -> people[]

export async function renderCourses() {
  return `
  <div class="stack">
    <section class="panel glass">
      <div class="panel-head">
        <div>
          <div class="h1">Corsi</div>
          
        </div>
        <div class="panel-actions">
          
        </div>
      </div>

      <div class="panel-top">
        <div class="search">
          <input id="qCourse" placeholder="Cerca corso…" />
        </div>
        <div class="chips">
          <button class="chip-btn active" data-type="">Tutti</button>
          <button class="chip-btn" data-type="BALLO">Ballo</button>
          <button class="chip-btn" data-type="FITNESS">Fitness</button>
          <button class="chip-btn" data-type="ARTI_MARZIALI">Arti marziali</button>
        </div>
      </div>

      <div id="coursesList" class="accordion"></div>
    </section>
  </div>
  `;
}

export async function bindCoursesEvents() {
  const listEl = document.querySelector('#coursesList');
  const qInput = document.querySelector('#qCourse');

  const typeBtns = Array.from(document.querySelectorAll('.chip-btn'));

  let allCourses = [];
  let q = '';
  let tipo = '';



  // ---------- UI helpers ----------
  function esc(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

 function courseItem(c) {
  const teachersTxt = c.istruttori ? esc(c.istruttori) : '—';
  const desc = c.descrizione ? `<div class="meta">${esc(c.descrizione)}</div>` : '';
  const countTxt = `${c.participants_count ?? 0} partecipanti`;

  return `
    <details class="acc-item" data-id="${c.id}">
      <summary class="acc-sum">
        <div class="acc-left">
          <div class="acc-title">${esc(c.nome_corso)}</div>       
        </div>

        <div class="acc-right">
          <div class="acc-teachers">
            <span class="muted">👤</span>
            <span class="acc-teachers-name">${teachersTxt}</span>
          </div>
          <div class="acc-count muted" data-count>${countTxt}</div>
        </div>
      </summary>

      <div class="acc-body">
        ${desc}
        <div class="acc-actions">
          <button class="btn tiny primary" data-add>Aggiungi membri</button>
        </div>
        <div class="participants" data-participants>
          <div class="muted">Caricamento…</div>
        </div>
      </div>
    </details>
  `;
}

  function applyFilterRender() {
    const s = (q || '').trim().toLowerCase();

    let filtered = allCourses;
    if (tipo) filtered = filtered.filter(c => c.tipo_corso === tipo);
    if (s) filtered = filtered.filter(c => (c.nome_corso || '').toLowerCase().includes(s));

    listEl.innerHTML = filtered.map(courseItem).join('') || `<div class="muted">Nessun corso.</div>`;
  }

  function renderParticipants(containerEl, people, courseId) {
    if (!people.length) {
      containerEl.innerHTML = `<div class="muted">Nessun partecipante associato.</div>`;
      return;
    }

    containerEl.innerHTML = `
      <table class="table compact">
        <thead>
          <tr>
            <th>Nome</th>
            
            <th class="right">Azioni</th>
          </tr>
        </thead>
        <tbody>
          ${people.map(p => `
            <tr>
              <td>
                <b>${esc(p.display_name)}</b>
                <div class="meta">${p.ruolo ? esc(p.ruolo) : ''} • Quota: ${p.nr_quota ?? '—'}</div>
              </td>
             
              <td class="right">
                <button class="icon-btn sm danger" data-remove="${p.id}" data-course="${courseId}" title="Rimuovi dal corso">🗑</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  async function loadParticipants(courseId, containerEl, countEl) {
    // cache
    if (cacheParticipants.has(courseId)) {
      const cached = cacheParticipants.get(courseId);
      renderParticipants(containerEl, cached, courseId);
      // count già lo hai dalla view; non lo tocchiamo qui
      return;
    }

    containerEl.innerHTML = `<div class="muted">Carico partecipanti…</div>`;
    try {
      const people = await listCourseParticipants(courseId);
      cacheParticipants.set(courseId, people);
      renderParticipants(containerEl, people, courseId);
      // In caso di disallineamenti, puoi refreshare count:
      // await refreshCourseCount(courseId, countEl);
    } catch (e) {
      toast(e?.message ?? 'Errore caricamento partecipanti', 'error');
      containerEl.innerHTML = `<div class="muted">Errore caricamento partecipanti.</div>`;
    }
  }

  // ---------- Modal: Aggiungi membri ----------
  async function openAddMembersModal(courseId, detailsEl) {
    const existing = cacheParticipants.get(courseId) ?? await listCourseParticipants(courseId);
    cacheParticipants.set(courseId, existing);
    const existingIds = new Set(existing.map(p => p.id));

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal glass">
        <div class="modal-head">
          <div>
            <div class="h1">Aggiungi membri</div>
            <div class="h2">Seleziona persone non ancora associate</div>
          </div>
          <button class="icon-btn sm" data-close title="Chiudi">✕</button>
        </div>

        <div class="panel-top">
          <div class="search">
            <input id="mpQ" placeholder="Cerca per nome o quota…" />
          </div>
          <button class="btn primary" id="mpAdd" disabled>Aggiungi</button>
        </div>

        <div id="mpList" class="mp-list">
          <div class="muted">Scrivi per cercare…</div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const qInput = modal.querySelector('#mpQ');
    const list = modal.querySelector('#mpList');
    const btnAdd = modal.querySelector('#mpAdd');
    const btnClose = modal.querySelector('[data-close]');

    let selected = new Set();

    function close() { modal.remove(); }

    btnClose.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    function renderResults(rows) {
      if (!rows.length) {
        list.innerHTML = `<div class="muted">Nessun risultato.</div>`;
        return;
      }
      list.innerHTML = rows.map(p => `
        <label class="mp-row">
          <input type="checkbox" data-pid="${p.id}">
          <div class="mp-main">
            <div class="mp-name"><b>${esc(p.display_name)}</b></div>
            <div class="mp-meta">Quota: ${p.nr_quota ?? '—'} • ${esc(p.ruolo ?? '—')}</div>
          </div>
        </label>
      `).join('');
    }

    function updateBtn() { btnAdd.disabled = selected.size === 0; }

    // debounce search
    let t = null;
    qInput.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const qText = qInput.value.trim();
        if (!qText) {
          list.innerHTML = `<div class="muted">Scrivi per cercare…</div>`;
          selected.clear();
          updateBtn();
          return;
        }

        list.innerHTML = `<div class="muted">Cerco…</div>`;
        selected.clear();
        updateBtn();

        try {
          const rows = await searchPeople(qText, 80);
          const filtered = rows.filter(p => !existingIds.has(p.id));
          renderResults(filtered);
        } catch (err) {
          toast(err?.message ?? 'Errore ricerca', 'error');
          list.innerHTML = `<div class="muted">Errore ricerca.</div>`;
        }
      }, 220);
    });

    list.addEventListener('change', (e) => {
      const cb = e.target.closest('input[type="checkbox"][data-pid]');
      if (!cb) return;
      const pid = cb.getAttribute('data-pid');
      if (cb.checked) selected.add(pid);
      else selected.delete(pid);
      updateBtn();
    });

    btnAdd.addEventListener('click', async () => {
      const ids = Array.from(selected);
      if (!ids.length) return;

      try {
        await addPeopleToCourse(courseId, ids);
        toast('Membri aggiunti', 'ok');

        // refresh: cache + UI + count
        cacheParticipants.delete(courseId);
        const containerEl = detailsEl.querySelector('[data-participants]');
        const countEl = detailsEl.querySelector('[data-count]');

        await refreshCourseCount(courseId, countEl);
        await loadParticipants(courseId, containerEl, countEl);

        close();
      } catch (err) {
        toast(err?.message ?? 'Errore aggiunta', 'error');
      }
    });

    // focus search
    setTimeout(() => qInput.focus(), 50);
  }

  // ---------- Load initial ----------
  async function loadCourses() {
    listEl.innerHTML = `<div class="muted">Carico corsi…</div>`;
    try {
      allCourses = await listCoursesWithCounts();
      applyFilterRender();
    } catch (e) {
      toast(e?.message ?? 'Errore caricamento corsi', 'error');
      listEl.innerHTML = `<div class="muted">Errore.</div>`;
    }
  }

  // ---------- Events ----------

  // search
  let ts = null;
  qInput.addEventListener('input', () => {
    clearTimeout(ts);
    ts = setTimeout(() => {
      q = qInput.value;
      applyFilterRender();
    }, 200);
  });

  // filter type chips
  typeBtns.forEach(b => {
    b.addEventListener('click', () => {
      typeBtns.forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      tipo = b.getAttribute('data-type') || '';
      applyFilterRender();
    });
  });

  // auto-load participants on open (prevede il toggle)
  listEl.addEventListener('click', async (e) => {
    const summary = e.target.closest('summary.acc-sum');
    if (!summary) return;

    const details = summary.closest('details.acc-item');
    if (!details) return;

    const willOpen = !details.open; // stato dopo il click
    if (!willOpen) return;          // se stai chiudendo, non fare nulla

    const courseId = Number(details.getAttribute('data-id'));
    const containerEl = details.querySelector('[data-participants]');
    const countEl = details.querySelector('[data-count]');

    await loadParticipants(courseId, containerEl, countEl);
  });



  // add/remove actions
  listEl.addEventListener('click', async (e) => {
    // remove
    const rm = e.target.closest('button[data-remove]');
    if (rm) {
      const courseId = Number(rm.getAttribute('data-course'));
      const personId = rm.getAttribute('data-remove');
      const ok = await confirmDialog({
        title: 'Rimuovi partecipante',
        message: 'Vuoi rimuovere questa persona dal corso?',
        details: 'L’operazione rimuove il socio dal corso.',
        confirmText: 'Elimina',
        cancelText: 'Annulla',
        danger: true,
      });
      if (!ok) return;

      try {
        await removePersonFromCourse(courseId, personId);
        toast('Rimosso dal corso', 'ok');

        // refresh cache + participants + count
        cacheParticipants.delete(courseId);
        const details = rm.closest('details.acc-item');
        const containerEl = details.querySelector('[data-participants]');
        const countEl = details.querySelector('[data-count]');
        await refreshCourseCount(courseId, countEl);
        await loadParticipants(courseId, containerEl, countEl);
      } catch (err) {
        toast(err?.message ?? 'Errore rimozione', 'error');
      }
      return;
    }

    // add
    const add = e.target.closest('button[data-add]');
    if (add) {
      const details = add.closest('details.acc-item');
      const courseId = Number(details.getAttribute('data-id'));
      await openAddMembersModal(courseId, details);
    }
  });

  await loadCourses();
}
