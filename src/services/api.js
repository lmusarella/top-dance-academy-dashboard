import { supabase } from '../lib/supabaseClient.js';

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    // Supabase a volte ritorna "Auth session missing" se la sessione è già sparita.
    if ((error.message || '').toLowerCase().includes('auth session missing')) return;
    throw error;
  }
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

export async function getMaxQuota() {
  const { data, error } = await supabase
    .from('people')
    .select('nr_quota')
    .order('nr_quota', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.nr_quota ?? null;
}

export async function deletePerson(personId) {
  // cascade cancella contact/membership/certificate
  const { error } = await supabase.from('people').delete().eq('id', personId);
  if (error) throw error;
}

export async function listPeoplePaged({
  q = '',
  limit = 50,
  offset = 0,
  certStatus = 'ALL',
  ruolo = 'ALL',   // ALL | OK | EXPIRED | MISSING | EXPIRED_OR_MISSING
  courseIds = []          // array di int
} = {}) {
  let query = supabase
    .from('v_people_search')
    .select('*')
    .order('display_name', { ascending: true })
    .range(offset, offset + limit - 1);

  // --- filtri certificato ---
  if (certStatus && certStatus !== 'ALL') {
    if (certStatus === 'EXPIRED_OR_MISSING') {
      query = query.in('cert_status', ['EXPIRED', 'MISSING']);
    } else if (certStatus === 'OK') {
      query = query.in('cert_status', ['OK', 'IN_SCADENZA']);
    } else {
      query = query.eq('cert_status', certStatus);
    }
  }

    // --- filtri ruolo ---
  if (ruolo && ruolo !== 'ALL') {
    query = query.eq('ruolo', ruolo);   
  }

  

  // --- filtri corsi (match ANY) ---
  const ids = (courseIds ?? []).map(Number).filter(Number.isFinite);
  if (ids.length) {
    // richiede course_ids int[] nella view
    query = query.overlaps('course_ids', ids);
  }

  // --- ricerca testo ---
  const s = String(q ?? '').trim();
  if (!s) {
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  const isNumeric = /^\d+$/.test(s);
  const sNorm = s.replace(/\s+/g, ' ');

  if (isNumeric) {
    query = query.or(
      `nr_quota.eq.${Number(sNorm)},nr_tessera.ilike.%${sNorm}%,display_name_norm.ilike.%${sNorm}%`
    );
  } else {
    query = query.or(
      `display_name_norm.ilike.%${sNorm}%,nr_tessera.ilike.%${sNorm}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listPeopleByQuotaPaged({
  q = '',
  limit = 60,
  offset = 0,
  ruolo = ''
} = {}) {
  let query = supabase
    .from('v_people_search')
    .select('*')
    .order('nr_quota', { ascending: true, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (ruolo && ruolo !== 'ALL') {
    query = query.eq('ruolo', ruolo);
  }

  const s = String(q ?? '').trim();
  if (!s) {
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  const isNumeric = /^\d+$/.test(s);
  const sNorm = s.replace(/\s+/g, ' ');

  if (isNumeric) {
    query = query.or(
      `nr_quota.eq.${Number(sNorm)},nr_tessera.ilike.%${sNorm}%,display_name_norm.ilike.%${sNorm}%`
    );
  } else {
    query = query.or(
      `display_name_norm.ilike.%${sNorm}%,nr_tessera.ilike.%${sNorm}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}


export async function countPeople({
  q = '',
  certStatus = 'ALL',
  courseIds = [],
  ruolo = 'ALL'
} = {}) {
  let query = supabase
    .from('v_people_search')
    .select('id', { count: 'exact', head: true });

  if (certStatus && certStatus !== 'ALL') {
    if (certStatus === 'EXPIRED_OR_MISSING') {
      query = query.in('cert_status', ['EXPIRED', 'MISSING']);
    } else if (certStatus === 'OK') {
      query = query.in('cert_status', ['OK', 'IN_SCADENZA']);
    } else {
      query = query.eq('cert_status', certStatus);
    }
  }

  const ids = (courseIds ?? []).map(Number).filter(Number.isFinite);
  if (ids.length) query = query.overlaps('course_ids', ids);

  if (ruolo && ruolo !== 'ALL') {
    query = query.eq('ruolo', ruolo);
  }

  const s = String(q ?? '').trim();
  if (s) {
    const isNumeric = /^\d+$/.test(s);
    const sNorm = s.replace(/\s+/g, ' ');

    if (isNumeric) {
      query = query.or(
        `nr_quota.eq.${Number(sNorm)},nr_tessera.ilike.%${sNorm}%,display_name_norm.ilike.%${sNorm}%`
      );
    } else {
      query = query.or(
        `display_name_norm.ilike.%${sNorm}%,nr_tessera.ilike.%${sNorm}%`
      );
    }
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
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

export async function listCoursesWithCounts() {
  const { data, error } = await supabase
    .from('v_courses_with_counts')
    .select('id, nome_corso, tipo_corso, descrizione, istruttori, is_active, participants_count')
    .order('tipo_corso', { ascending: true })
    .order('nome_corso', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listCourseParticipants(courseId) {
  // Richiede FK person_courses.person_id -> people.id
  const { data, error } = await supabase
    .from('person_courses')
    .select('person_id, people(id, display_name, nr_quota, ruolo, corso)')
    .eq('course_id', courseId);

  if (error) throw error;

  return (data ?? [])
    .map(r => r.people)
    .filter(Boolean)
    .sort((a, b) =>
      (a.display_name || '').localeCompare(b.display_name || '', 'it', { sensitivity: 'base' })
    );
}

export async function upsertCourse(payload) {
  const { data, error } = await supabase
    .from('courses')
    .upsert(payload)
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteCourse(courseId) {
  const { error } = await supabase.from('courses').delete().eq('id', courseId);
  if (error) throw error;
}
export async function refreshCourseCount(courseId, countEl) {
  const { data, error } = await supabase
    .from('v_courses_with_counts')
    .select('participants_count')
    .eq('id', courseId)
    .single();

  if (!error && data && countEl) {
    countEl.textContent = `${data.participants_count ?? 0} partecipanti`;
  }
}

export async function removePersonFromCourse(courseId, personId) {
  const { error } = await supabase
    .from('person_courses')
    .delete()
    .eq('course_id', courseId)
    .eq('person_id', personId);

  if (error) throw error;
}


export async function searchPeople(qText, limit = 60) {
  const s = (qText || '').trim();
  let query = supabase
    .from('people')
    .select('id, display_name, nr_quota, ruolo')
    .order('display_name', { ascending: true })
    .limit(limit);

  if (s) {
    // ricerca nome; quota la gestiamo anche come testo (client-side se serve)
    query = query.ilike('display_name', `%${s}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Se l’utente scrive numeri, prova a filtrare anche per nr_quota client-side
  if (s && /^\d+$/.test(s)) {
    return (data ?? []).filter(p => String(p.nr_quota ?? '').includes(s));
  }
  return data ?? [];
}

export async function addPeopleToCourse(courseId, personIds) {
  if (!personIds?.length) return;
  const rows = personIds.map(pid => ({ course_id: courseId, person_id: pid }));
  const { error } = await supabase.from('person_courses').insert(rows, { returning: 'minimal' });
  if (error) throw error;
}
// --- CORSI per PERSONA (person_courses) ---

export async function listCourses({ onlyActive = true } = {}) {
  let q = supabase
    .from('courses')
    .select('id, nome_corso, tipo_corso, is_active')
    .order('tipo_corso', { ascending: true })
    .order('nome_corso', { ascending: true });

  if (onlyActive) q = q.eq('is_active', true);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getPersonCourseIds(personId) {
  const { data, error } = await supabase
    .from('person_courses')
    .select('course_id')
    .eq('person_id', personId);

  if (error) throw error;
  return (data ?? []).map(r => r.course_id);
}

export async function setPersonCourses(personId, desiredCourseIds = []) {
  const current = await getPersonCourseIds(personId);
  const desired = Array.from(new Set((desiredCourseIds ?? []).map(Number)));

  const toAdd = desired.filter(id => !current.includes(id));
  const toRemove = current.filter(id => !desired.includes(id));

  if (toAdd.length) {
    const rows = toAdd.map(course_id => ({ person_id: personId, course_id }));
    const { error } = await supabase.from('person_courses').insert(rows, { returning: 'minimal' });
    if (error) throw error;
  }

  for (const course_id of toRemove) {
    const { error } = await supabase
      .from('person_courses')
      .delete()
      .eq('person_id', personId)
      .eq('course_id', course_id);

    if (error) throw error;
  }
}
