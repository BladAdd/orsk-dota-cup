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
begin
  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), tg_op, tg_table_name, coalesce(new.id::text, old.id::text),
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
