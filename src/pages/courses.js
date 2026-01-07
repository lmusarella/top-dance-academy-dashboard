
import { toast } from '../ui/toast.js';
import {
  refreshCourseCount,
  listCoursesWithCounts,
  listCourseParticipants,
  searchPeople,
  addPeopleToCourse,
  removePersonFromCourse,
  upsertCourse,
  deleteCourse
} from '../services/api.js';
import { openModal, confirmDialog } from '../ui/modal.js';
const cacheParticipants = new Map(); // courseId -> people[]
const coursePagination = new Map(); // courseId -> { page, pageSize }

export async function renderCourses() {
  return `
  <div class="stack">
    <section class="panel glass">
      <div class="panel-head">
        <div>
          <div class="h1">Corsi</div>
          
        </div>
        <div class="panel-actions">
          <button class="btn primary" id="btnNewCourse">Nuovo corso</button>
        </div>
      </div>

      <div class="panel-top">
        <div class="search">
          <input id="qCourse" placeholder="Cerca corso…" />
        </div>
        <div class="meta">Risultati: <b id="coursesCount">—</b></div>
        <div class="cert-filter">
          <select id="courseTypeFilter">
            <option value="">Tutti i tipi</option>
            <option value="BALLO">Ballo</option>
            <option value="FITNESS">Fitness</option>
            <option value="ARTI_MARZIALI">Arti marziali</option>
          </select>
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
  const countEl = document.querySelector('#coursesCount');
  const typeSelect = document.querySelector('#courseTypeFilter');

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
          <button class="icon-btn sm" type="button" data-edit="${c.id}" title="Modifica corso">✎</button>
          <button class="icon-btn sm danger" type="button" data-delete="${c.id}" title="Elimina corso">🗑</button>
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

    if (countEl) countEl.textContent = String(filtered.length);
    listEl.innerHTML = filtered.map(courseItem).join('') || `<div class="muted">Nessun corso.</div>`;
  }

  async function openCourseEditor(course = null) {
    const isEdit = !!course;
    const form = document.createElement('form');
    form.className = 'form inline';
    form.innerHTML = `
      <label class="field">
        <span>Nome corso*</span>
        <input name="nome_corso" required placeholder="Nome corso" />
      </label>
      <label class="field size-md">
        <span>Tipo corso</span>
        <input name="tipo_corso" placeholder="BALLO / FITNESS / ARTI_MARZIALI" />
      </label>
      <label class="field">
        <span>Descrizione</span>
        <input name="descrizione" placeholder="Descrizione breve" />
      </label>
      <label class="field size-md">
        <span>Istruttori</span>
        <input name="istruttori" placeholder="Nomi istruttori" />
      </label>
      <label class="field size-xs">
        <span>Attivo</span>
        <select name="is_active">
          <option value="true">Sì</option>
          <option value="false">No</option>
        </select>
      </label>
      <div class="row actions">
        <button class="btn ghost" type="button" data-cancel>Annulla</button>
        <span></span>
        <button class="btn primary" type="submit">Salva</button>
      </div>
    `;

    const { close } = openModal({
      title: isEdit ? 'Modifica corso' : 'Nuovo corso',
      content: form
    });

    const fill = (values) => {
      Object.entries(values).forEach(([k, v]) => {
        const el = form.querySelector(`[name="${k}"]`);
        if (el) el.value = v;
      });
    };

    if (isEdit) {
      fill({
        nome_corso: course.nome_corso ?? '',
        tipo_corso: course.tipo_corso ?? '',
        descrizione: course.descrizione ?? '',
        istruttori: course.istruttori ?? '',
        is_active: String(course.is_active ?? true),
      });
    }

    form.querySelector('[data-cancel]').addEventListener('click', close);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const nome_corso = String(fd.get('nome_corso') || '').trim();
      if (!nome_corso) {
        toast('Nome corso obbligatorio', 'error');
        return;
      }
      const payload = {
        ...(isEdit ? { id: course.id } : {}),
        nome_corso,
        tipo_corso: String(fd.get('tipo_corso') || '').trim() || null,
        descrizione: String(fd.get('descrizione') || '').trim() || null,
        istruttori: String(fd.get('istruttori') || '').trim() || null,
        is_active: String(fd.get('is_active')) === 'true',
      };

      try {
        await upsertCourse(payload);
        toast('Corso salvato', 'ok');
        close();
        await loadCourses();
      } catch (err) {
        toast(err?.message ?? 'Errore salvataggio', 'error');
      }
    });
  }

  function renderParticipants(containerEl, people, courseId) {
    if (!people.length) {
      containerEl.innerHTML = `<div class="muted">Nessun partecipante associato.</div>`;
      return;
    }

    const state = coursePagination.get(courseId) ?? { page: 1, pageSize: 5 };
    const totalPages = Math.max(1, Math.ceil(people.length / state.pageSize));
    state.page = Math.min(state.page, totalPages);
    coursePagination.set(courseId, state);

    const start = (state.page - 1) * state.pageSize;
    const slice = people.slice(start, start + state.pageSize);

    containerEl.innerHTML = `
      <div class="table-controls">
        <div class="pagination">
          <button class="btn ghost" data-part-prev="${courseId}">←</button>
          <div class="page-info">Pagina ${state.page} / ${totalPages}</div>
          <button class="btn ghost" data-part-next="${courseId}">→</button>
        </div>
        <div class="page-size">
          <span>Risultati per pagina</span>
          <select data-part-size="${courseId}">
            <option value="5" ${state.pageSize === 5 ? 'selected' : ''}>5</option>
            <option value="10" ${state.pageSize === 10 ? 'selected' : ''}>10</option>
            <option value="20" ${state.pageSize === 20 ? 'selected' : ''}>20</option>
            <option value="50" ${state.pageSize === 50 ? 'selected' : ''}>50</option>
          </select>
        </div>
      </div>
      <table class="table compact">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Note extra</th>
            <th class="right">Azioni</th>
          </tr>
        </thead>
        <tbody>
          ${slice.map(p => `
            <tr>
              <td>
                <b>${esc(p.display_name)}</b>
                <div class="meta">${p.ruolo ? esc(p.ruolo) : ''} • Quota: ${p.nr_quota ?? '—'}</div>
              </td>
              <td>
                <div class="meta">${p.corso ? esc(p.corso) : ''}</div>
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
      if (!coursePagination.has(courseId)) {
        coursePagination.set(courseId, { page: 1, pageSize: 5 });
      }
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
  typeSelect?.addEventListener('change', () => {
    tipo = typeSelect.value || '';
    applyFilterRender();
  });

  const btnNewCourse = document.querySelector('#btnNewCourse');
  btnNewCourse?.addEventListener('click', () => openCourseEditor());

  // auto-load participants on open (prevede il toggle)
  listEl.addEventListener('click', async (e) => {
    const sizeSelect = e.target.closest('select[data-part-size]');
    if (sizeSelect) {
      const courseId = Number(sizeSelect.getAttribute('data-part-size'));
      const state = coursePagination.get(courseId) ?? { page: 1, pageSize: 5 };
      state.pageSize = Number(sizeSelect.value) || 5;
      state.page = 1;
      coursePagination.set(courseId, state);
      const details = sizeSelect.closest('details.acc-item');
      const containerEl = details.querySelector('[data-participants]');
      const people = cacheParticipants.get(courseId) ?? [];
      renderParticipants(containerEl, people, courseId);
      return;
    }
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
    const prev = e.target.closest('button[data-part-prev]');
    if (prev) {
      e.preventDefault();
      e.stopPropagation();
      const courseId = Number(prev.getAttribute('data-part-prev'));
      const state = coursePagination.get(courseId);
      if (!state) return;
      state.page = Math.max(1, state.page - 1);
      coursePagination.set(courseId, state);
      const details = prev.closest('details.acc-item');
      const containerEl = details.querySelector('[data-participants]');
      const people = cacheParticipants.get(courseId) ?? [];
      renderParticipants(containerEl, people, courseId);
      return;
    }
    const next = e.target.closest('button[data-part-next]');
    if (next) {
      e.preventDefault();
      e.stopPropagation();
      const courseId = Number(next.getAttribute('data-part-next'));
      const state = coursePagination.get(courseId);
      if (!state) return;
      const people = cacheParticipants.get(courseId) ?? [];
      const totalPages = Math.max(1, Math.ceil(people.length / state.pageSize));
      state.page = Math.min(totalPages, state.page + 1);
      coursePagination.set(courseId, state);
      const details = next.closest('details.acc-item');
      const containerEl = details.querySelector('[data-participants]');
      renderParticipants(containerEl, people, courseId);
      return;
    }
    const edit = e.target.closest('button[data-edit]');
    if (edit) {
      e.preventDefault();
      e.stopPropagation();
      const courseId = Number(edit.getAttribute('data-edit'));
      const course = (allCourses ?? []).find(c => Number(c.id) === courseId);
      if (!course) return;
      await openCourseEditor(course);
      return;
    }
    const delCourse = e.target.closest('button[data-delete]');
    if (delCourse) {
      e.preventDefault();
      e.stopPropagation();
      const courseId = Number(delCourse.getAttribute('data-delete'));
      const ok = await confirmDialog({
        title: 'Elimina corso',
        message: 'Vuoi eliminare questo corso?',
        details: 'L’operazione rimuove il corso dalla lista.',
        confirmText: 'Elimina',
        cancelText: 'Annulla',
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteCourse(courseId);
        toast('Corso eliminato', 'ok');
        await loadCourses();
      } catch (err) {
        toast(err?.message ?? 'Errore eliminazione', 'error');
      }
      return;
    }
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
