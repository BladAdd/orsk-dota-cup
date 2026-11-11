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
