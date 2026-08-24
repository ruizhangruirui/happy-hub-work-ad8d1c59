-- Live roster: confirmed hires appear on their start date. A pending offboarding
-- does not affect the roster; a confirmed offboarding removes the matching person.
create or replace view public.active_employee_roster
with (security_invoker = true)
as
select distinct on (p.id)
  p.id as person_id,
  c.id as case_id,
  p.full_name,
  p.email,
  p.employee_id,
  p.phone,
  c.employment_type,
  c.role,
  c.location,
  t.name as team_name,
  c.start_date,
  c.supervisor_name
from public.cases c
join public.persons p on p.id = c.person_id
left join public.teams t on t.id = p.team_id
where c.case_type = 'Onboarding'
  and c.status = 'Confirmed'
  and c.start_date <= current_date
  and c.archived_at is null
  and p.archived_at is null
  and not exists (
    select 1
    from public.cases oc
    join public.persons op on op.id = oc.person_id
    where oc.case_type = 'Offboarding'
      and oc.status = 'Confirmed'
      and oc.archived_at is null
      and (
        (p.employee_id is not null and op.employee_id = p.employee_id)
        or (p.email is not null and lower(op.email) = lower(p.email))
        or (p.employee_id is null and p.email is null and op.full_name = p.full_name and op.team_id is not distinct from p.team_id)
      )
  )
order by p.id, c.start_date desc, c.created_at desc;

grant select on public.active_employee_roster to authenticated;
revoke all on public.active_employee_roster from anon;
