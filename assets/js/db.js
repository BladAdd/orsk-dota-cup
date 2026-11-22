/* Клиент Supabase + признаки готовности базы. */
(function () {
  const cfg = window.SITE_CONFIG;
  let client = null;

  if (cfg.demoMode && window.DemoData) {
    // Демо-режим: базы нет, запросы обслуживает локальный набор данных
    // (assets/js/demo-data.js). Интерфейс клиента тот же, страницы разницы
    // не видят — но запись никуда не уходит.
    client = window.DemoData.createClient();
    console.info('[демо-режим] Supabase отключён, данные — из assets/js/demo-data.js');
  } else if (cfg.isConfigured() && window.supabase) {
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
      el.textContent = cfg.demoMode
        ? 'Демо-режим: сайт работает без базы, данные берутся из assets/js/demo-data.js.'
        : 'База данных не подключена: вставьте Project URL и anon-ключ в assets/js/config.js (инструкция — supabase/SETUP.md).';
      (host || document.body).prepend(el);
    }
  };
})();
