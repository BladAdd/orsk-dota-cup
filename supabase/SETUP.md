# Подключение базы (Supabase) — пошагово

Сайт статический (GitHub Pages), вся логика данных — в Supabase. Ниже минимум действий, чтобы всё заработало.

## 1. Создать проект

1. Зайдите на [supabase.com](https://supabase.com) → **New project** (бесплатного тарифа достаточно).
2. Region выберите **Europe (Frankfurt)** — ближе к игрокам.
3. Придумайте пароль базы (сохраните, он понадобится только если будете лезть в SQL напрямую).

## 2. Применить миграции

В проекте откройте **SQL Editor** → **New query** и выполните по очереди три файла:

1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_rls.sql`
3. `supabase/migrations/003_seed.sql`

Каждый — кнопкой **Run**. Ошибок быть не должно; повторный запуск безопасен.

## 3. Настройки Auth

**Authentication → Providers → Email**: включён.
**Authentication → Sign In / Up**: отключите **«Confirm email»** (для турнира подтверждение почты только мешает; защиту от спама даёт премодерация и RLS).

**Authentication → URL Configuration**:
- Site URL: `https://<ваш-логин>.github.io/<имя-репозитория>/`
- Redirect URLs: добавьте туда же `login.html` и `admin/index.html`.

## 4. Хранилище (Storage)

Создайте три **публичных** бакета (Storage → New bucket, флажок *Public bucket*):

- `team-logos`
- `news-covers`
- `photos`

Политики доступа уже заданы в `002_rls.sql` для таблиц; для бакетов добавьте политику вручную (Storage → бакет → Policies):

- **Select**: `true` (чтение всем) — для всех трёх бакетов.
- **Insert / Update / Delete**: `public.is_admin()` — для всех трёх бакетов.

## 5. Ключи в сайт

**Project Settings → API**: скопируйте

- `Project URL`
- `anon public` key

и вставьте их в `assets/js/config.js`:

```js
window.SITE_CONFIG = {
  supabaseUrl: 'https://xxxxxxxx.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...',
  ...
};
```

`anon`-ключ публичный по замыслу Supabase — его видят все посетители. Безопасность держит **Row Level Security** (`002_rls.sql`), а не секретность ключа. `service_role` ключ в сайт класть **нельзя** никогда.

## 6. Первая учётка администратора

1. На сайте откройте `register.html` и зарегистрируйтесь как обычный пользователь.
2. В Supabase → **SQL Editor** выполните, подставив свой e-mail:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'ваш@email.ru');
```

3. Перезайдите на сайте — появится кнопка «Админка».

## 7. Проверка

- Откройте `admin/index.html` — должен открыться дашборд.
- Создайте новость, одобрите заявку, внесите результат матча — победитель должен сам перейти в следующий раунд.
- Оставьте комментарий с новой учётки: он появится в `admin/comments.html` в очереди «Ожидают» и станет виден на сайте только после одобрения.
