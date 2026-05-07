-- Code Recall content tables hardening.
-- Run this in the Supabase SQL editor after confirming table/column names.
-- These policies expect Supabase JWTs to include one of:
--   app_metadata.role = 'admin' | 'super_admin'
--   app_metadata.admin = true
--   app_metadata.super_admin = true

alter table public.module_drafts enable row level security;
alter table public.quiz_drafts enable row level security;
alter table public.published_modules enable row level security;
alter table public.published_quizzes enable row level security;

create or replace function public.jwt_is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'super_admin')
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'admin', 'false')) = 'true'
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'super_admin', 'false')) = 'true';
$$;

create or replace function public.jwt_is_super_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'super_admin'
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'super_admin', 'false')) = 'true';
$$;

drop policy if exists "Admins can read module drafts" on public.module_drafts;
create policy "Admins can read module drafts"
on public.module_drafts
for select
using (public.jwt_is_admin());

drop policy if exists "Admins can create module drafts" on public.module_drafts;
create policy "Admins can create module drafts"
on public.module_drafts
for insert
with check (public.jwt_is_admin());

drop policy if exists "Admins can review module drafts" on public.module_drafts;
create policy "Admins can review module drafts"
on public.module_drafts
for update
using (public.jwt_is_admin())
with check (public.jwt_is_admin());

drop policy if exists "Admins can read quiz drafts" on public.quiz_drafts;
create policy "Admins can read quiz drafts"
on public.quiz_drafts
for select
using (public.jwt_is_admin());

drop policy if exists "Admins can create quiz drafts" on public.quiz_drafts;
create policy "Admins can create quiz drafts"
on public.quiz_drafts
for insert
with check (public.jwt_is_admin());

drop policy if exists "Admins can review quiz drafts" on public.quiz_drafts;
create policy "Admins can review quiz drafts"
on public.quiz_drafts
for update
using (public.jwt_is_admin())
with check (public.jwt_is_admin());

drop policy if exists "Anyone can read published modules" on public.published_modules;
create policy "Anyone can read published modules"
on public.published_modules
for select
using (true);

drop policy if exists "Super admins can publish modules" on public.published_modules;
create policy "Super admins can publish modules"
on public.published_modules
for insert
with check (public.jwt_is_super_admin());

drop policy if exists "Anyone can read published quizzes" on public.published_quizzes;
create policy "Anyone can read published quizzes"
on public.published_quizzes
for select
using (true);

drop policy if exists "Super admins can publish quizzes" on public.published_quizzes;
create policy "Super admins can publish quizzes"
on public.published_quizzes
for insert
with check (public.jwt_is_super_admin());
