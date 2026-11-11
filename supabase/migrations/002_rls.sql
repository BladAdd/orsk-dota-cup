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
