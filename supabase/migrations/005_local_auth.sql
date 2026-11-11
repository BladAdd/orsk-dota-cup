-- =====================================================================
-- Локальная регистрация: без письма, с автоматическим входом.
--
-- Зачем. У проекта не настроен SMTP, поэтому при включённом «Confirm email»
-- письмо со ссылкой не уходит, учётка остаётся неподтверждённой и войти в
-- неё нельзя. Триггер ниже проставляет email_confirmed_at прямо при вставке,
-- так что регистрация на сайте работает сразу.
--
-- Колонку confirmed_at не трогаем: в GoTrue это GENERATED-колонка
-- (LEAST(email_confirmed_at, phone_confirmed_at)), запись в неё упадёт.
--
-- Колонки confirmation_token и confirmation_sent_at тоже трогать нельзя:
-- если их обнулить, GoTrue после INSERT не может перечитать пользователя и
-- регистрация падает с «Database error loading user after sign-up», а
-- транзакция откатывается — пользователь не создаётся вообще.
--
-- Второй триггер делает первого зарегистрировавшегося админом: у пустого
-- турнира ещё нет оргкомитета, и заводить его вручную через SQL неудобно.
-- Правило одноразовое — как только в profiles появилась хоть одна строка,
-- админом больше никто не станет.
--
-- Повторный запуск безопасен.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Новый пользователь сразу подтверждён
-- ---------------------------------------------------------------------
create or replace function public.autoconfirm_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_autoconfirm on auth.users;
create trigger on_auth_user_autoconfirm before insert on auth.users
  for each row execute function public.autoconfirm_new_user();

-- ---------------------------------------------------------------------
-- 2. Профиль пользователя + роль первого
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_first boolean;
begin
  -- Сериализуем одновременные регистрации: без блокировки две параллельные
  -- вставки увидят пустой profiles и обе получат admin.
  perform pg_advisory_xact_lock(hashtext('orsk-cup-first-admin'));

  select not exists (select 1 from public.profiles) into is_first;

  insert into public.profiles (id, nickname, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nickname', ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when is_first then 'admin'::public.user_role else 'user'::public.user_role end
  )
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Проверка после применения:
--   select count(*) from auth.users;                        -- 0
--   select count(*) from public.profiles where role='admin'; -- 0
-- После первой регистрации на сайте должно стать 1 и 1.
-- ---------------------------------------------------------------------