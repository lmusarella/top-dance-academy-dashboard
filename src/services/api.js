import { supabase } from '../lib/supabaseClient.js';

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getDashboardRows(limit = 500) {
  const { data, error } = await supabase
    .from('v_cert_scadenze')
    .select('*')
    .order('giorni_rimanenti', { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function listPeople(limit = 800) {
  const { data, error } = await supabase
    .from('people')
    .select('*')
    .order('display_name', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function getPersonFull(personId) {
  const [p, c, m, cert] = await Promise.all([
    supabase.from('people').select('*').eq('id', personId).single(),
    supabase.from('contacts').select('*').eq('person_id', personId).maybeSingle(),
    supabase.from('memberships').select('*').eq('person_id', personId).maybeSingle(),
    supabase.from('certificates').select('*').eq('person_id', personId).maybeSingle(),
  ]);

  if (p.error) throw p.error;
  if (c.error) throw c.error;
  if (m.error) throw m.error;
  if (cert.error) throw cert.error;

  return { person: p.data, contact: c.data, membership: m.data, certificate: cert.data };
}

export async function upsertPerson(payload) {
  const { data, error } = await supabase.from('people').upsert(payload).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function upsertContact(personId, payload) {
  const { error } = await supabase.from('contacts').upsert({ person_id: personId, ...payload });
  if (error) throw error;
}

export async function upsertMembership(personId, payload) {
  const { error } = await supabase.from('memberships').upsert({ person_id: personId, ...payload });
  if (error) throw error;
}

export async function upsertCertificate(personId, payload) {
  const { error } = await supabase.from('certificates').upsert({ person_id: personId, ...payload });
  if (error) throw error;
}

export async function deletePerson(personId) {
  // cascade cancella contact/membership/certificate
  const { error } = await supabase.from('people').delete().eq('id', personId);
  if (error) throw error;
}
export async function listPeoplePaged({ q = '', limit = 50, offset = 0 } = {}) {
  const query = supabase
    .from('v_people_search')
    .select('*')
    .order('display_name', { ascending: true })
    .range(offset, offset + limit - 1);

  const s = (q || '').trim();
  if (s) {
    // OR su nome + tessera
    query.or(`display_name.ilike.%${s}%,nr_tessera.ilike.%${s}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
export async function countPeople({ q = '' } = {}) {
  const query = supabase
    .from('v_people_search')
    .select('id', { count: 'exact', head: true });

  const s = (q || '').trim();
  if (s) query.or(`display_name.ilike.%${s}%,nr_tessera.ilike.%${s}%`);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
export async function exportAllData() {
  const [people, contacts, memberships, certificates] = await Promise.all([
    supabase.from('people').select('*').order('display_name', { ascending: true }),
    supabase.from('contacts').select('*'),
    supabase.from('memberships').select('*'),
    supabase.from('certificates').select('*'),
  ]);

  if (people.error) throw people.error;
  if (contacts.error) throw contacts.error;
  if (memberships.error) throw memberships.error;
  if (certificates.error) throw certificates.error;

  return {
    exported_at: new Date().toISOString(),
    people: people.data ?? [],
    contacts: contacts.data ?? [],
    memberships: memberships.data ?? [],
    certificates: certificates.data ?? [],
  };
}

export async function fetchAllPaged(fetchPageFn, { pageSize = 500 } = {}) {
  let out = [];
  let offset = 0;

  while (true) {
    const chunk = await fetchPageFn({ limit: pageSize, offset });
    out = out.concat(chunk);
    if (chunk.length < pageSize) break;
    offset += chunk.length;
  }
  return out;
}
export async function listCertificatesPaged({
  q = '',
  limit = 70,
  offset = 0,
  sortKey = 'giorni_rimanenti',
  sortAsc = true,
  onlyExpired = false
} = {}) {
  let query = supabase
    .from('v_cert_scadenze')
    .select('*')
    .order(sortKey, { ascending: sortAsc, nullsFirst: false })
    .range(offset, offset + limit - 1);

  const s = (q || '').trim();
  if (s) query = query.ilike('display_name', `%${s}%`);

  if (onlyExpired) query = query.lt('giorni_rimanenti', 0);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
