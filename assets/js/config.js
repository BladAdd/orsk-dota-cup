/* Конфигурация сайта.
 * supabaseUrl / supabaseAnonKey вставляются один раз при подключении базы
 * (см. supabase/SETUP.md). anon-ключ публичный по замыслу Supabase,
 * безопасность держит Row Level Security, а не секретность ключа.
 */
window.SITE_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR-ANON-KEY',

  // Часовой пояс турнира и подписи в интерфейсе
  timezone: 'Asia/Yekaterinburg',
  timezoneLabel: 'время екатеринбургское (UTC+5)',

  // Возрастная маркировка по 436-ФЗ
  ageRating: '16+'
};

window.SITE_CONFIG.isConfigured = function () {
  return !/YOUR-PROJECT|YOUR-ANON-KEY/.test(this.supabaseUrl + this.supabaseAnonKey);
};
