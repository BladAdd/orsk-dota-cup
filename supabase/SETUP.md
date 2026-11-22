# Подключение базы (Supabase) — пошагово

Сайт статический (GitHub Pages), вся логика данных — в Supabase. Ниже минимум действий, чтобы всё заработало.

## 0. Фактические параметры подключённого проекта

База уже создана и миграции применены. Параметры:

| Что | Значение |
| --- | --- |
| Project ref | `hxscwzjcxlnvtcejsjlq` |
| Project URL | `https://hxscwzjcxlnvtcejsjlq.supabase.co` |
| Регион | **Europe (Paris), `eu-west-3`** |
| Postgres | 17.11 |
| Direct connection | `db.hxscwzjcxlnvtcejsjlq.supabase.co:5432` — **только IPv6** |
| Pooler, session (для миграций) | `aws-1-eu-west-3.pooler.supabase.com:5432` |
| Pooler, transaction (для приложения) | `aws-1-eu-west-3.pooler.supabase.com:6543` |
| Пользователь пулера | `postgres.hxscwzjcxlnvtcejsjlq` — ref через точку |

**Почему direct connection не работает.** У `db.<ref>.supabase.co` в DNS только
AAAA-запись, IPv4-адреса нет вовсе. Если у провайдера нет IPv6 (частый случай),
подключение на 5432 падает с `could not translate host name ... to address` — и это
выглядит как «база мертва», хотя она жива. Выход — пулер
`aws-1-eu-west-3.pooler.supabase.com`, у него обычные IPv4-адреса.

Для миграций нужен режим **session** (порт 5432): там работают DDL, триггеры и
`alter table ... disable trigger`. Режим transaction (6543) — для приложения,
в нём часть сессионных операций недоступна.

Пример подключения из Python (psycopg2):

```python
psycopg2.connect(
    host="aws-1-eu-west-3.pooler.supabase.com", port=5432, dbname="postgres",
    user="postgres.hxscwzjcxlnvtcejsjlq", password="<пароль базы>",
    sslmode="require")
```

Пароль базы держите вне репозитория: `.env` уже в `.gitignore`. В сам сайт он не
попадает никогда — там нужен только публичный `anon`-ключ (пункт 5).

## 1. Создать проект (если начинаете с нуля)

1. Зайдите на [supabase.com](https://supabase.com) → **New project** (бесплатного тарифа достаточно).
2. Region — любой европейский; текущий проект находится в **Europe (Paris)**.
3. Придумайте пароль базы (сохраните, он понадобится для SQL-подключений напрямую).

## 2. Применить миграции

**Вариант А — одной вставкой.** В проекте откройте **SQL Editor** → **New query**,
вставьте целиком `supabase/all_in_one.sql` и нажмите **Run**. Файл собран из восьми
миграций, идемпотентен: повторный запуск ничего не ломает.

**Вариант Б — по файлам**, строго в порядке нумерации:

1. `supabase/migrations/001_schema.sql` — таблицы, функции, триггеры, публичные представления
2. `supabase/migrations/002_rls.sql` — Row Level Security и защитные триггеры
3. `supabase/migrations/003_seed.sql` — турнир, настройки, спонсор, 14 команд, сетка, новости
4. `supabase/migrations/004_storage.sql` — бакеты Storage и политики доступа к файлам
5. `supabase/migrations/005_local_auth.sql` — регистрация без письма
6. `supabase/migrations/006_admin_lockdown.sql` — админ только по белому списку e-mail
7. `supabase/migrations/007_schedule_and_prizes.sql` — расписание матчей и распределение призовых
8. `supabase/migrations/008_security_and_likes.sql` — публичные представления вместо прямого
   чтения таблиц, лайки через функции, запрет массового удаления отметок

Каждый — кнопкой **Run**. Ошибок быть не должно.

**Если база уже развёрнута раньше.** Перезапустите `006_admin_lockdown.sql` (в первой
версии файла функция `handle_new_user()` ссылалась на несуществующую переменную
`is_first`, из-за чего падала регистрация новых пользователей), затем выполните
`007` и `008`. Отдельно `008` важен: до него анонимный ключ вычитывал телефоны
игроков, служебные заметки и ссылки на лобби, а любой гость мог одним запросом
стереть все лайки.

**Почему сид выключает триггер.** `teams_guard` из `002_rls.sql` принудительно ставит
`status = 'pending'` любой новой команде, созданной не админом. Сид же выполняется из
SQL Editor'а без `auth.uid()`, то есть как раз «не админом», поэтому `003_seed.sql` на
время вставки команд делает `alter table public.teams disable trigger teams_guard`,
затем включает его обратно и доводит статусы до `approved`. Без этой пары строк все 14
команд останутся `pending` и не попадут в `v_teams_public` — на сайте список команд и
сетка будут пустыми.

## 3. Настройки Auth

**Authentication → Providers → Email**: включён.

**«Confirm email» выключен.** `005_local_auth.sql` подтверждает почту триггером на
уровне базы, поэтому регистрация работает без SMTP. Обратная сторона: сайт не проверяет,
что адрес принадлежит регистрирующемуся, — любой может занять чужой e-mail и войти под
ним. Админку это не открывает: роль `admin` выдаётся только адресам из
`public.admin_whitelist` (`006_admin_lockdown.sql`), а подменить роль через клиент
запрещает триггер `profiles_guard`. Но занятый адрес реальному владельцу уже не вернуть,
поэтому непубличные адреса оргкомитета — единственная защита; при желании включайте
Confirm email с SMTP, схема это поддерживает.

**Белый список админов** — заполняется в SQL Editor один раз:

```sql
insert into public.admin_whitelist (email, note)
values ('ваш@адрес', 'председатель оргкомитета')
on conflict (email) do nothing;
```

Проверка после регистрации:

```sql
select u.email, p.role from public.profiles p join auth.users u on u.id = p.id;
```

Ожидается `admin` у белого адреса и `user` у всех остальных. Ошибочно выданные роли
(если 006 применена позже, чем кто-то зарегистрировался первым) понижаются так:

```sql
update public.profiles set role = 'user'
where role = 'admin' and id not in (
  select id from auth.users where email in (select email from public.admin_whitelist));
```

**Authentication → URL Configuration** (нужно только для писем — сброса пароля):
- Site URL: `https://<ваш-логин>.github.io/<имя-репозитория>/`
- Redirect URLs: добавьте туда же `login.html` и `admin/index.html`.

## 4. Хранилище (Storage)

Ничего руками создавать не нужно: `004_storage.sql` создаёт три **публичных** бакета
(`team-logos`, `news-covers`, `photos`), задаёт лимит размера и AVIF-перекодирование,
а заодно проставляет 12 политик на `storage.objects` — по четыре на бакет:

- **select**: всем (`anon`, `authenticated`) — чтение файлов;
- **insert / update / delete**: только `authenticated` с `public.is_admin()` — загрузка и удаление из админки.

Проверить, что всё на месте:

```sql
select id, public, file_size_limit from storage.buckets order by id;
select policyname, cmd, roles from pg_policies
where schemaname = 'storage' and tablename = 'objects' order by 1;
```

Должно быть 3 бакета с `public = true` и 12 политик. Файлы публичного бакета отдаются
по адресу `<Project URL>/storage/v1/object/public/<бакет>/<путь>` без проверки RLS.

Если захотите править политики через дашборд (Storage → бакет → Policies), учтите, что
`004_storage.sql` при повторном запуске пересоздаст их своими именами вида
`"<бакет>: admin insert"`.

## 5. Ключи в сайт

Уже сделано — `assets/js/config.js` заполнен:

```js
window.SITE_CONFIG = {
  supabaseUrl: 'https://hxscwzjcxlnvtcejsjlq.supabase.co',
  supabaseAnonKey: 'sb_publishable_…',
  ...
};
```

Используется **publishable**-ключ (`sb_publishable_…`, новый формат вместо `anon`).
Он публичный по замыслу: лежит в открытом виде в статическом файле, и это нормально —
разграничение делает RLS, а не секретность ключа.

Никогда не вставляйте в `config.js` `secret`-ключ (`sb_secret_…`) или `service_role`:
они обходят RLS целиком. На GitHub Pages такой файл читается кем угодно через
«Просмотр кода страницы», то есть публикация секретного ключа = публикация полного
доступа к базе: чужие почты из `auth.users`, телефоны из `profiles`, удаление
команд и матчей.

Проверка, что ключ рабочий, а не просто вставлен (должно вернуть 14 команд):

```bash
curl -s "https://hxscwzjcxlnvtcejsjlq.supabase.co/rest/v1/v_teams_public?select=name" \
  -H "apikey: sb_publishable_…"
```

Пока ключ был заглушкой `YOUR-ANON-KEY`, `SITE_CONFIG.isConfigured()` возвращал
`false`, клиент Supabase не создавался, а админка показывала жёлтую плашку
«База данных не подключена». Сейчас плашки быть не должно.

`anon`-ключ публичный по замыслу Supabase — его видят все посетители. Безопасность держит **Row Level Security** (`002_rls.sql`), а не секретность ключа. `service_role` ключ в сайт класть **нельзя** никогда.

## 6. Первая учётка администратора — просто зарегистрируйтесь

`005_local_auth.sql` убирает барьер с почтой: адрес подтверждается триггером сразу при
вставке, SMTP не нужен. Роль `admin` при регистрации выдаётся только адресам из
`public.admin_whitelist` (`006_admin_lockdown.sql`) — правило «первый зарегистрировавшийся
становится админом» отменено, потому что адрес из белого списка мог занять кто угодно.

1. Откройте `register.html`, заполните никнейм, ФИО, e-mail и пароль.
2. Сайт сам войдёт под этой учёткой (`Auth.signup` дожимает вход паролем, потому что
   GoTrue при включённом «Confirm email» сессию в ответ на регистрацию не отдаёт).
3. Администратора сразу перебросит в `admin/index.html`; остальным покажется шаг 2 —
   заявка команды.

Сначала внесите свой адрес в белый список (раздел 3) — иначе регистрация даст обычную
роль `user`. Второму члену оргкомитета роль выдают так:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'второй@email.ru');
```

Если админ оказался не тем, роль снимается точечно:

```sql
update public.profiles set role = 'user'
where id = (select id from auth.users where email = 'не тот@адрес');
```

> **Как это устроено.** `autoconfirm_new_user()` — триггер `BEFORE INSERT` на
> `auth.users`, выставляет `email_confirmed_at`. Колонку `confirmed_at` трогать нельзя,
> это GENERATED-колонка. Обнулять `confirmation_token`/`confirmation_sent_at` тоже
> нельзя: после этого GoTrue не может перечитать пользователя и регистрация падает с
> `Database error loading user after sign-up`, откатывая транзакцию целиком.

## 7. Проверка

Что сейчас лежит в базе после применения миграций — сверяйтесь с этим:

```sql
select 'teams' as what, count(*) from public.teams where status = 'approved'
union all select 'bracket_matches', count(*) from public.bracket_matches
union all select 'news_published',  count(*) from public.v_news_public
union all select 'settings',        count(*) from public.settings
union all select 'sponsors',        count(*) from public.sponsors;
```

Ожидается: 14 / 14 / 2 / 4 / 1. Плюс 12 таблиц с включённым RLS, 6 представлений
(5 публичных `v_*_public` и `v_matches_public`), функции `toggle_comment_reaction()`
и `my_reactions()`, 19 триггеров и 3 бакета в Storage.

Сетка: 7 матчей первого раунда с командами, 4 четвертьфинала (четвёртый — бай для
победителя пары 7), 2 полуфинала BO3 и финал BO5; связи `next_match_id`/`next_slot`
проставлены, висячих ссылок и дублей в слотах нет.

**Обратите внимание на даты.** Новости в сиде опубликованы `2026-11-12 10:00` и
`10:30` по Екатеринбургу. `v_news_public` отдаёт только строки с
`published_at <= now()`, так что до этого момента список новостей на сайте по праву
пуст — это отложенная публикация, а не ошибка.

Расписание (миграция `007`, время местное, UTC+5):

| Раунд | День | Время | Формат |
| --- | --- | --- | --- |
| 1 (7 матчей) | 22 ноября | 15:00–21:00, каждый час | BO1 |
| Четвертьфиналы (3 матча + бай) | 23 ноября | 16:00, 17:30, 19:00 | BO1 |
| Полуфиналы | 29 ноября | 15:00, 18:00 | BO3 |
| Финал | 30 ноября | 17:00 | BO5 |

Призовые (`007`): весь фонд 15 000 ₽ — за первое место, приз получает капитан
команды-победителя. Денежных призов за второе и третье место нет; в базе до этой
миграции лежало 15 000 / 0 / 0, и страница «Призовые» показывала 0 ₽ за второе
и третье место.

Дальше по сайту:

- Откройте `admin/index.html` — должен открыться дашборд.
- Создайте новость, одобрите заявку, внесите результат матча — победитель должен сам перейти в следующий раунд.
- Оставьте комментарий с новой учётки: он появится в `admin/comments.html` в очереди «Ожидают» и станет виден на сайте только после одобрения.
- Проверьте закрытый доступ: запрос к `public.team_members` или колонкам `note`/`lobby_url`
  из `bracket_matches` с публичным ключом должен вернуть отказ, а `v_team_members_public`
  и `v_matches_public` — работать.

**Демо-комментарии для предпросмотра вёрстки** лежат в `preview/demo-comments.sql`
и `preview/demo-comments.html`. Папка `preview/` в `.gitignore` и на сайт не попадает;
сам SQL вставляет сообщения со `status = 'pending'`, то есть в очередь премодерации,
а не в публичную ленту.

**Составы команд пока пустые** (`team_members` — 0 строк): в сиде только названия,
теги и города, без игроков. Страница команд из-за этого покажет пустые ростеры.
Заполнять их выдуманными никами не стоит — данные должны быть настоящими; составы
придут либо из заявок через `register.html`, либо их занесёт оргкомитет в админке.
