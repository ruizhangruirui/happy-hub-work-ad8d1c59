-- Create a person and their case atomically. The function keeps authorization
-- inside Postgres and only elevates the narrowly scoped writes in this workflow.
create or replace function public.create_workbench_case(
  _first_name text,
  _last_name text,
  _email text,
  _team_id uuid,
  _case_type text,
  _employment_type text,
  _start_date date,
  _end_date date,
  _role text,
  _location text,
  _supervisor_name text,
  _supervisor_email text,
  _priority text,
  _notes text,
  _visa_required boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  new_person_id uuid;
  new_case_id uuid;
begin
  if caller_id is null
    or not public.is_active_user(caller_id)
    or not (
      public.has_role(caller_id, 'admin')
      or public.has_role(caller_id, 'operator')
      or public.has_role(caller_id, 'manager')
    ) then
    raise insufficient_privilege using message = 'Not authorized to create cases';
  end if;

  if _case_type not in ('Onboarding', 'Offboarding') then
    raise exception 'Invalid case type';
  end if;

  insert into public.persons (first_name, last_name, full_name, email, team_id)
  values (_first_name, _last_name, trim(_first_name || ' ' || _last_name), nullif(_email, ''), _team_id)
  returning id into new_person_id;

  insert into public.cases (
    person_id, case_type, employment_type, start_date, end_date, role,
    location, supervisor_name, supervisor_email, priority, status,
    owner_id, notes, visa_required
  ) values (
    new_person_id, _case_type, _employment_type, _start_date, _end_date, nullif(_role, ''),
    nullif(_location, ''), _supervisor_name, nullif(_supervisor_email, ''), _priority, 'Preparing',
    caller_id, nullif(_notes, ''), coalesce(_visa_required, false)
  ) returning id into new_case_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, case_id)
  values (caller_id, 'case', new_case_id, 'Created ' || lower(_case_type) || ' case', new_case_id);

  return new_case_id;
end;
$$;

revoke all on function public.create_workbench_case(text,text,text,uuid,text,text,date,date,text,text,text,text,text,text,boolean) from public, anon;
grant execute on function public.create_workbench_case(text,text,text,uuid,text,text,date,date,text,text,text,text,text,text,boolean) to authenticated;
