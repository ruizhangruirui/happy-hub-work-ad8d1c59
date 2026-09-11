-- People is the current workforce directory, not a lifecycle archive.
-- Future joiners stay in Onboarding. Current employments remain visible as
-- Active or Ending through their Contract End Date and disappear the day after.

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
    when e.source_onboarding_case_id is not null and not exists (
      select 1
      from public.cases onboarding
      where onboarding.id = e.source_onboarding_case_id
        and (
          onboarding.joined_at is not null
          or onboarding.status in ('Confirmed', 'Joined', 'Follow-up', 'Completed')
        )
    ) then 'planned'
    when e.start_date is not null and e.start_date > _as_of then 'planned'
    when coalesce(offboarding.contract_end_date, e.end_date) < _as_of then 'ended'
    when offboarding.case_id is not null or e.end_date is not null then 'ending'
    when e.status = 'ended' then 'ended'
    else 'active'
  end
  from public.employments e
  left join lateral (
    select
      c.id case_id,
      coalesce(c.contract_end_date, c.end_date, c.effective_date) contract_end_date
    from public.cases c
    where c.employment_id = e.id
      and c.case_type = 'Offboarding'
      and c.status <> 'Cancelled'
    order by c.created_at desc
    limit 1
  ) offboarding on true
  where e.id = _employment_id
$$;

create or replace function public.list_people_page(
  _search text default null,
  _status text default null,
  _page integer default 1,
  _page_size integer default 50
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      greatest(coalesce(_page, 1), 1) page,
      least(greatest(coalesce(_page_size, 50), 1), 100) page_size,
      nullif(lower(trim(_search)), '') search,
      nullif(lower(trim(_status)), '') status
  ), eligible as (
    select
      p.id person_id,
      p.display_name,
      p.given_name,
      p.family_name,
      p.preferred_name,
      p.email,
      coalesce(e.employee_id, p.employee_id) employee_id,
      e.id employment_id,
      e.employment_type,
      e.role_title role,
      e.team_id,
      coalesce(t.name, '—') team,
      e.location,
      e.effective_status status,
      e.start_date,
      e.end_date,
      e.supervisor_name
    from public.persons p
    join lateral (
      select ee.*
      from public.employment_effective ee
      where ee.person_id = p.id
        and ee.effective_status in ('active', 'ending')
        and public.can_access_employment(auth.uid(), ee.id)
      order by
        case ee.effective_status when 'active' then 1 else 2 end,
        ee.start_date desc nulls last
      limit 1
    ) e on true
    left join public.teams t on t.id = e.team_id
    cross join params x
    where p.archived_at is null
      and public.is_active_user(auth.uid())
      and (x.status is null or e.effective_status = x.status)
      and (
        x.search is null
        or concat_ws(
          ' ', p.display_name, p.email, p.employee_id, e.employee_id, e.role_title, t.name
        ) ilike '%' || x.search || '%'
      )
  ), counted as (
    select count(*)::integer total from eligible
  ), page_rows as (
    select *
    from eligible
    order by display_name, person_id
    offset (select (page - 1) * page_size from params)
    limit (select page_size from params)
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'personId', person_id, 'displayName', display_name, 'givenName', given_name,
        'familyName', family_name, 'preferredName', preferred_name, 'email', email,
        'employmentId', employment_id, 'employeeId', employee_id,
        'employmentType', employment_type, 'role', role, 'team', team, 'teamId', team_id,
        'location', location, 'status', status, 'startDate', start_date,
        'endDate', end_date, 'supervisorName', supervisor_name
      ) order by display_name)
      from page_rows
    ), '[]'::jsonb),
    'page', (select page from params),
    'pageSize', (select page_size from params),
    'total', (select total from counted),
    'totalPages', greatest(
      1,
      ceil((select total from counted)::numeric / (select page_size from params))::integer
    )
  )
$$;

revoke all on function public.get_effective_employment_status(uuid, date) from public, anon;
grant execute on function public.get_effective_employment_status(uuid, date) to authenticated;
revoke all on function public.list_people_page(text, text, integer, integer) from public, anon;
grant execute on function public.list_people_page(text, text, integer, integer) to authenticated;
