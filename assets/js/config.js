/* Конфигурация сайта.
 * supabaseUrl / supabaseAnonKey вставляются один раз при подключении базы
 * (см. supabase/SETUP.md). anon-ключ публичный по замыслу Supabase,
 * безопасность держит Row Level Security, а не секретность ключа.
 */
window.SITE_CONFIG = {
  // Проект Supabase: ref hxscwzjcxlnvtcejsjlq, регион eu-west-3 (Paris).
  // Миграции применены, подробности и параметры подключения — supabase/SETUP.md.
  supabaseUrl: 'https://hxscwzjcxlnvtcejsjlq.supabase.co',

  // Publishable-ключ (новый формат, замена anon). Публичный по замыслу:
  // его видят все посетители, разграничение держит RLS из 002_rls.sql.
  // secret-ключ (sb_secret_…) и service_role сюда класть нельзя никогда.
  supabaseAnonKey: 'sb_publishable_rD56w-Y8ndum61UC6DAo-g_ln6pBDD1',

  // Часовой пояс турнира и подписи в интерфейсе
  timezone: 'Asia/Yekaterinburg',
  timezoneLabel: 'время екатеринбургское (UTC+5)',

  // Возрастная маркировка по 436-ФЗ
  ageRating: '16+'
};

window.SITE_CONFIG.isConfigured = function () {
  return !/YOUR-PROJECT|YOUR-ANON-KEY/.test(this.supabaseUrl + this.supabaseAnonKey);
};
