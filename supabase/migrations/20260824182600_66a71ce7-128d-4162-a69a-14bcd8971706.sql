-- Ensure newly registered accounts always have a profile and a conservative
-- default role.  Administrators can activate/promote them from Settings.
create or replace function public.handle_new_workbench_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, status)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    case when lower(coalesce(new.email, '')) = 'zhangruisomebody@outlook.com' then 'Active' else 'Inactive' end
  )
  on conflict (id) do update
    set email = excluded.email,
        name = coalesce(nullif(public.profiles.name, ''), excluded.name),
        updated_at = now();

  insert into public.user_roles (user_id, role)
  values (
    new.id,
    case when lower(coalesce(new.email, '')) = 'zhangruisomebody@outlook.com'
      then 'admin'::public.app_role else 'viewer'::public.app_role end
  )
  on conflict (user_id, role) do nothing;

  if lower(coalesce(new.email, '')) = 'zhangruisomebody@outlook.com' then
    delete from public.user_roles where user_id = new.id and role <> 'admin';
    insert into public.user_scopes (user_id, scope_type)
    select new.id, 'all_organization'::public.scope_type
    where not exists (
      select 1 from public.user_scopes
      where user_id = new.id and scope_type = 'all_organization'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_workbench on auth.users;
create trigger on_auth_user_created_workbench
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_workbench_user();

-- Repair the repository owner's account when it already exists.
insert into public.profiles (id, email, name, title, status)
select id, lower(email), coalesce(nullif(raw_user_meta_data ->> 'name', ''), 'Rui Zhang'),
       'Workspace Administrator', 'Active'
from auth.users
where lower(email) = 'zhangruisomebody@outlook.com'
on conflict (id) do update
  set email = excluded.email,
      status = 'Active',
      updated_at = now();

delete from public.user_roles
where user_id in (select id from auth.users where lower(email) = 'zhangruisomebody@outlook.com');

insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where lower(email) = 'zhangruisomebody@outlook.com'
on conflict (user_id, role) do nothing;

insert into public.user_scopes (user_id, scope_type)
select id, 'all_organization'::public.scope_type
from auth.users u
where lower(email) = 'zhangruisomebody@outlook.com'
  and not exists (
    select 1 from public.user_scopes s
    where s.user_id = u.id and s.scope_type = 'all_organization'
  );

-- Keep the create policies explicit and identical for persons and cases.
drop policy if exists "Operators and up manage persons" on public.persons;
drop policy if exists "Operators and up can create persons" on public.persons;
create policy "Active case creators can create persons"
  on public.persons for insert to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'Active')
    and (
      public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'operator')
      or public.has_role(auth.uid(), 'manager')
    )
  );

drop policy if exists "Operators and up create cases" on public.cases;
create policy "Active case creators can create cases"
  on public.cases for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'Active')
    and (
      public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'operator')
      or public.has_role(auth.uid(), 'manager')
    )
  );