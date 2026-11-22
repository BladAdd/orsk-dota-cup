-- =====================================================================
-- 008. Безопасность, персональные данные и лайки.
--
-- Что было не так (проверено на живой базе publishable-ключом):
--
-- 1. Аноним читал таблицы напрямую. Политики отдавали строки без
--    ограничения колонок, поэтому наружу уходили внутренние поля:
--      * team_members.phone и .full_name — телефоны и ФИО игроков,
--        хотя регламент (п. 9.2) обещает их только оргкомитету;
--      * teams.contact_vk и .admin_note — контакт капитана и служебная
--        заметка оргкомитета;
--      * bracket_matches.lobby_url — ссылка на лобби, по ней в матч
--        заходит кто угодно, .note и .judge_id — тоже внутренние.
--
-- 2. Составы с телефонами были видны и любому зарегистрированному
--    пользователю: политика members_select пускала к строке, если команда
--    в статусе approved, — без проверки, что запрашивающий в оргкомитете.
--
-- 3. Удаление лайков было открыто всем. Политика
--      using (voter_key = coalesce(auth.uid()::text, voter_key))
--    для гостя превращается в «voter_key = voter_key», то есть истина для
--    любой строки: один DELETE от анонима стирал вообще все отметки.
--
-- 4. Комментарий без никнейма публиковал e-mail автора: клиент писал в
--    author_name адрес учётной записи, а он выводится на сайте.
--
-- Решение: публичные страницы читают только представления v_*_public
-- (они принадлежат владельцу схемы и отдают фиксированный набор колонок),
-- а отметки меняются через SECURITY DEFINER-функции, которые работают
-- строго с одной парой (комментарий, ключ голосующего).
--
-- Правами на таблицы управляем аккуратно: снимаем только SELECT у anon
-- и уточняем политики, поэтому админка (роль authenticated со is_staff())
-- продолжает читать всё, что ей нужно.
--
-- Повторный запуск безопасен.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Представление матчей для публичных страниц.
--    tournament_id нужен для фильтра, note (заметка судьи) убран.
-- ---------------------------------------------------------------------
drop view if exists public.v_matches_public;
create view public.v_matches_public as
select m.id, m.tournament_id, m.round, m.match_index, m.label, m.best_of,
       m.team_a, m.team_b, m.score_a, m.score_b, m.winner_id, m.status,
       m.scheduled_at, m.map_name, m.vod_url
from public.bracket_matches m;

grant select on public.v_matches_public to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Анонимные чтения закрываем: публичные страницы ходят в представления
-- ---------------------------------------------------------------------
revoke select on public.teams            from anon;
revoke select on public.team_members     from anon;
revoke select on public.bracket_matches  from anon;
revoke select on public.comments         from anon;
revoke select on public.comment_reactions from anon;

-- public.tournaments остаётся открытым: там нет персональных данных
-- (название, формат, даты, призовой фонд, площадка), и его читают
-- публичные страницы напрямую.

-- Даём обратно всё, что нужно публичным страницам, но без внутренних полей.
grant select on public.v_teams_public         to anon, authenticated;
grant select on public.v_team_members_public  to anon, authenticated;
grant select on public.v_comments_public      to anon, authenticated;
grant select on public.v_news_public          to anon, authenticated;
grant select on public.sponsors               to anon, authenticated;
grant select on public.settings               to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Телефоны и ФИО: только оргкомитет и судьи
-- ---------------------------------------------------------------------
drop policy if exists members_select on public.team_members;
create policy members_select on public.team_members for select to authenticated
  using (public.is_staff()
         or exists (select 1 from public.teams t
                    where t.id = team_id and t.captain_id = auth.uid()));

-- Капитан видит состав своей команды, оргкомитет — любой; остальные
-- зарегистрированные видят ростер только без персональных данных —
-- через v_team_members_public.

-- teams: служебная заметка и контакт капитана тоже не для всех
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select to authenticated
  using (public.is_staff() or captain_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4. Комментарии: убираем e-mail из публичного имени
-- ---------------------------------------------------------------------
-- Разовые правки уже опубликованных строк, где автор без никнейма
-- «представился» адресом почты.
update public.comments
   set author_name = ''
 where author_name like '%@%.%';

-- ---------------------------------------------------------------------
-- 5. Лайки: гость больше не может стирать чужие отметки
-- ---------------------------------------------------------------------
drop policy if exists reactions_select on public.comment_reactions;
create policy reactions_select on public.comment_reactions for select to authenticated
  using (voter_key = auth.uid()::text);

drop policy if exists reactions_insert on public.comment_reactions;
drop policy if exists reactions_delete on public.comment_reactions;
-- Прямая запись запрещена: только через функции ниже. Они работают с одной
-- парой (comment_id, voter_key) и не позволяют массовых операций.

create or replace function public.toggle_comment_reaction(p_comment_id uuid, p_voter_key text)
returns table (liked boolean, likes int)
language plpgsql security definer set search_path = public as $$
declare
  v_key   text;
  v_exist boolean;
  v_likes int;
begin
  if public.is_banned() then
    raise exception 'Действие недоступно для этой учётной записи';
  end if;

  -- Зарегистрированному ключ всегда навязывается его собственный uid:
  -- подставить чужой voter_key через запрос нельзя.
  v_key := coalesce(auth.uid()::text, nullif(btrim(coalesce(p_voter_key, '')), ''));
  if v_key is null or char_length(v_key) > 64 then
    raise exception 'Некорректный идентификатор голосующего';
  end if;

  if not exists (select 1 from public.comments c
                  where c.id = p_comment_id and c.status = 'approved') then
    raise exception 'Комментарий недоступен';
  end if;

  select exists (select 1 from public.comment_reactions r
                  where r.comment_id = p_comment_id and r.voter_key = v_key) into v_exist;

  if v_exist then
    delete from public.comment_reactions r
     where r.comment_id = p_comment_id and r.voter_key = v_key;
  else
    insert into public.comment_reactions (comment_id, voter_key)
    values (p_comment_id, v_key)
    on conflict (comment_id, voter_key) do nothing;
  end if;

  select c.likes_count into v_likes from public.comments c where c.id = p_comment_id;
  return query select (not v_exist), coalesce(v_likes, 0);
end $$;

create or replace function public.my_reactions(p_voter_key text)
returns setof uuid
language sql security definer set search_path = public stable as $$
  select r.comment_id
    from public.comment_reactions r
   where r.voter_key = coalesce(auth.uid()::text, nullif(btrim(coalesce(p_voter_key, '')), ''));
$$;

revoke all on function public.toggle_comment_reaction(uuid, text) from public;
revoke all on function public.my_reactions(text) from public;
grant execute on function public.toggle_comment_reaction(uuid, text) to anon, authenticated;
grant execute on function public.my_reactions(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Жалобы: причина не может быть пустой строкой
-- ---------------------------------------------------------------------
drop policy if exists reports_insert on public.comment_reports;
create policy reports_insert on public.comment_reports for insert to anon, authenticated
  with check (char_length(btrim(reason)) between 3 and 500);

-- ---------------------------------------------------------------------
-- 7. Проверка после применения
-- ---------------------------------------------------------------------
--   -- аноним не должен видеть телефоны, ссылки на лобби и заметки судьи:
--   select * from public.v_team_members_public limit 3;   -- только никнеймы и Steam
--   select * from public.team_members limit 1;            -- permission denied
--   select note, lobby_url from public.bracket_matches;   -- permission denied
--   -- и не должен уметь стирать отметки (ошибка доступа):
--   delete from public.comment_reactions where true;
--   -- а вот поставить отметку гостю по-прежнему можно:
--   select * from public.toggle_comment_reaction(
--     (select id from public.comments where status = 'approved' limit 1), 'guest-key-1');
