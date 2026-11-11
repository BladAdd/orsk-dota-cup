/* Клиент Supabase + признаки готовности базы. */
(function () {
  const cfg = window.SITE_CONFIG;
  let client = null;

  if (cfg.isConfigured() && window.supabase) {
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  window.DB = {
    get sb() { return client; },
    get ready() { return !!client; },

    // Показывает жёлтую плашку, если ключи не вставлены (только для оргкомитета)
    setupBanner(host) {
      if (this.ready) return;
      const el = document.createElement('div');
      el.className = 'setup-banner';
      el.textContent = 'База данных не подключена: вставьте Project URL и anon-ключ в assets/js/config.js (инструкция — supabase/SETUP.md).';
      (host || document.body).prepend(el);
    }
  };
})();
