create policy "Operators and up can create persons"
  on public.persons for insert to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'Active')
    and public.has_role(auth.uid(), 'operator')
  );

create policy "Operators and up can update persons"
  on public.persons for update to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'Active')
    and public.has_role(auth.uid(), 'operator')
  );