import { signIn } from '../services/api.js';
import { toast } from '../ui/toast.js';

export function renderLogin() {
  return `
  <div class="center">
    <div class="card glass">
      <div class="card-head">
          <img class="brand-logo" src="./src/assets/tda_logo.jpg" alt="TopDance" />
        <div>
          <div class="h1">Accedi</div>
          <div class="h2">Solo utente autorizzato</div>
        </div>
      </div>

      <form id="loginForm" class="form">
        <label class="field">
          <span>Email</span>
          <input name="email" type="email" autocomplete="username" placeholder="admin@topdance.it" required />
        </label>

        <label class="field">
          <span>Password</span>
          <input name="password" type="password" autocomplete="current-password" placeholder="••••••••" required />
        </label>

        <button class="btn primary" type="submit">Entra</button>
      </form>
    </div>
  </div>
  `;
}

export function bindLoginEvents() {
  const form = document.querySelector('#loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');

    try {
      await signIn(email, password);
      toast('Accesso effettuato', 'ok');
      location.hash = '#/dashboard';
    } catch (err) {
      toast(err?.message ?? 'Login fallito', 'error');
    }
  });
}
