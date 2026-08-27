-- Phase 1 final closure: Person authorization, durable employee identity,
-- reversible offboarding, and privacy-safe rehire detection.

-- Employee ID normalization is shared by constraints, triggers, and RPCs.
create or replace function public.normalize_employee_id(_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(upper(trim(_value)), '')
$$;

revoke all on function public.normalize_employee_id(text) from public, anon;
grant execute on function public.normalize_employee_id(text) to authenticated;

-- Stop rather than guessing if legacy rows cannot be reconciled safely.
do $$
declare
  conflict_details text;
begin
  select string_agg(person_id::text || ':' || employee_ids, ', ')
  into conflict_details
  from (
    select p.id person_id,
      string_agg(distinct public.normalize_employee_id(e.employee_id), '|') employee_ids
    from public.persons p
    join public.employments e on e.person_id = p.id
    where public.normalize_employee_id(p.employee_id) is null
      and public.normalize_employee_id(e.employee_id) is not null
    group by p.id
    having count(distinct public.normalize_employee_id(e.employee_id)) > 1
  ) conflicts;

  if conflict_details is not null then
    raise exception 'Employee ID reconciliation required for Persons: %', conflict_details;
  end if;

  select string_agg(employee_id || ':' || person_ids, ', ')
  into conflict_details
  from (
    select resolved.employee_id,
      string_agg(resolved.person_id::text, '|') person_ids
    from (
      select p.id person_id,
        coalesce(
          public.normalize_employee_id(p.employee_id),
          min(public.normalize_employee_id(e.employee_id))
            filter (where public.normalize_employee_id(e.employee_id) is not null)
        ) employee_id
      from public.persons p
      left join public.employments e on e.person_id = p.id
      group by p.id, p.employee_id
    ) resolved
    where resolved.employee_id is not null
    group by resolved.employee_id
    having count(*) > 1
  ) duplicates;

  if conflict_details is not null then
    raise exception 'Employee ID belongs to multiple Persons; reconcile before migration: %', conflict_details;
  end if;
end
$$;

-- Person is the canonical source. Backfill only unambiguous historical values.
update public.persons p
set employee_id = coalesce(
  public.normalize_employee_id(p.employee_id),
  (
    select min(public.normalize_employee_id(e.employee_id))
    from public.employments e
    where e.person_id = p.id
      and public.normalize_employee_id(e.employee_id) is not null
  )
)
where p.employee_id is distinct from coalesce(
  public.normalize_employee_id(p.employee_id),
  (
    select min(public.normalize_employee_id(e.employee_id))
    from public.employments e
    where e.person_id = p.id
      and public.normalize_employee_id(e.employee_id) is not null
  )
);

drop index if exists public.persons_employee_id_unique;
create unique index persons_employee_id_unique
  on public.persons (public.normalize_employee_id(employee_id))
  where public.normalize_employee_id(employee_id) is not null;

create or replace function public.enforce_person_employee_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.employee_id := public.normalize_employee_id(new.employee_id);
  return new;
end
$$;

drop trigger if exists persons_normalize_employee_id on public.persons;
create trigger persons_normalize_employee_id
before insert or update of employee_id on public.persons
for each row execute function public.enforce_person_employee_id();

create or replace function public.enforce_employment_employee_id()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  canonical_id text;
begin
  select public.normalize_employee_id(p.employee_id)
  into canonical_id
  from public.persons p
  where p.id = new.person_id;

  if public.normalize_employee_id(new.employee_id) is not null
     and public.normalize_employee_id(new.employee_id) is distinct from canonical_id then
    raise exception 'Employment employee ID must match its Person';
  end if;

  new.employee_id := canonical_id;
  return new;
end
$$;

drop trigger if exists employments_derive_employee_id on public.employments;
create trigger employments_derive_employee_id
before insert or update of person_id, employee_id on public.employments
for each row execute function public.enforce_employment_employee_id();

create or replace function public.sync_person_employee_id_to_employments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.employments
  set employee_id = new.employee_id,
      updated_at = now()
  where person_id = new.id
    and employee_id is distinct from new.employee_id;
  return new;
end
$$;

drop trigger if exists persons_sync_employee_id on public.persons;
create trigger persons_sync_employee_id
after update of employee_id on public.persons
for each row execute function public.sync_person_employee_id_to_employments();

update public.employments e
set employee_id = p.employee_id
from public.persons p
where p.id = e.person_id
  and e.employee_id is distinct from p.employee_id;

-- Read scope and mutation scope are deliberately separate. Operational Person
-- access follows planned/active/ending Employment, not ended historical teams.
create or replace function public.case_access(_user_id uuid, _case_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.is_active_user(_user_id) then 'none'
    when public.has_role(_user_id, 'admin') then 'owner'
    when c.owner_id = _user_id then 'owner'
    when m.access_level = 'collaborator' then 'collaborator'
    when m.access_level = 'viewer' then 'viewer'
    when exists (
      select 1 from public.user_scopes s
      where s.user_id = _user_id and s.scope_type = 'all_organization'
    ) then 'scoped'
    when exists (
      select 1 from public.user_scopes s
      where s.user_id = _user_id
        and s.scope_type = 'lab'
        and s.lab_id = coalesce(t.lab_id, p.lab_id)
    ) then 'scoped'
    when exists (
      select 1 from public.user_scopes s
      where s.user_id = _user_id
        and s.scope_type = 'team'
        and s.team_id = coalesce(e.team_id, p.team_id)
    ) then 'scoped'
    else 'none'
  end
  from public.cases c
  join public.persons p on p.id = c.person_id
  left join public.employments e on e.id = c.employment_id
  left join public.teams t on t.id = coalesce(e.team_id, p.team_id)
  left join public.case_members m
    on m.case_id = c.id and m.user_id = _user_id and m.revoked_at is null
  where c.id = _case_id
$$;

create or replace function public.can_view_team(_user_id uuid, _team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user(_user_id) and (
    public.has_role(_user_id, 'admin')
    or public.has_role(_user_id, 'operator')
    or exists (
      select 1 from public.user_scopes s
      where s.user_id = _user_id
        and (
          s.scope_type = 'all_organization'
          or (s.scope_type = 'team' and s.team_id = _team_id)
          or (
            s.scope_type = 'lab'
            and s.lab_id = (select t.lab_id from public.teams t where t.id = _team_id)
          )
        )
    )
  )
$$;

create or replace function public.can_manage_team(_user_id uuid, _team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user(_user_id) and (
    public.has_role(_user_id, 'admin')
    or public.has_role(_user_id, 'operator')
    or (
      public.has_role(_user_id, 'manager')
      and exists (
        select 1 from public.user_scopes s
        where s.user_id = _user_id
          and (
            s.scope_type = 'all_organization'
            or (s.scope_type = 'team' and s.team_id = _team_id)
            or (
              s.scope_type = 'lab'
              and s.lab_id = (select t.lab_id from public.teams t where t.id = _team_id)
            )
          )
      )
    )
  )
$$;

create or replace function public.can_access_employment(_user_id uuid, _employment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user(_user_id) and exists (
    select 1
    from public.employments e
    where e.id = _employment_id
      and (
        public.can_view_team(_user_id, e.team_id)
        or exists (
          select 1 from public.cases c
          where c.employment_id = e.id
            and public.case_access(_user_id, c.id) <> 'none'
        )
      )
  )
$$;

create or replace function public.can_access_person(_user_id uuid, _person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user(_user_id) and exists (
    select 1
    from public.persons p
    where p.id = _person_id
      and (
        public.has_role(_user_id, 'admin')
        or public.has_role(_user_id, 'operator')
        or exists (
          select 1 from public.employments e
          where e.person_id = p.id
            and e.status in ('planned', 'active', 'ending')
            and public.can_view_team(_user_id, e.team_id)
        )
        or (
          not exists (select 1 from public.employments e where e.person_id = p.id)
          and public.can_view_team(_user_id, p.team_id)
        )
        or exists (
          select 1 from public.cases c
          where c.person_id = p.id
            and public.case_access(_user_id, c.id) in ('owner', 'collaborator', 'viewer')
        )
      )
  )
$$;

create or replace function public.can_manage_person(_user_id uuid, _person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user(_user_id) and exists (
    select 1
    from public.persons p
    where p.id = _person_id
      and (
        public.has_role(_user_id, 'admin')
        or public.has_role(_user_id, 'operator')
        or (
          public.has_role(_user_id, 'manager')
          and (
            exists (
              select 1 from public.employments e
              where e.person_id = p.id
                and e.status in ('planned', 'active', 'ending')
                and public.can_manage_team(_user_id, e.team_id)
            )
            or (
              not exists (select 1 from public.employments e where e.person_id = p.id)
              and public.can_manage_team(_user_id, p.team_id)
            )
          )
        )
      )
  )
$$;

revoke all on function public.can_view_team(uuid, uuid) from public, anon;
revoke all on function public.can_manage_team(uuid, uuid) from public, anon;
revoke all on function public.can_access_employment(uuid, uuid) from public, anon;
revoke all on function public.can_access_person(uuid, uuid) from public, anon;
revoke all on function public.can_manage_person(uuid, uuid) from public, anon;
grant execute on function public.can_view_team(uuid, uuid) to authenticated;
grant execute on function public.can_manage_team(uuid, uuid) to authenticated;
grant execute on function public.can_access_employment(uuid, uuid) to authenticated;
grant execute on function public.can_access_person(uuid, uuid) to authenticated;
grant execute on function public.can_manage_person(uuid, uuid) to authenticated;

drop policy if exists "Active users read persons" on public.persons;
drop policy if exists "Operators and up manage persons" on public.persons;
drop policy if exists "Operators and up can create persons" on public.persons;
drop policy if exists "Active case creators can create persons" on public.persons;
drop policy if exists "Operators and up update persons" on public.persons;
drop policy if exists "Operators and up can update persons" on public.persons;
drop policy if exists "Scoped users read persons" on public.persons;
drop policy if exists "Organization operators insert persons" on public.persons;
drop policy if exists "Scoped managers update persons" on public.persons;

create policy "Scoped users read persons"
on public.persons for select to authenticated
using (public.can_access_person(auth.uid(), id));

-- Managers create Persons only through the scoped onboarding RPC.
create policy "Organization operators insert persons"
on public.persons for insert to authenticated
with check (
  public.is_active_user(auth.uid())
  and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'operator'))
);

create policy "Scoped managers update persons"
on public.persons for update to authenticated
using (public.can_manage_person(auth.uid(), id))
with check (public.can_manage_person(auth.uid(), id));

drop policy if exists "Scoped users view employments" on public.employments;
drop policy if exists "Scoped lifecycle managers insert employments" on public.employments;
drop policy if exists "Scoped lifecycle managers update employments" on public.employments;

create policy "Scoped users view employments"
on public.employments for select to authenticated
using (public.can_access_employment(auth.uid(), id));

create policy "Scoped lifecycle managers insert employments"
on public.employments for insert to authenticated
with check (public.can_manage_team(auth.uid(), team_id));

create policy "Scoped lifecycle managers update employments"
on public.employments for update to authenticated
using (public.can_manage_team(auth.uid(), team_id))
with check (public.can_manage_team(auth.uid(), team_id));

-- Use Zurich's business date consistently for lifecycle state.
create or replace function public.business_date()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'Europe/Zurich')::date
$$;

create or replace function public.get_effective_employment_status(
  _employment_id uuid,
  _as_of date default current_date
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when e.status = 'cancelled' then 'cancelled'
    when exists (
      select 1 from public.cases oc
      where oc.employment_id = e.id
        and oc.case_type = 'Offboarding'
        and oc.status = 'Confirmed'
        and oc.effective_date < _as_of
    ) then 'ended'
    when exists (
      select 1 from public.cases oc
      where oc.employment_id = e.id
        and oc.case_type = 'Offboarding'
        and oc.status = 'Confirmed'
        and oc.effective_date >= _as_of
    ) then 'ending'
    when e.source_onboarding_case_id is not null and not exists (
      select 1 from public.cases c
      where c.id = e.source_onboarding_case_id and c.status = 'Confirmed'
    ) then 'planned'
    when e.start_date is not null and e.start_date > _as_of then 'planned'
    when e.end_date is not null and e.end_date < _as_of then 'ended'
    when e.end_date is not null and e.end_date >= _as_of then 'ending'
    else 'active'
  end
  from public.employments e
  where e.id = _employment_id
$$;

create or replace view public.employment_effective
with (security_invoker = true) as
select e.*,
  public.get_effective_employment_status(e.id, public.business_date()) effective_status
from public.employments e;

create or replace view public.active_employee_roster
with (security_invoker = true) as
select p.id person_id,
  e.source_onboarding_case_id case_id,
  p.display_name full_name,
  p.email,
  p.employee_id,
  p.phone,
  e.employment_type,
  e.role_title role,
  e.location,
  t.name team_name,
  e.start_date,
  e.supervisor_name
from public.employment_effective e
join public.persons p on p.id = e.person_id
left join public.teams t on t.id = e.team_id
where e.effective_status in ('active', 'ending')
  and p.archived_at is null;

-- A snapshot distinguishes "the previous value was NULL" from "not captured".
alter table public.cases
  add column if not exists pre_offboarding_end_date date,
  add column if not exists offboarding_snapshot_captured boolean not null default false;

create or replace function public.transition_lifecycle_case(_case_id uuid, _confirm boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.cases%rowtype;
  e public.employments%rowtype;
  old_status text;
  next_status text;
  old_emp text;
  next_emp text;
  today date := public.business_date();
begin
  select * into c from public.cases where id = _case_id for update;
  if c.id is null then raise exception 'Case not found'; end if;
  if c.employment_id is null then raise exception 'Lifecycle case requires reconciled employment'; end if;
  if public.case_access(auth.uid(), c.id) not in ('owner', 'collaborator') then raise insufficient_privilege; end if;
  if not (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'operator')
    or public.has_role(auth.uid(), 'manager')
  ) then raise insufficient_privilege; end if;

  select * into e from public.employments where id = c.employment_id for update;
  old_status := c.status;
  next_status := case when _confirm then 'Confirmed' else 'Preparing' end;
  old_emp := e.status;

  if _confirm and c.status <> 'Preparing' then
    raise exception 'Only preparing cases can be confirmed';
  end if;
  if not _confirm and c.status <> 'Confirmed' then
    raise exception 'Only confirmed cases can be reopened';
  end if;

  if c.case_type = 'Offboarding' and _confirm then
    update public.cases
    set status = next_status,
        pre_offboarding_end_date = e.end_date,
        offboarding_snapshot_captured = true,
        updated_at = now()
    where id = c.id;
  else
    update public.cases
    set status = next_status, updated_at = now()
    where id = c.id;
  end if;

  if c.case_type = 'Onboarding' then
    update public.employments
    set status = case
          when _confirm and start_date > today then 'planned'
          when _confirm then 'active'
          else 'planned'
        end,
        updated_at = now()
    where id = c.employment_id;
  elsif _confirm then
    update public.employments
    set status = case when c.effective_date < today then 'ended' else 'ending' end,
        end_date = c.effective_date,
        updated_at = now()
    where id = c.employment_id;
  else
    update public.employments
    set end_date = case
          when c.offboarding_snapshot_captured then c.pre_offboarding_end_date
          else end_date
        end,
        status = case
          when start_date > today then 'planned'
          when c.offboarding_snapshot_captured
            and c.pre_offboarding_end_date is not null
            and c.pre_offboarding_end_date < today then 'ended'
          else 'active'
        end,
        updated_at = now()
    where id = c.employment_id
      and not exists (
        select 1 from public.cases x
        where x.employment_id = c.employment_id
          and x.case_type = 'Offboarding'
          and x.status = 'Confirmed'
          and x.id <> c.id
      );
  end if;

  select status into next_emp from public.employments where id = c.employment_id;
  insert into public.audit_logs(
    actor_id, entity_type, entity_id, action, field,
    previous_value, new_value, case_id, metadata
  ) values (
    auth.uid(), 'case', c.id::text,
    case when _confirm then 'Confirmed lifecycle case' else 'Reopened lifecycle case' end,
    'status', old_status, next_status, c.id,
    jsonb_build_object(
      'personId', c.person_id,
      'employmentId', c.employment_id,
      'employmentPrevious', old_emp,
      'employmentNew', next_emp,
      'restoredEndDate', case
        when c.case_type = 'Offboarding' and not _confirm
        then c.pre_offboarding_end_date
        else null
      end
    )
  );

  return jsonb_build_object(
    'caseId', c.id,
    'status', next_status,
    'employmentStatus', next_emp
  );
end
$$;

-- Return one redacted sentinel for an inaccessible strong match. Weak matches
-- are only visible when the caller can manage that Person.
revoke all on function public.find_onboarding_person_candidates(text, text, text, uuid) from public, anon, authenticated;
drop function public.find_onboarding_person_candidates(text, text, text, uuid);

create function public.find_onboarding_person_candidates(
  _employee_id text,
  _email text,
  _full_name text,
  _team_id uuid
)
returns table(
  person_id uuid,
  display_name text,
  email text,
  employee_id text,
  match_strength text,
  match_reason text,
  last_employment_type text,
  last_team text,
  last_end_date date,
  accessible boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with matches as (
    select p.*,
      case
        when public.normalize_employee_id(_employee_id) is not null
          and public.normalize_employee_id(p.employee_id) = public.normalize_employee_id(_employee_id)
        then 'employee_id'
        when nullif(lower(trim(_email)), '') is not null
          and lower(trim(p.email)) = nullif(lower(trim(_email)), '')
        then 'email'
        else 'name'
      end reason
    from public.persons p
    where p.archived_at is null
      and (
        (
          public.normalize_employee_id(_employee_id) is not null
          and public.normalize_employee_id(p.employee_id) = public.normalize_employee_id(_employee_id)
        )
        or (
          nullif(lower(trim(_email)), '') is not null
          and lower(trim(p.email)) = nullif(lower(trim(_email)), '')
        )
        or (
          nullif(trim(_full_name), '') is not null
          and lower(regexp_replace(p.full_name, '\\s+', '', 'g')) =
              lower(regexp_replace(trim(_full_name), '\\s+', '', 'g'))
        )
      )
  ), visible as (
    select m.*, le.employment_type last_employment_type,
      le.end_date last_end_date, t.name last_team
    from matches m
    left join lateral (
      select e.* from public.employments e
      where e.person_id = m.id
      order by e.start_date desc nulls last, e.created_at desc
      limit 1
    ) le on true
    left join public.teams t on t.id = le.team_id
    where public.can_manage_person(auth.uid(), m.id)
  )
  select v.id, coalesce(v.display_name, v.full_name), v.email, v.employee_id,
    case when v.reason in ('employee_id', 'email') then 'strong' else 'warning' end,
    v.reason, v.last_employment_type, v.last_team, v.last_end_date, true
  from visible v
  union all
  select null::uuid, 'Existing employee record'::text, null::text, null::text,
    'strong'::text, 'restricted'::text, null::text, null::text, null::date, false
  where exists (
    select 1 from matches m
    where m.reason in ('employee_id', 'email')
      and not public.can_manage_person(auth.uid(), m.id)
  )
  order by 5, 2
$$;

grant execute on function public.find_onboarding_person_candidates(text, text, text, uuid) to authenticated;

-- Remove the unused strong-match bypass overload from existing databases.
drop function if exists public.create_onboarding_case_v2(uuid, text, text, text, text, text, text, uuid, text, text, text, text, date, integer, text, text, boolean, boolean);

create or replace function public.create_onboarding_case_v2(
  _existing_person_id uuid,
  _given_name text,
  _family_name text,
  _preferred_name text,
  _email text,
  _employee_id text,
  _employment_type text,
  _team_id uuid,
  _role_title text,
  _location text,
  _supervisor_name text,
  _supervisor_email text,
  _effective_date date,
  _workload integer,
  _priority text,
  _notes text,
  _visa_required boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  person_id uuid;
  employment_id uuid;
  case_id uuid;
  candidate uuid;
  canonical_id text;
begin
  if not public.can_manage_team(auth.uid(), _team_id) then raise insufficient_privilege; end if;
  if _employment_type not in ('Employee', 'Intern', 'Leased Labour') then
    raise exception 'Invalid employment type';
  end if;

  if _existing_person_id is null then
    select p.id into candidate
    from public.persons p
    where (
      public.normalize_employee_id(_employee_id) is not null
      and public.normalize_employee_id(p.employee_id) = public.normalize_employee_id(_employee_id)
    ) or (
      nullif(lower(trim(_email)), '') is not null
      and lower(trim(p.email)) = nullif(lower(trim(_email)), '')
    )
    limit 1;

    if candidate is not null then
      if public.can_manage_person(auth.uid(), candidate) then
        raise exception using message = 'Existing person match requires resolution', errcode = 'P0001';
      else
        raise exception using message = 'An existing Person record matches this identifier. Contact HR/Admin.', errcode = 'P0001';
      end if;
    end if;

    insert into public.persons(
      first_name, last_name, full_name, given_name, family_name,
      preferred_name, display_name, email, employee_id, team_id
    ) values (
      trim(_given_name), trim(_family_name), trim(_given_name || ' ' || _family_name),
      trim(_given_name), trim(_family_name), nullif(trim(_preferred_name), ''),
      coalesce(nullif(trim(_preferred_name), ''), trim(_given_name || ' ' || _family_name)),
      nullif(lower(trim(_email)), ''), public.normalize_employee_id(_employee_id), _team_id
    ) returning id into person_id;
  else
    select p.id, public.normalize_employee_id(p.employee_id)
    into person_id, canonical_id
    from public.persons p
    where p.id = _existing_person_id and p.archived_at is null;

    if person_id is null then raise exception 'Person not found'; end if;
    if not public.can_manage_person(auth.uid(), person_id) then raise insufficient_privilege; end if;

    if canonical_id is null and public.normalize_employee_id(_employee_id) is not null then
      update public.persons
      set employee_id = public.normalize_employee_id(_employee_id), updated_at = now()
      where id = person_id;
      canonical_id := public.normalize_employee_id(_employee_id);
    elsif public.normalize_employee_id(_employee_id) is not null
      and public.normalize_employee_id(_employee_id) is distinct from canonical_id then
      raise exception 'Employee ID does not match the selected Person';
    end if;
  end if;

  select employee_id into canonical_id from public.persons where id = person_id;
  insert into public.employments(
    person_id, employment_type, employee_id, team_id, role_title, location,
    supervisor_name, supervisor_email, workload, start_date, status
  ) values (
    person_id, _employment_type, canonical_id, _team_id, nullif(_role_title, ''),
    nullif(_location, ''), nullif(_supervisor_name, ''), nullif(_supervisor_email, ''),
    _workload, _effective_date, 'planned'
  ) returning id into employment_id;

  insert into public.cases(
    person_id, employment_id, case_type, employment_type, start_date,
    effective_date, role, location, supervisor_name, supervisor_email,
    priority, status, owner_id, notes, visa_required
  ) values (
    person_id, employment_id, 'Onboarding', _employment_type, _effective_date,
    _effective_date, nullif(_role_title, ''), nullif(_location, ''), _supervisor_name,
    nullif(_supervisor_email, ''), _priority, 'Preparing', auth.uid(),
    nullif(_notes, ''), coalesce(_visa_required, false)
  ) returning id into case_id;

  update public.employments set source_onboarding_case_id = case_id where id = employment_id;
  insert into public.audit_logs(actor_id, entity_type, entity_id, action, case_id, metadata)
  values (
    auth.uid(), 'case', case_id::text,
    case when _existing_person_id is null
      then 'Created onboarding with new person'
      else 'Reused person for new employment'
    end,
    case_id, jsonb_build_object('personId', person_id, 'employmentId', employment_id)
  );

  return jsonb_build_object('caseId', case_id, 'personId', person_id, 'employmentId', employment_id);
end
$$;

revoke all on function public.create_onboarding_case_v2(uuid, text, text, text, text, text, text, uuid, text, text, text, text, date, integer, text, text, boolean) from public, anon;
grant execute on function public.create_onboarding_case_v2(uuid, text, text, text, text, text, text, uuid, text, text, text, text, date, integer, text, text, boolean) to authenticated;

-- Read the canonical Employment directly. This avoids coupling a mutation RPC
-- to the reporting view's row-security execution context.
create or replace function public.create_offboarding_case_v2(
  _person_id uuid,
  _employment_id uuid,
  _effective_date date,
  _leaving_type text,
  _leaving_reason text,
  _priority text,
  _notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.employments%rowtype;
  case_id uuid;
  existing_case uuid;
begin
  if not public.can_access_employment(auth.uid(), _employment_id)
    or not (
      public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'operator')
      or public.has_role(auth.uid(), 'manager')
    ) then
    raise insufficient_privilege;
  end if;

  select * into e
  from public.employments
  where id = _employment_id and person_id = _person_id;

  if e.id is null
    or public.get_effective_employment_status(e.id, public.business_date()) not in ('active', 'ending') then
    raise exception 'Active employment not found';
  end if;

  select c.id into existing_case
  from public.cases c
  where c.employment_id = e.id
    and c.case_type = 'Offboarding'
    and c.status <> 'Cancelled'
  limit 1;

  if existing_case is not null then
    return jsonb_build_object('error', 'offboarding_exists', 'caseId', existing_case);
  end if;

  insert into public.cases(
    person_id, employment_id, case_type, employment_type, start_date,
    end_date, effective_date, role, location, supervisor_name, supervisor_email,
    priority, status, owner_id, notes, leaving_type, leaving_reason
  ) values (
    _person_id, e.id, 'Offboarding', e.employment_type, e.start_date,
    _effective_date, _effective_date, e.role_title, e.location, e.supervisor_name,
    e.supervisor_email, _priority, 'Preparing', auth.uid(), nullif(_notes, ''),
    nullif(_leaving_type, ''), nullif(_leaving_reason, '')
  ) returning id into case_id;

  insert into public.audit_logs(actor_id, entity_type, entity_id, action, case_id, metadata)
  values (
    auth.uid(), 'case', case_id::text, 'Created offboarding for existing employment',
    case_id, jsonb_build_object('personId', _person_id, 'employmentId', e.id)
  );

  return jsonb_build_object('caseId', case_id, 'personId', _person_id, 'employmentId', e.id);
end
$$;

revoke all on function public.create_offboarding_case_v2(uuid, uuid, date, text, text, text, text) from public, anon;
grant execute on function public.create_offboarding_case_v2(uuid, uuid, date, text, text, text, text) to authenticated;
