-- =====================================================================
-- Кубок Орска по Dota 2 — ВСЕ миграции одним файлом.
-- Для вставки одной операцией в Supabase: SQL Editor -> New query -> Run.
--
-- Состоит из supabase/migrations/:
--   001_schema.sql   таблицы, функции, триггеры, публичные представления
--   002_rls.sql      Row Level Security и защитные триггеры
--   003_seed.sql     турнир, настройки, спонсор, 14 команд, сетка, новости
--   004_storage.sql  бакеты Storage и политики доступа к файлам
--
-- Файл собран автоматически; правьте исходники в migrations/, не этот файл.
-- Повторный запуск безопасен.
-- =====================================================================


-- ###################################################################
-- ####  001_schema.sql
-- ###################################################################

-- =====================================================================
-- Кубок Орска по Dota 2 — схема базы данных
-- Применяется в Supabase: SQL Editor -> New query -> Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Справочники и роли
-- ---------------------------------------------------------------------

do $$ begin
  create type user_role as enum ('user', 'judge', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type team_status as enum ('pending', 'approved', 'rejected', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type match_status as enum ('pending', 'live', 'finished', 'walkover', 'bye', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type comment_status as enum ('pending', 'approved', 'rejected', 'deleted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type player_role as enum ('carry', 'mid', 'offlane', 'soft_support', 'hard_support', 'coach', 'standin');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Профили (создаются триггером при регистрации в Auth)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          user_role not null default 'user',
  nickname      text not null default '',
  full_name     text not null default '',
  phone         text not null default '',
  vk_url        text not null default '',
  city          text not null default 'Орск',
  avatar_url    text,
  banned_until  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Команды и составы
-- ---------------------------------------------------------------------
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  tag         text not null default '',
  city        text not null default 'Орск',
  logo_url    text,
  captain_id  uuid references public.profiles (id) on delete set null,
  contact_vk  text not null default '',
  status      team_status not null default 'pending',
  admin_note  text not null default '',
  seed_order  int,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (name)
);

create table if not exists public.team_members (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams (id) on delete cascade,
  profile_id   uuid references public.profiles (id) on delete set null,
  nickname     text not null,
  full_name    text not null default '',
  steam_id     text not null default '',
  steam_url    text not null default '',
  role         player_role not null default 'carry',
  phone        text not null default '',
  is_captain   boolean not null default false,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  unique (team_id, nickname)
);

-- ---------------------------------------------------------------------
-- Турнир (одна активная запись)
-- ---------------------------------------------------------------------
create table if not exists public.tournaments (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  subtitle            text not null default '',
  format              text not null default 'single_elimination',
  team_size           int not null default 5,
  max_teams           int not null default 16,
  registration_opens  timestamptz,
  registration_closes timestamptz,
  starts_at           timestamptz,
  ends_at             timestamptz,
  prize_fund          int not null default 15000,
  venue               text not null default '',
  status              text not null default 'registration',
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Сетка: матчи
--   next_match_id / next_match_slot (0 = team_a, 1 = team_b) описывают,
--   куда уезжает победитель; бай-матч (status='bye') проводит победителя
--   дальше автоматически.
-- ---------------------------------------------------------------------
create table if not exists public.bracket_matches (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round         int not null,
  match_index   int not null,
  label         text not null default '',
  best_of       int not null default 1,
  team_a        uuid references public.teams (id) on delete set null,
  team_b        uuid references public.teams (id) on delete set null,
  score_a       int not null default 0,
  score_b       int not null default 0,
  winner_id     uuid references public.teams (id) on delete set null,
  status        match_status not null default 'pending',
  scheduled_at  timestamptz,
  map_name      text not null default '',
  lobby_url     text not null default '',
  vod_url       text not null default '',
  judge_id      uuid references public.profiles (id) on delete set null,
  note          text not null default '',
  next_match_id uuid references public.bracket_matches (id) on delete set null,
  next_slot     int,
  updated_at    timestamptz not null default now(),
  unique (tournament_id, round, match_index)
);

create index if not exists bracket_matches_tournament_idx
  on public.bracket_matches (tournament_id, round, match_index);

-- ---------------------------------------------------------------------
-- Новости
-- ---------------------------------------------------------------------
create table if not exists public.news (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  excerpt      text not null default '',
  body         text not null default '',
  cover_url    text,
  author_id    uuid references public.profiles (id) on delete set null,
  tag          text not null default 'анонс',
  is_published boolean not null default false,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Комментарии (премодерация)
-- ---------------------------------------------------------------------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  page_key    text not null default 'main',   -- 'main' | 'news:<slug>' | 'bracket' ...
  parent_id   uuid references public.comments (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  author_name text not null default '',
  body        text not null,
  status      comment_status not null default 'pending',
  is_pinned   boolean not null default false,
  is_staff    boolean not null default false,
  likes_count int not null default 0,
  ip_hash     text not null default '',
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  check (char_length(body) between 2 and 2000)
);

create index if not exists comments_page_idx on public.comments (page_key, status, created_at);

create table if not exists public.comment_reactions (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  voter_key  text not null,          -- auth uid или отпечаток браузера
  created_at timestamptz not null default now(),
  unique (comment_id, voter_key)
);

create table if not exists public.comment_reports (
  id          uuid primary key default gen_random_uuid(),
  comment_id  uuid not null references public.comments (id) on delete cascade,
  reporter_id uuid references public.profiles (id) on delete set null,
  reason      text not null default '',
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Спонсоры, настройки, журнал действий
-- ---------------------------------------------------------------------
create table if not exists public.sponsors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  tier        text not null default 'title',   -- title | partner | info
  logo_url    text,
  url         text not null default '',
  description text not null default '',
  sort_order  int not null default 0
);

create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null,
  is_public  boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  text not null default '',
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Функции-помощники
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'judge'));
$$;

create or replace function public.is_banned()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and banned_until > now());
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname', ''), coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.bump_likes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.comments set likes_count = likes_count + 1 where id = new.comment_id;
    return new;
  else
    update public.comments set likes_count = greatest(likes_count - 1, 0) where id = old.comment_id;
    return old;
  end if;
end $$;

create or replace function public.write_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec jsonb;
  eid text;
begin
  -- у большинства таблиц ключ id, у settings — key; берём то, что есть
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  eid := coalesce(rec ->> 'id', rec ->> 'key', '');
  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), tg_op, tg_table_name, eid,
          jsonb_build_object('before', case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
                             'after',  case when tg_op = 'DELETE' then null else to_jsonb(new) end));
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- Триггеры
-- ---------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists teams_touch on public.teams;
create trigger teams_touch before update on public.teams
  for each row execute function public.touch_updated_at();

drop trigger if exists news_touch on public.news;
create trigger news_touch before update on public.news
  for each row execute function public.touch_updated_at();

drop trigger if exists matches_touch on public.bracket_matches;
create trigger matches_touch before update on public.bracket_matches
  for each row execute function public.touch_updated_at();

drop trigger if exists reactions_bump on public.comment_reactions;
create trigger reactions_bump after insert or delete on public.comment_reactions
  for each row execute function public.bump_likes();

drop trigger if exists audit_matches on public.bracket_matches;
create trigger audit_matches after insert or update or delete on public.bracket_matches
  for each row execute function public.write_audit();

drop trigger if exists audit_teams on public.teams;
create trigger audit_teams after update on public.teams
  for each row execute function public.write_audit();

drop trigger if exists audit_settings on public.settings;
create trigger audit_settings after insert or update or delete on public.settings
  for each row execute function public.write_audit();

-- ---------------------------------------------------------------------
-- Публичные представления: наружу не выходят телефоны, ФИО и e-mail
-- ---------------------------------------------------------------------
create or replace view public.v_teams_public as
select t.id, t.name, t.tag, t.city, t.logo_url, t.status, t.seed_order, t.created_at
from public.teams t
where t.status = 'approved';

create or replace view public.v_team_members_public as
select m.id, m.team_id, m.nickname, m.steam_url, m.role, m.is_captain, m.sort_order
from public.team_members m
join public.teams t on t.id = m.team_id
where t.status = 'approved';

create or replace view public.v_matches_public as
select m.id, m.round, m.match_index, m.label, m.best_of,
       m.team_a, m.team_b, m.score_a, m.score_b, m.winner_id, m.status,
       m.scheduled_at, m.map_name, m.vod_url, m.note
from public.bracket_matches m;

create or replace view public.v_comments_public as
select c.id, c.page_key, c.parent_id, c.author_id, c.author_name, c.body,
       c.is_pinned, c.is_staff, c.likes_count, c.created_at,
       p.nickname as author_nickname, p.avatar_url as author_avatar
from public.comments c
left join public.profiles p on p.id = c.author_id
where c.status = 'approved';

create or replace view public.v_news_public as
select n.id, n.slug, n.title, n.excerpt, n.body, n.cover_url, n.tag,
       n.published_at, p.nickname as author_nickname
from public.news n
left join public.profiles p on p.id = n.author_id
where n.is_published and (n.published_at is null or n.published_at <= now());


-- ###################################################################
-- ####  002_rls.sql
-- ###################################################################

-- =====================================================================
-- Row Level Security. Единственный рубеж защиты: anon-ключ публичен,
-- поэтому всё разграничение живёт здесь.
-- =====================================================================

alter table public.profiles          enable row level security;
alter table public.teams             enable row level security;
alter table public.team_members      enable row level security;
alter table public.tournaments       enable row level security;
alter table public.bracket_matches   enable row level security;
alter table public.news              enable row level security;
alter table public.comments          enable row level security;
alter table public.comment_reactions enable row level security;
alter table public.comment_reports   enable row level security;
alter table public.sponsors          enable row level security;
alter table public.settings          enable row level security;
alter table public.audit_log         enable row level security;

-- Защита от эскалации: не-админ не может поменять себе роль или снять бан.
create or replace function public.profiles_guard()
returns trigger language plpgsql as $$
begin
  if not public.is_admin() then
    new.role         := old.role;
    new.banned_until := old.banned_until;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- Заявку нельзя создать сразу одобренной: статус ставит только админ.
create or replace function public.teams_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and not public.is_admin() then
    new.status := 'pending';
  end if;
  if tg_op = 'UPDATE' and not public.is_admin() then
    new.status := old.status;
  end if;
  return new;
end $$;

drop trigger if exists teams_guard on public.teams;
create trigger teams_guard before insert or update on public.teams
  for each row execute function public.teams_guard();

-- Комментарий от посетителя всегда уходит на премодерацию.
create or replace function public.comments_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and not public.is_admin() then
    new.status    := 'pending';
    new.is_pinned := false;
    new.is_staff  := public.is_staff();
  end if;
  if tg_op = 'UPDATE' and not public.is_admin() then
    new.status    := old.status;
    new.is_pinned := old.is_pinned;
  end if;
  return new;
end $$;

drop trigger if exists comments_guard on public.comments;
create trigger comments_guard before insert or update on public.comments
  for each row execute function public.comments_guard();

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- teams / team_members
-- ---------------------------------------------------------------------
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select to anon, authenticated
  using (status = 'approved' or public.is_staff()
         or (auth.uid() is not null and captain_id = auth.uid()));

drop policy if exists teams_insert on public.teams;
create policy teams_insert on public.teams for insert to authenticated
  with check (not public.is_banned() and captain_id = auth.uid());

drop policy if exists teams_update on public.teams;
create policy teams_update on public.teams for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists teams_delete on public.teams;
create policy teams_delete on public.teams for delete to authenticated
  using (public.is_admin());

drop policy if exists members_select on public.team_members;
create policy members_select on public.team_members for select to anon, authenticated
  using (public.is_staff()
         or exists (select 1 from public.teams t
                    where t.id = team_id
                      and (t.status = 'approved' or t.captain_id = auth.uid())));

drop policy if exists members_insert on public.team_members;
create policy members_insert on public.team_members for insert to authenticated
  with check (public.is_admin()
              or exists (select 1 from public.teams t
                         where t.id = team_id and t.captain_id = auth.uid()));

drop policy if exists members_update on public.team_members;
create policy members_update on public.team_members for update to authenticated
  using (public.is_admin()
         or exists (select 1 from public.teams t
                    where t.id = team_id and t.captain_id = auth.uid()));

drop policy if exists members_delete on public.team_members;
create policy members_delete on public.team_members for delete to authenticated
  using (public.is_admin()
         or exists (select 1 from public.teams t
                    where t.id = team_id and t.captain_id = auth.uid()));

-- ---------------------------------------------------------------------
-- tournaments / bracket_matches
-- ---------------------------------------------------------------------
drop policy if exists tournaments_select on public.tournaments;
create policy tournaments_select on public.tournaments for select to anon, authenticated
  using (true);

drop policy if exists tournaments_write on public.tournaments;
create policy tournaments_write on public.tournaments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists matches_select on public.bracket_matches;
create policy matches_select on public.bracket_matches for select to anon, authenticated
  using (true);

drop policy if exists matches_write on public.bracket_matches;
create policy matches_write on public.bracket_matches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- news
-- ---------------------------------------------------------------------
drop policy if exists news_select on public.news;
create policy news_select on public.news for select to anon, authenticated
  using (is_published or public.is_staff());

drop policy if exists news_write on public.news;
create policy news_write on public.news for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- comments / reactions / reports
-- ---------------------------------------------------------------------
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to anon, authenticated
  using (status = 'approved' or author_id = auth.uid() or public.is_staff());

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (not public.is_banned() and author_id = auth.uid());

drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments for update to authenticated
  using (public.is_admin() or (author_id = auth.uid() and status <> 'deleted'))
  with check (public.is_admin() or author_id = auth.uid());

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated
  using (public.is_admin() or author_id = auth.uid());

drop policy if exists reactions_select on public.comment_reactions;
create policy reactions_select on public.comment_reactions for select to anon, authenticated
  using (true);

drop policy if exists reactions_insert on public.comment_reactions;
create policy reactions_insert on public.comment_reactions for insert to anon, authenticated
  with check (not public.is_banned());

drop policy if exists reactions_delete on public.comment_reactions;
create policy reactions_delete on public.comment_reactions for delete to anon, authenticated
  using (voter_key = coalesce(auth.uid()::text, voter_key));

drop policy if exists reports_select on public.comment_reports;
create policy reports_select on public.comment_reports for select to authenticated
  using (public.is_staff());

drop policy if exists reports_insert on public.comment_reports;
create policy reports_insert on public.comment_reports for insert to anon, authenticated
  with check (true);

drop policy if exists reports_update on public.comment_reports;
create policy reports_update on public.comment_reports for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------
-- sponsors / settings / audit_log
-- ---------------------------------------------------------------------
drop policy if exists sponsors_select on public.sponsors;
create policy sponsors_select on public.sponsors for select to anon, authenticated
  using (true);

drop policy if exists sponsors_write on public.sponsors;
create policy sponsors_write on public.sponsors for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select to anon, authenticated
  using (is_public or public.is_staff());

drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using (public.is_admin());


-- ###################################################################
-- ####  003_seed.sql
-- ###################################################################

-- =====================================================================
-- Стартовые данные: турнир, настройки, спонсор, 14 команд и сетка
-- (пары первого раунда — как в рабочей сетке оргкомитета).
-- Повторный запуск безопасен: всё через ON CONFLICT DO NOTHING.
-- =====================================================================

-- Турнир -------------------------------------------------------------
insert into public.tournaments
  (id, title, subtitle, format, team_size, max_teams,
   registration_opens, registration_closes, starts_at, ends_at,
   prize_fund, venue, status)
values
  ('90000000-0000-4000-8000-000000000001',
   'Кубок Орска по Dota 2',
   'Открытый любительский турнир при поддержке Орского городского отделения КПРФ',
   'single_elimination', 5, 16,
   '2026-11-12 10:00:00+05', '2026-11-25 23:59:00+05',
   '2026-11-28 12:00:00+05', '2026-12-06 20:00:00+05',
   15000, 'Онлайн (серверы EU West), финал — Орск', 'registration')
on conflict (id) do nothing;

-- Настройки (is_public по умолчанию true) ----------------------------
insert into public.settings (key, value) values
  ('site', jsonb_build_object(
     'title', 'Кубок Орска по Dota 2',
     'short_title', 'Кубок Орска',
     'tagline', '14 команд. Одна сетка. 15 000 ₽ призовых.',
     'age_rating', '16+',
     'timezone', 'Asia/Yekaterinburg',
     'timezone_label', 'время екатеринбургское (UTC+5)')),
  ('contacts', jsonb_build_object(
     'vk', '', 'telegram', '', 'discord', '',
     'email', 'orsk.dota.cup@example.org',
     'judge', 'Судейская бригада отвечает в Discord турнира в канале #судьи')),
  ('prize', jsonb_build_object(
     'total', 15000,
     'split', jsonb_build_array(
        jsonb_build_object('place', 1, 'amount', 9000),
        jsonb_build_object('place', 2, 'amount', 4000),
        jsonb_build_object('place', 3, 'amount', 2000)))),
  ('social', jsonb_build_object('og_image', 'assets/img/og-image.png'))
on conflict (key) do update set value = excluded.value;

-- Спонсор ------------------------------------------------------------
insert into public.sponsors (id, name, tier, logo_url, url, description, sort_order)
values
  ('80000000-0000-4000-8000-000000000001',
   'КПРФ · Орск', 'title', 'assets/img/kprf-lockup.svg', '',
   'Орское городское отделение КПРФ — генеральный спонсор турнира: призовой фонд, площадка финала и награждение.', 0)
on conflict (id) do nothing;

-- Команды (14, пары первого раунда) ----------------------------------
-- Триггер teams_guard из 002_rls.sql принудительно ставит status='pending'
-- для всех вставок не от админа, а сид выполняется из SQL Editor'а без
-- auth.uid(). Поэтому на время сида триггер выключаем и возвращаем обратно.
alter table public.teams disable trigger teams_guard;

insert into public.teams (id, name, tag, city, status, seed_order) values
  ('11111111-1111-4111-8111-111111111101', '322 Team',            '322',   'Орск',      'approved', 1),
  ('11111111-1111-4111-8111-111111111102', 'ТОБОЛЬСКИЕ ПЕЛЬМЕНИ', 'ТБЛП',  'Тобольск',  'approved', 2),
  ('11111111-1111-4111-8111-111111111103', 'Barni team',          'BRNI',  'Орск',      'approved', 3),
  ('11111111-1111-4111-8111-111111111104', 'Team spivon',         'SPVN',  'Орск',      'approved', 4),
  ('11111111-1111-4111-8111-111111111105', 'Gubka Team',          'GUBK',  'Новотроицк','approved', 5),
  ('11111111-1111-4111-8111-111111111106', 'Одетые',              'ОДЕТ',  'Орск',      'approved', 6),
  ('11111111-1111-4111-8111-111111111107', 'ПИСТОЛЕТОВ Team',     'ПСТЛ',  'Орск',      'approved', 7),
  ('11111111-1111-4111-8111-111111111108', 'Beton legions',       'BETN',  'Оренбург',  'approved', 8),
  ('11111111-1111-4111-8111-111111111109', 'Freaks team',         'FRKS',  'Орск',      'approved', 9),
  ('11111111-1111-4111-8111-111111111110', 'Team иосип',          'ИОСП',  'Орск',      'approved', 10),
  ('11111111-1111-4111-8111-111111111111', 'Matvei Badyak',       'MTVB',  'Гай',       'approved', 11),
  ('11111111-1111-4111-8111-111111111112', 'The Beatles',         'BTLS',  'Орск',      'approved', 12),
  ('11111111-1111-4111-8111-111111111113', 'Бургер мопсы',        'БРГМ',  'Орск',      'approved', 13),
  ('11111111-1111-4111-8111-111111111114', 'Rapira team',         'RPR',   'Новотроицк','approved', 14)
on conflict (id) do nothing;

-- Повторный запуск сида должен лечить уже существующие строки:
-- on conflict do nothing их не трогает, а status мог остаться 'pending'.
update public.teams set status = 'approved'
where seed_order between 1 and 14 and status <> 'approved';

alter table public.teams enable trigger teams_guard;

-- Сетка --------------------------------------------------------------
-- Матчи вставляются без next_match_id (ссылки на ещё не созданные строки
-- следующего раунда нарушили бы внешний ключ); связи проставляются ниже
-- одним UPDATE, когда все раунды уже существуют.
-- Раунд 1 (BO1), 28 ноября
insert into public.bracket_matches
  (id, tournament_id, round, match_index, label, best_of, team_a, team_b, status, scheduled_at) values
  ('aaaaaaaa-0000-4000-8000-000000000101', '90000000-0000-4000-8000-000000000001', 1, 1, 'Раунд 1 · матч 1', 1,
     '11111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111102', 'pending', '2026-11-28 12:00:00+05'),
  ('aaaaaaaa-0000-4000-8000-000000000102', '90000000-0000-4000-8000-000000000001', 1, 2, 'Раунд 1 · матч 2', 1,
     '11111111-1111-4111-8111-111111111103', '11111111-1111-4111-8111-111111111104', 'pending', '2026-11-28 13:00:00+05'),
  ('aaaaaaaa-0000-4000-8000-000000000103', '90000000-0000-4000-8000-000000000001', 1, 3, 'Раунд 1 · матч 3', 1,
     '11111111-1111-4111-8111-111111111105', '11111111-1111-4111-8111-111111111106', 'pending', '2026-11-28 14:00:00+05'),
  ('aaaaaaaa-0000-4000-8000-000000000104', '90000000-0000-4000-8000-000000000001', 1, 4, 'Раунд 1 · матч 4', 1,
     '11111111-1111-4111-8111-111111111107', '11111111-1111-4111-8111-111111111108', 'pending', '2026-11-28 15:00:00+05'),
  ('aaaaaaaa-0000-4000-8000-000000000105', '90000000-0000-4000-8000-000000000001', 1, 5, 'Раунд 1 · матч 5', 1,
     '11111111-1111-4111-8111-111111111109', '11111111-1111-4111-8111-111111111110', 'pending', '2026-11-28 16:00:00+05'),
  ('aaaaaaaa-0000-4000-8000-000000000106', '90000000-0000-4000-8000-000000000001', 1, 6, 'Раунд 1 · матч 6', 1,
     '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111112', 'pending', '2026-11-28 17:00:00+05'),
  ('aaaaaaaa-0000-4000-8000-000000000107', '90000000-0000-4000-8000-000000000001', 1, 7, 'Раунд 1 · матч 7', 1,
     '11111111-1111-4111-8111-111111111113', '11111111-1111-4111-8111-111111111114', 'pending', '2026-11-28 18:00:00+05')
on conflict (id) do nothing;

-- Четвертьфиналы (BO1), 29 ноября; матч 4 — бай для победителя 7-й пары
insert into public.bracket_matches
  (id, tournament_id, round, match_index, label, best_of, status, scheduled_at) values
  ('aaaaaaaa-0000-4000-8000-000000000201', '90000000-0000-4000-8000-000000000001', 2, 1, 'Четвертьфинал 1', 1, 'pending', '2026-11-29 12:00:00+05'),
  ('aaaaaaaa-0000-4000-8000-000000000202', '90000000-0000-4000-8000-000000000001', 2, 2, 'Четвертьфинал 2', 1, 'pending', '2026-11-29 13:30:00+05'),
  ('aaaaaaaa-0000-4000-8000-000000000203', '90000000-0000-4000-8000-000000000001', 2, 3, 'Четвертьфинал 3', 1, 'pending', '2026-11-29 15:00:00+05'),
  ('aaaaaaaa-0000-4000-8000-000000000204', '90000000-0000-4000-8000-000000000001', 2, 4, 'Бай',             1, 'bye',     null)
on conflict (id) do nothing;

-- Полуфиналы (BO3), 5 декабря
insert into public.bracket_matches
  (id, tournament_id, round, match_index, label, best_of, status, scheduled_at) values
  ('aaaaaaaa-0000-4000-8000-000000000301', '90000000-0000-4000-8000-000000000001', 3, 1, 'Полуфинал 1', 3, 'pending', '2026-12-05 14:00:00+05'),
  ('aaaaaaaa-0000-4000-8000-000000000302', '90000000-0000-4000-8000-000000000001', 3, 2, 'Полуфинал 2', 3, 'pending', '2026-12-05 17:00:00+05')
on conflict (id) do nothing;

-- Финал (BO5), 6 декабря
insert into public.bracket_matches
  (id, tournament_id, round, match_index, label, best_of, status, scheduled_at) values
  ('aaaaaaaa-0000-4000-8000-000000000401', '90000000-0000-4000-8000-000000000001', 4, 1, 'Финал', 5, 'pending', '2026-12-06 16:00:00+05')
on conflict (id) do nothing;

-- Связи «победитель уходит в следующий раунд» -------------------------
update public.bracket_matches set next_match_id = v.nm, next_slot = v.ns
from (values
  ('aaaaaaaa-0000-4000-8000-000000000101'::uuid, 'aaaaaaaa-0000-4000-8000-000000000201'::uuid, 0),
  ('aaaaaaaa-0000-4000-8000-000000000102'::uuid, 'aaaaaaaa-0000-4000-8000-000000000201'::uuid, 1),
  ('aaaaaaaa-0000-4000-8000-000000000103'::uuid, 'aaaaaaaa-0000-4000-8000-000000000202'::uuid, 0),
  ('aaaaaaaa-0000-4000-8000-000000000104'::uuid, 'aaaaaaaa-0000-4000-8000-000000000202'::uuid, 1),
  ('aaaaaaaa-0000-4000-8000-000000000105'::uuid, 'aaaaaaaa-0000-4000-8000-000000000203'::uuid, 0),
  ('aaaaaaaa-0000-4000-8000-000000000106'::uuid, 'aaaaaaaa-0000-4000-8000-000000000203'::uuid, 1),
  ('aaaaaaaa-0000-4000-8000-000000000107'::uuid, 'aaaaaaaa-0000-4000-8000-000000000204'::uuid, 0),
  ('aaaaaaaa-0000-4000-8000-000000000201'::uuid, 'aaaaaaaa-0000-4000-8000-000000000301'::uuid, 0),
  ('aaaaaaaa-0000-4000-8000-000000000202'::uuid, 'aaaaaaaa-0000-4000-8000-000000000301'::uuid, 1),
  ('aaaaaaaa-0000-4000-8000-000000000203'::uuid, 'aaaaaaaa-0000-4000-8000-000000000302'::uuid, 0),
  ('aaaaaaaa-0000-4000-8000-000000000204'::uuid, 'aaaaaaaa-0000-4000-8000-000000000302'::uuid, 1),
  ('aaaaaaaa-0000-4000-8000-000000000301'::uuid, 'aaaaaaaa-0000-4000-8000-000000000401'::uuid, 0),
  ('aaaaaaaa-0000-4000-8000-000000000302'::uuid, 'aaaaaaaa-0000-4000-8000-000000000401'::uuid, 1)
) as v(id, nm, ns)
where public.bracket_matches.id = v.id;

-- Новости оргкомитета -------------------------------------------------
insert into public.news (id, slug, title, excerpt, body, tag, is_published, published_at) values
  ('70000000-0000-4000-8000-000000000001', 'otkryta-registraciya',
   'Открыта регистрация на Кубок Орска по Dota 2',
   'Принимаем заявки от любительских команд Орска, Новотроицка, Гая и всего Оренбуржья. Призовой фонд — 15 000 ₽.',
   'Оргкомитет Кубка Орска открывает приём заявок. Турнир пройдёт в формате single elimination: 14 команд уже в сетке, ещё две заявки мы доберём из листа ожидания, если кто-то снимется.

Как подать заявку: капитан регистрируется на сайте, заполняет состав из пяти игроков и запасного, указывает Steam ID каждого. Заявка попадает к оргкомитету на проверку — мы сверяем аккаунты и подтверждаем команду в течение суток.

Призовой фонд 15 000 ₽ предоставлен Орским городским отделением КПРФ и делится так: 9 000 ₽ за первое место, 4 000 ₽ за второе, 2 000 ₽ за третье. Награждение — на финале в Орске.

Матчи играем онлайн на серверах EU West, финал и матч за третье место — на площадке в Орске. Расписание первого раунда уже опубликовано в разделе «Сетка».',
   'анонс', true, '2026-11-12 10:00:00+05'),
  ('70000000-0000-4000-8000-000000000002', 'reglament-i-format',
   'Регламент: формат, паузы и замены',
   'Коротко о том, как играем: BO1 до полуфиналов, BO3 в полуфиналах, BO5 в финале, технические паузы и порядок замен.',
   'Публикуем базовый регламент, чтобы к старту у команд не осталось вопросов.

Формат. Single elimination, 14 команд. Раунд 1 и четвертьфиналы — BO1, полуфиналы — BO3, финал — BO5. Победитель 7-й пары первого раунда получает бай в четвертьфинале.

Серверы и лобби. Матчи играем на серверах EU West (пинг по Орску около 45 мс). Лобби создаёт судья за 15 минут до старта, капитаны получают ссылку в Discord. Режим Captains Mode, сторона первой карты определяется монеткой в лобби, дальше — по стандартной схеме чередования.

Паузы. Тактическая пауза — до 5 минут на команду за карту, только в мёртвое время. Техническая пауза при дисконнекте — до 10 минут; если игрок не вернулся, команда доигрывает вчетвером или берёт замену из заявленного состава.

Замены. Менять игрока между картами можно только на заявленного запасного и только с согласия судьи. Незаявленный игрок в лобби — техническое поражение на карте.

Поведение. Оскорбления в ол-чате, смурфы и буст-аккаунты дисквалифицируют команду без разбора. Спорные ситуации решает судейская бригада, решение окончательно.

Полный текст регламента — в разделе «Регламент».',
   'регламент', true, '2026-11-12 10:30:00+05')
on conflict (id) do nothing;


-- ###################################################################
-- ####  004_storage.sql
-- ###################################################################

-- =====================================================================
-- Хранилище (Storage): три публичных бакета и политики доступа.
-- Заменяет ручные действия из пункта 4 инструкции supabase/SETUP.md.
-- Повторный запуск безопасен.
--
-- Чтение файлов доступно всем, запись — только админу (public.is_admin()).
-- Публичные бакеты отдают файлы по адресу
--   <Project URL>/storage/v1/object/public/<бакет>/<путь>
-- без проверки RLS; политики ниже нужны для API хранилища и для
-- загрузки/удаления файлов из админки.
-- =====================================================================

insert into storage.buckets (id, name, public, avif_autodetection, file_size_limit)
values
  ('team-logos',  'team-logos',  true, true, 5242880),
  ('news-covers', 'news-covers', true, true, 5242880),
  ('photos',      'photos',      true, true, 10485760)
on conflict (id) do update
  set public = excluded.public,
      avif_autodetection = excluded.avif_autodetection,
      file_size_limit = excluded.file_size_limit,
      updated_at = now();

-- ---------------------------------------------------------------------
-- team-logos
-- ---------------------------------------------------------------------
drop policy if exists "team-logos: public read" on storage.objects;
create policy "team-logos: public read" on storage.objects for select
  to anon, authenticated using (bucket_id = 'team-logos');

drop policy if exists "team-logos: admin insert" on storage.objects;
create policy "team-logos: admin insert" on storage.objects for insert
  to authenticated with check (bucket_id = 'team-logos' and public.is_admin());

drop policy if exists "team-logos: admin update" on storage.objects;
create policy "team-logos: admin update" on storage.objects for update
  to authenticated
  using (bucket_id = 'team-logos' and public.is_admin())
  with check (bucket_id = 'team-logos' and public.is_admin());

drop policy if exists "team-logos: admin delete" on storage.objects;
create policy "team-logos: admin delete" on storage.objects for delete
  to authenticated using (bucket_id = 'team-logos' and public.is_admin());

-- ---------------------------------------------------------------------
-- news-covers
-- ---------------------------------------------------------------------
drop policy if exists "news-covers: public read" on storage.objects;
create policy "news-covers: public read" on storage.objects for select
  to anon, authenticated using (bucket_id = 'news-covers');

drop policy if exists "news-covers: admin insert" on storage.objects;
create policy "news-covers: admin insert" on storage.objects for insert
  to authenticated with check (bucket_id = 'news-covers' and public.is_admin());

drop policy if exists "news-covers: admin update" on storage.objects;
create policy "news-covers: admin update" on storage.objects for update
  to authenticated
  using (bucket_id = 'news-covers' and public.is_admin())
  with check (bucket_id = 'news-covers' and public.is_admin());

drop policy if exists "news-covers: admin delete" on storage.objects;
create policy "news-covers: admin delete" on storage.objects for delete
  to authenticated using (bucket_id = 'news-covers' and public.is_admin());

-- ---------------------------------------------------------------------
-- photos
-- ---------------------------------------------------------------------
drop policy if exists "photos: public read" on storage.objects;
create policy "photos: public read" on storage.objects for select
  to anon, authenticated using (bucket_id = 'photos');

drop policy if exists "photos: admin insert" on storage.objects;
create policy "photos: admin insert" on storage.objects for insert
  to authenticated with check (bucket_id = 'photos' and public.is_admin());

drop policy if exists "photos: admin update" on storage.objects;
create policy "photos: admin update" on storage.objects for update
  to authenticated
  using (bucket_id = 'photos' and public.is_admin())
  with check (bucket_id = 'photos' and public.is_admin());

drop policy if exists "photos: admin delete" on storage.objects;
create policy "photos: admin delete" on storage.objects for delete
  to authenticated using (bucket_id = 'photos' and public.is_admin());
