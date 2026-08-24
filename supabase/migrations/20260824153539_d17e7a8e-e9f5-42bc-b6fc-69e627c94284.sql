drop policy "Users read own role, admins read all" on public.user_roles;
create policy "Active users read roles"
  on public.user_roles for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'Active'));

drop policy "Users read own scopes, admins read all" on public.user_scopes;
create policy "Active users read scopes"
  on public.user_scopes for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'Active'));