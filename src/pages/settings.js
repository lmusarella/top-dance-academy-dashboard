import { resetAnnualQuotas } from '../services/api.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

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
                  Azzera la colonna quota per tutti gli iscritti. Operazione irreversibile.
                </div>
              </div>
              <span class="settings-tag danger">Operazione critica</span>
            </div>
            <div class="settings-actions">
              <button class="btn danger" id="resetQuotasBtn">Reset quote</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;
}

export function bindSettingsEvents() {
  const resetBtn = document.querySelector('#resetQuotasBtn');
  if (!resetBtn) return;

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
