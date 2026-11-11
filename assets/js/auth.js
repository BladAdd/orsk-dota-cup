/* Сессия и профиль текущего пользователя. */
(function () {
  const { $ } = window.UI;
  let cache = { session: undefined, profile: undefined };
  const listeners = [];

  async function refresh() {
    if (!window.DB.ready) { cache = { session: null, profile: null }; emit(); return cache; }
    const { data } = await window.DB.sb.auth.getSession();
    cache.session = data.session || null;
    cache.profile = null;
    if (cache.session) {
      const { data: p } = await window.DB.sb
        .from('profiles').select('*').eq('id', cache.session.user.id).maybeSingle();
      cache.profile = p || null;
    }
    emit();
    return cache;
  }

  function emit() { listeners.forEach(fn => fn(cache)); }

  async function signup({ email, password, nickname, fullName }) {
    const { data, error } = await window.DB.sb.auth.signUp({
      email, password,
      options: { data: { nickname, full_name: fullName } }
    });
    if (error) throw error;
    await refresh();
    return data;
  }

  async function login(email, password) {
    const { data, error } = await window.DB.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await refresh();
    return data;
  }

  async function logout() {
    if (window.DB.ready) await window.DB.sb.auth.signOut();
    await refresh();
  }

  async function updateProfile(patch) {
    const { error } = await window.DB.sb.from('profiles').update(patch).eq('id', cache.session.user.id);
    if (error) throw error;
    await refresh();
  }

  window.Auth = {
    get session() { return cache.session; },
    get profile() { return cache.profile; },
    get user() { return cache.session && cache.session.user; },
    get isAdmin() { return !!(cache.profile && cache.profile.role === 'admin'); },
    get isStaff() { return !!(cache.profile && ['admin', 'judge'].includes(cache.profile.role)); },
    get isBanned() { return !!(cache.profile && cache.profile.banned_until && new Date(cache.profile.banned_until) > new Date()); },
    refresh, signup, login, logout, updateProfile,
    onChange(fn) { listeners.push(fn); if (cache.session !== undefined) fn(cache); }
  };

  if (window.DB.ready) {
    window.DB.sb.auth.onAuthStateChange(() => refresh());
    refresh();
  } else {
    cache = { session: null, profile: null };
  }
})();
