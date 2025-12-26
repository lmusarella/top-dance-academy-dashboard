import './styles.css';
import { renderShell, bindShellEvents } from './ui/shell.js';
import { initAuthState, isLoggedIn } from './services/state.js';

import { renderLogin, bindLoginEvents } from './pages/login.js';
import { renderDashboard, bindDashboardEvents } from './pages/dashboard.js';
import { renderPeople, bindPeopleEvents } from './pages/people.js';
import { renderCertificates, bindCertificatesEvents } from './pages/certificates.js';


const app = document.querySelector('#app');

const routes = {
  '#/login': { render: renderLogin, bind: bindLoginEvents, auth: false },
  '#/dashboard': { render: renderDashboard, bind: bindDashboardEvents, auth: true },
  '#/people': { render: renderPeople, bind: bindPeopleEvents, auth: true },
  '#/certificates': { render: renderCertificates, bind: bindCertificatesEvents, auth: true },
};

function getRoute() {
  const h = location.hash || '#/dashboard';
  return routes[h] ? h : '#/dashboard';
}

async function navigate() {
  const route = getRoute();
  const def = routes[route];

  if (def.auth && !isLoggedIn()) {
    location.hash = '#/login';
    return;
  }
  if (!def.auth && isLoggedIn() && route === '#/login') {
    location.hash = '#/dashboard';
    return;
  }

  const pageHtml = await def.render();

  // 🔴 QUI LA DIFFERENZA
  if (route === '#/login') {
    app.innerHTML = pageHtml; // NO shell
  } else {
    app.innerHTML = renderShell(pageHtml);
    bindShellEvents();
  }

  await def.bind?.();
}


async function boot() {
  await initAuthState();
  if (!location.hash) location.hash = isLoggedIn() ? '#/dashboard' : '#/login';

  window.addEventListener('hashchange', navigate);
  await navigate();
}

boot();
