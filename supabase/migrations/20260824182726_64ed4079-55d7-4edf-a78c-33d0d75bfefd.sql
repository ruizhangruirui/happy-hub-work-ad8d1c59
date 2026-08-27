alter table public.cases add column if not exists visa_required boolean not null default false;

create table if not exists public.case_workflow_items (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  step_key text not null,
  title text not null,
  description text,
  sequence integer not null,
  target_date date,
  status text not null default 'Not Started'
    check (status in ('Not Started','In Progress','Blocked','Completed','Not Required')),
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(case_id, step_key)
);
create index if not exists case_workflow_case_sequence_idx on public.case_workflow_items(case_id, sequence);
grant select, insert, update, delete on public.case_workflow_items to authenticated;
grant all on public.case_workflow_items to service_role;
alter table public.case_workflow_items enable row level security;

drop policy if exists "Workflow visible with case access" on public.case_workflow_items;
drop policy if exists "Case editors create workflow" on public.case_workflow_items;
drop policy if exists "Case editors update workflow" on public.case_workflow_items;
drop policy if exists "Case owners delete workflow" on public.case_workflow_items;
create policy "Workflow visible with case access" on public.case_workflow_items
  for select to authenticated using (public.case_access(auth.uid(), case_id) <> 'none');
create policy "Case editors create workflow" on public.case_workflow_items
  for insert to authenticated with check (public.case_access(auth.uid(), case_id) in ('owner','collaborator'));
create policy "Case editors update workflow" on public.case_workflow_items
  for update to authenticated using (public.case_access(auth.uid(), case_id) in ('owner','collaborator'))
  with check (public.case_access(auth.uid(), case_id) in ('owner','collaborator'));
create policy "Case owners delete workflow" on public.case_workflow_items
  for delete to authenticated using (public.case_access(auth.uid(), case_id) = 'owner');

create or replace function public.initialize_case_workflow(_case_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare c public.cases%rowtype; leased boolean;
begin
  select * into c from public.cases where id=_case_id;
  if not found then return; end if;
  leased := lower(coalesce(c.employment_type,'')) in ('leased labour','leased labor','contractor');

  insert into public.case_workflow_items(case_id,step_key,title,description,sequence,target_date,status) values
    (_case_id,'system_entry',case when leased then 'Huawei system site access' else 'Huawei system onboarding' end,
      case when leased then 'Register site access and push to pending entry.' else 'Complete the system onboarding process.' end,1,null,'Not Started'),
    (_case_id,'contract',case when leased then 'Supplier request & contract' else 'Contract signed' end,
      case when leased then 'Send the leasing request to the supplier and confirm contract signature.' else 'Prepare and sign the employment or internship contract.' end,2,null,'Not Started'),
    (_case_id,'pending',case when leased then 'Push to pending entry' else 'Push to pending onboarding' end,
      'Confirm the person is ready in the pending population.',3,null,'Not Started')
  on conflict(case_id,step_key) do nothing;

  if not leased then
    insert into public.case_workflow_items(case_id,step_key,title,description,sequence,target_date,status) values
      (_case_id,'visa','Visa process','Complete visa/work-permit processing when required.',4,
       case when c.start_date is null then null else c.start_date-interval '8 weeks' end,
       case when c.visa_required then 'Not Started' else 'Not Required' end),
      (_case_id,'payroll_email','Payroll email','Send payroll information through Email Center.',5,
       case when c.start_date is null then null else c.start_date-interval '1 month' end,'Not Started')
    on conflict(case_id,step_key) do nothing;
  end if;

  insert into public.case_workflow_items(case_id,step_key,title,description,sequence,target_date,status) values
    (_case_id,'employee_id','Employee ID generated & stakeholder handoff',
      'Record the employee ID, then notify Administration, Reception and the relevant Lab Assistant.',
      case when leased then 4 else 6 end,
      case when c.start_date is null then null else c.start_date-interval '25 days' end,'Not Started'),
    (_case_id,'account_it','Employee account/password & IT setup',
      'Record account readiness and notify IT to configure the computer.',
      case when leased then 5 else 7 end,
      case when c.start_date is null then null else c.start_date-interval '14 days' end,'Not Started'),
    (_case_id,'welcome_email','Welcome email','Send the welcome email through Email Center.',
      case when leased then 6 else 8 end,
      case when c.start_date is null then null else c.start_date-interval '14 days' end,'Not Started')
  on conflict(case_id,step_key) do nothing;
end; $$;

create or replace function public.initialize_case_workflow_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.initialize_case_workflow(new.id); return new; end; $$;
drop trigger if exists cases_initialize_workflow on public.cases;
create trigger cases_initialize_workflow after insert on public.cases
for each row execute function public.initialize_case_workflow_trigger();

select public.initialize_case_workflow(id) from public.cases;
