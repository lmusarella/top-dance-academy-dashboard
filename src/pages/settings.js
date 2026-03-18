import { resetAnnualQuotas } from '../services/api.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';

const SPECIAL_ROLLS_STORAGE_KEY = 'tda_special_skill_rolls_v1';
const SPECIAL_ROLLS_MODS_STORAGE_KEY = 'tda_special_skill_mods_v1';
const SPECIAL_ROLLS_DEFAULT_MODS = { for: 0, des: 0, cos: 0, int: 0, sag: 0, car: 0, bc: 0 };

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function readSpecialRolls() {
  try {
    const raw = localStorage.getItem(SPECIAL_ROLLS_STORAGE_KEY);
    const parsed = JSON.parse(raw ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: String(item?.id ?? '').trim(),
        name: String(item?.name ?? '').trim(),
        formula: String(item?.formula ?? '').trim().toLowerCase(),
      }))
      .filter((item) => item.id && item.name && item.formula);
  } catch {
    return [];
  }
}

function writeSpecialRolls(rows) {
  localStorage.setItem(SPECIAL_ROLLS_STORAGE_KEY, JSON.stringify(rows ?? []));
}

function readSpecialRollMods() {
  try {
    const raw = localStorage.getItem(SPECIAL_ROLLS_MODS_STORAGE_KEY);
    const parsed = JSON.parse(raw ?? '{}');
    return {
      ...SPECIAL_ROLLS_DEFAULT_MODS,
      ...Object.fromEntries(
        Object.entries(parsed ?? {}).map(([k, v]) => [k, Number.isFinite(Number(v)) ? Number(v) : 0])
      ),
    };
  } catch {
    return { ...SPECIAL_ROLLS_DEFAULT_MODS };
  }
}

function writeSpecialRollMods(mods) {
  localStorage.setItem(SPECIAL_ROLLS_MODS_STORAGE_KEY, JSON.stringify(mods ?? SPECIAL_ROLLS_DEFAULT_MODS));
}

function evaluateFormula(formulaRaw, mods) {
  const expr = String(formulaRaw ?? '').trim().toLowerCase();
  if (!expr) return { ok: false, error: 'Formula vuota' };
  if (!/^[a-z0-9_+\-\s]+$/.test(expr)) return { ok: false, error: 'Caratteri non validi' };

  const compact = expr.replace(/\s+/g, '');
  const parts = compact.match(/[+\-]?[^+\-]+/g) ?? [];
  if (!parts.length) return { ok: false, error: 'Formula non valida' };

  let total = 0;
  const details = [];
  for (const part of parts) {
    const sign = part.startsWith('-') ? -1 : 1;
    const token = part.replace(/^[+\-]/, '');
    if (!token) return { ok: false, error: 'Formula non valida' };

    let value = 0;
    if (/^-?\d+$/.test(token)) {
      value = Number(token);
    } else if (/^[a-z_][a-z0-9_]*$/.test(token)) {
      if (!(token in mods)) return { ok: false, error: `Modificatore sconosciuto: ${token}` };
      value = Number(mods[token]) || 0;
    } else {
      return { ok: false, error: `Termine non valido: ${token}` };
    }

    total += sign * value;
    details.push(`${sign === -1 ? '-' : '+'}${token}(${value})`);
  }

  const normalizedDetails = details.join(' ').replace(/^\+/, '');
  return { ok: true, total, details: normalizedDetails };
}

export async function renderSettings() {
  return `
    <div class="stack settings-page">
      <section class="panel glass settings-hero">
        <div class="panel-head">
          <div>
            <div class="h1">Impostazioni</div>
            <div class="h2">Gestione operazioni amministrative</div>
          </div>
        </div>
        <div class="settings-intro muted">
          Controlla le preferenze generali e le operazioni sensibili della piattaforma.
        </div>
      </section>

      <section class="panel glass settings-panel">
        <div class="settings-grid">
          <div class="settings-section">
            <div class="settings-header">
              <div>
                <div class="settings-title">Reset annuale quote</div>
                <div class="settings-desc muted">
                  Azzera la colonna quota per tutti gli iscritti e rimuove le associazioni ai corsi.
                  Operazione irreversibile.
                </div>
              </div>
              <span class="settings-tag danger">Operazione critica</span>
            </div>
            <div class="settings-actions">
              <button class="btn danger" id="resetQuotasBtn">Reset quote</button>
            </div>
          </div>

          <div class="settings-section">
            <div class="settings-header">
              <div>
                <div class="settings-title">Tiri abilità speciali</div>
                <div class="settings-desc muted">
                  Crea tiri abilità custom (es. <code>for + bc + 8</code>) e calcola il tiro con d20.
                </div>
              </div>
              <span class="settings-tag">Custom</span>
            </div>

            <div class="form grid-rows">
              <div class="form-row cols-4" id="specialRollModsRow">
                <label class="field"><span>FOR</span><input type="number" name="for" step="1" value="0" /></label>
                <label class="field"><span>DES</span><input type="number" name="des" step="1" value="0" /></label>
                <label class="field"><span>COS</span><input type="number" name="cos" step="1" value="0" /></label>
                <label class="field"><span>INT</span><input type="number" name="int" step="1" value="0" /></label>
                <label class="field"><span>SAG</span><input type="number" name="sag" step="1" value="0" /></label>
                <label class="field"><span>CAR</span><input type="number" name="car" step="1" value="0" /></label>
                <label class="field"><span>BC</span><input type="number" name="bc" step="1" value="0" /></label>
              </div>
            </div>

            <div class="settings-actions">
              <button class="btn primary" id="btnAddSpecialRoll">+ Nuovo tiro speciale</button>
            </div>

            <div class="table-wrap">
              <table class="table compact">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Formula</th>
                    <th>Mod</th>
                    <th>Ultimo tiro</th>
                    <th class="right">Azioni</th>
                  </tr>
                </thead>
                <tbody id="specialRollsBody"></tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;
}

export function bindSettingsEvents() {
  const resetBtn = document.querySelector('#resetQuotasBtn');
  const addSpecialRollBtn = document.querySelector('#btnAddSpecialRoll');
  const specialRollsBody = document.querySelector('#specialRollsBody');
  const modsRow = document.querySelector('#specialRollModsRow');

  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Attenzione',
        message: 'Effettuando il reset delle quote non sarà possibile recuperare i dati degli iscritti.',
        details: 'Sicuri di procedere?',
        confirmText: 'Sì, resetta',
        cancelText: 'Annulla',
        danger: true,
      });
      if (!confirmed) return;

      resetBtn.disabled = true;
      try {
        await resetAnnualQuotas();
        toast('Quote annuali azzerate', 'ok');
      } catch (e) {
        toast(e?.message ?? 'Errore reset quote', 'error');
      } finally {
        resetBtn.disabled = false;
      }
    });
  }

  if (!addSpecialRollBtn || !specialRollsBody || !modsRow) return;

  let rows = readSpecialRolls();
  let mods = readSpecialRollMods();
  const lastRollById = new Map();

  const setModsUI = () => {
    Object.entries(mods).forEach(([k, v]) => {
      const el = modsRow.querySelector(`input[name="${k}"]`);
      if (el) el.value = String(v ?? 0);
    });
  };

  const updateModsFromUI = () => {
    Object.keys(SPECIAL_ROLLS_DEFAULT_MODS).forEach((key) => {
      const input = modsRow.querySelector(`input[name="${key}"]`);
      mods[key] = Number(input?.value ?? 0) || 0;
    });
    writeSpecialRollMods(mods);
  };

  const renderRows = () => {
    if (!rows.length) {
      specialRollsBody.innerHTML = `<tr><td colspan="5" class="muted">Nessun tiro speciale configurato.</td></tr>`;
      return;
    }

    specialRollsBody.innerHTML = rows.map((row) => {
      const calc = evaluateFormula(row.formula, mods);
      const modifier = calc.ok ? `${calc.total >= 0 ? '+' : ''}${calc.total}` : `⚠️ ${calc.error}`;
      const lastRoll = lastRollById.get(row.id) ?? '—';
      return `
        <tr>
          <td><b>${esc(row.name)}</b></td>
          <td><code>${esc(row.formula)}</code></td>
          <td>${esc(modifier)}</td>
          <td>${esc(lastRoll)}</td>
          <td class="right">
            <button class="btn ghost tiny" type="button" data-roll="${esc(row.id)}">Tira</button>
            <button class="icon-btn sm" type="button" data-edit="${esc(row.id)}" title="Modifica">✎</button>
            <button class="icon-btn sm" type="button" data-del="${esc(row.id)}" title="Elimina">🗑</button>
          </td>
        </tr>
      `;
    }).join('');
  };

  const saveRows = () => {
    writeSpecialRolls(rows);
    renderRows();
  };

  const openSpecialRollEditor = (initial = null) => {
    const form = document.createElement('form');
    form.className = 'form grid-rows';
    form.innerHTML = `
      <div class="form-row cols-1">
        <label class="field">
          <span>Nome tiro abilità speciale</span>
          <input name="name" placeholder="Es. Forgiatura" required />
        </label>
        <label class="field">
          <span>Formula</span>
          <input name="formula" placeholder="Es. for + bc + 8" required />
          <small class="muted">Variabili supportate: for, des, cos, int, sag, car, bc. Usa + e -.</small>
        </label>
      </div>
      <div class="row actions">
        <button class="btn ghost" type="button" data-cancel>Annulla</button>
        <span></span>
        <button class="btn primary" type="submit">Salva</button>
      </div>
    `;

    const { close } = openModal({
      title: initial ? 'Modifica tiro abilità speciale' : 'Nuovo tiro abilità speciale',
      content: form,
    });

    const nameInput = form.querySelector('input[name="name"]');
    const formulaInput = form.querySelector('input[name="formula"]');
    if (nameInput) nameInput.value = initial?.name ?? '';
    if (formulaInput) formulaInput.value = initial?.formula ?? '';

    form.querySelector('[data-cancel]')?.addEventListener('click', close);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const name = String(fd.get('name') ?? '').trim();
      const formula = String(fd.get('formula') ?? '').trim().toLowerCase();
      if (!name || !formula) {
        toast('Nome e formula sono obbligatori', 'error');
        return;
      }

      const validation = evaluateFormula(formula, mods);
      if (!validation.ok) {
        toast(`Formula non valida: ${validation.error}`, 'error');
        return;
      }

      const id = initial?.id ?? `roll_${Date.now()}`;
      const row = { id, name, formula };
      if (initial) {
        rows = rows.map((item) => (item.id === id ? row : item));
      } else {
        rows.push(row);
      }
      saveRows();
      close();
      toast('Tiro speciale salvato', 'ok');
    });
  };

  setModsUI();
  renderRows();

  modsRow.addEventListener('input', () => {
    updateModsFromUI();
    renderRows();
  });

  addSpecialRollBtn.addEventListener('click', () => openSpecialRollEditor());

  specialRollsBody.addEventListener('click', async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const idToRoll = target.closest('[data-roll]')?.getAttribute('data-roll');
    if (idToRoll) {
      const row = rows.find((item) => item.id === idToRoll);
      if (!row) return;
      const calc = evaluateFormula(row.formula, mods);
      if (!calc.ok) {
        toast(`Formula non valida: ${calc.error}`, 'error');
        return;
      }
      const d20 = Math.floor(Math.random() * 20) + 1;
      const total = d20 + calc.total;
      const result = `d20(${d20}) + mod(${calc.total >= 0 ? '+' : ''}${calc.total}) = ${total}`;
      lastRollById.set(idToRoll, result);
      renderRows();
      return;
    }

    const idToEdit = target.closest('[data-edit]')?.getAttribute('data-edit');
    if (idToEdit) {
      const row = rows.find((item) => item.id === idToEdit);
      if (!row) return;
      openSpecialRollEditor(row);
      return;
    }

    const idToDelete = target.closest('[data-del]')?.getAttribute('data-del');
    if (!idToDelete) return;
    const row = rows.find((item) => item.id === idToDelete);
    if (!row) return;

    const confirmed = await confirmDialog({
      title: 'Conferma eliminazione',
      message: `Vuoi eliminare il tiro speciale "${row.name}"?`,
      confirmText: 'Elimina',
      cancelText: 'Annulla',
      danger: true,
    });
    if (!confirmed) return;

    rows = rows.filter((item) => item.id !== idToDelete);
    lastRollById.delete(idToDelete);
    saveRows();
    toast('Tiro speciale eliminato', 'ok');
  });
}
