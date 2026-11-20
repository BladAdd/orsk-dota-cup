-- =====================================================================
-- Блокировка роли администратора: админ назначается только по белому списку.
--
-- Зачем. 005_local_auth.sql делает админом первого зарегистрировавшегося,
-- но SMTP в проекте не настроен, а почту подтверждает триггер. Из-за этого
-- любой, кто занял адрес из ADMIN_EMAILS ДО настоящего владельца, получает
-- admin без доступа к письму — достаточно угадать e-mail.
--
-- Теперь правило такое: роль admin при регистрации выдаётся, только если
-- e-mail пользователя есть в public.admin_whitelist. Все остальные
-- регистрируются обычными 'user'.
--
-- Правило "только первый" (из 005) заменено целиком, а не оставлено вторым
-- барьером: в profiles лежат все зарегистрированные, включая обычных игроков.
-- Если бы admin выдавался только пустому profiles, после первой же заявки
-- игрока белый адрес не стал бы админом никогда.
--
-- Повторный запуск безопасен.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Белый список админов
-- ---------------------------------------------------------------------
create table if not exists public.admin_whitelist (
  email      text primary key,
  note       text not null default '',
  created_at timestamptz not null default now()
);

alter table public.admin_whitelist enable row level security;
-- Политик нет: через клиент таблица не видна никому. Читает её только
-- security definer-функция ниже и служебная роль по прямому SQL.
revoke all on public.admin_whitelist from anon, authenticated;

comment on table public.admin_whitelist is
  'E-mail, которым разрешена роль admin при регистрации. Заполнять только через SQL Editor.';

-- ---------------------------------------------------------------------
-- 2. Выдача роли: вместо "первый пользователь" — "только белый список"
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_trusted boolean;
  mail       text := lower(coalesce(new.email, ''));
begin
  select exists (select 1 from public.admin_whitelist where email = mail) into is_trusted;

  insert into public.profiles (id, nickname, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nickname', ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case
      when is_trusted and is_first then 'admin'::public.user_role
      else 'user'::public.user_role
    end
  )
  on conflict (id) do nothing;

  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. Проверка после применения
-- ---------------------------------------------------------------------
--   select * from public.admin_whitelist;                       -- ваш адрес
--   select count(*) from public.profiles where role = 'admin';  -- 0 до регистрации
--   select email, role from public.profiles p
--     join auth.users u on u.id = p.id;                         -- после регистрации: admin
--
-- Если до этого дыры всё-таки воспользовались, лишние учётки видны так:
--   select u.email, p.role, p.created_at from public.profiles p
--     join auth.users u on u.id = p.id where p.role = 'admin';
-- Лишних — понизить до 'user' через Table Editor или SQL Editor.