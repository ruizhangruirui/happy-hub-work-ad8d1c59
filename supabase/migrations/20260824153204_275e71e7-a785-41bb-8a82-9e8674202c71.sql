create policy "Case files readable with case access"
  on storage.objects for select to authenticated
  using (bucket_id = 'case-files'
         and public.case_access(auth.uid(), (split_part(name, '/', 1))::uuid) <> 'none');

create policy "Case files uploadable by case editors"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'case-files'
         and public.case_access(auth.uid(), (split_part(name, '/', 1))::uuid) in ('owner', 'collaborator'));

create policy "Case files updatable by case editors"
  on storage.objects for update to authenticated
  using (bucket_id = 'case-files'
         and public.case_access(auth.uid(), (split_part(name, '/', 1))::uuid) in ('owner', 'collaborator'));

create policy "Case files deletable by case editors"
  on storage.objects for delete to authenticated
  using (bucket_id = 'case-files'
         and public.case_access(auth.uid(), (split_part(name, '/', 1))::uuid) in ('owner', 'collaborator'));