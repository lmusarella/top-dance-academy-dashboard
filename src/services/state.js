import { supabase } from '../lib/supabaseClient.js';

export const state = {
  session: null,
  route: '',
};

export async function initAuthState() {
  const { data } = await supabase.auth.getSession();
  state.session = data.session;

  supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    // se logout, torna a login
    if (!session  && location.hash !== '#/login') location.hash = '#/login';
  });
}

export function isLoggedIn() {
  return !!state.session;
}
