-- Phase 4: scope-safe operational reporting. All aggregates are restricted by
-- the caller's existing Case and Task permissions; no service-role data path.

create index if not exists cases_reporting_type_dates_idx
  on public.cases(case_type,start_date,last_working_day,contract_end_date)
  where archived_at is null;
create index if not exists cases_reporting_lifecycle_idx
  on public.cases(joined_date,left_date) where archived_at is null;
create index if not exists tasks_reporting_due_idx
  on public.tasks(due_date,owner_team,status) where status not in ('Completed','Not Applicable');

-- Scope the existing reusable roster view by its source onboarding Case.
create or replace view public.active_employee_roster
with (security_invoker = true) as
select p.id person_id,e.source_onboarding_case_id case_id,p.display_name full_name,p.email,
  coalesce(e.employee_id,p.employee_id) employee_id,p.phone,e.employment_type,e.role_title role,
  e.location,t.name team_name,e.start_date,e.supervisor_name,
  (oc.id is not null) leaving,oc.last_working_day
from public.employment_effective e
join public.persons p on p.id=e.person_id
left join public.teams t on t.id=e.team_id
left join lateral (
  select c.id,c.last_working_day from public.cases c
  where c.employment_id=e.id and c.case_type='Offboarding' and c.status<>'Cancelled'
    and c.left_at is null and c.archived_at is null
    and public.case_access(auth.uid(),c.id)<>'none'
  order by c.created_at desc limit 1
) oc on true
where e.effective_status in ('active','ending') and p.archived_at is null
  and e.source_onboarding_case_id is not null
  and public.case_access(auth.uid(),e.source_onboarding_case_id)<>'none';
grant select on public.active_employee_roster to authenticated;

create or replace function public.get_operations_overview(
  _team text default null,
  _employment_type text default null,
  _case_type text default null,
  _status text default null,
  _date_from date default null,
  _date_to date default null
) returns jsonb
language sql stable security definer set search_path=public as $$
with
params as (select public.business_date() today),
accessible_cases as (
  select c.*,p.display_name person_name,p.employee_id person_employee_id,
    coalesce(tm.name,'—') team_name,e.team_id,e.role_title employment_role,
    e.supervisor_name employment_supervisor,e.location employment_location
  from public.cases c
  join public.persons p on p.id=c.person_id
  left join public.employments e on e.id=c.employment_id
  left join public.teams tm on tm.id=coalesce(e.team_id,p.team_id)
  where c.archived_at is null and p.archived_at is null
    and public.case_access(auth.uid(),c.id)<>'none'
),
filtered_cases as (
  select * from accessible_cases c
  where (nullif(_team,'') is null or c.team_name=_team)
    and (nullif(_employment_type,'') is null or c.employment_type=_employment_type)
    and (nullif(_case_type,'') is null or lower(c.case_type)=lower(_case_type))
    and (nullif(_status,'') is null or c.status=_status)
    and (_date_from is null or coalesce(c.start_date,c.last_working_day,c.contract_end_date)>=_date_from)
    and (_date_to is null or coalesce(c.start_date,c.last_working_day,c.contract_end_date)<=_date_to)
),
active_people as (
  select e.person_id,e.source_onboarding_case_id case_id,p.display_name person_name,
    coalesce(e.employee_id,p.employee_id) employee_id,e.employment_type,
    coalesce(tm.name,'—') team_name,e.role_title,e.location,e.supervisor_name,e.start_date,
    exists(select 1 from accessible_cases oc where oc.employment_id=e.id and oc.case_type='Offboarding'
      and oc.status<>'Cancelled' and oc.left_at is null) leaving,
    (select oc.last_working_day from accessible_cases oc where oc.employment_id=e.id and oc.case_type='Offboarding'
      and oc.status<>'Cancelled' and oc.left_at is null order by oc.created_at desc limit 1) last_working_day
  from public.employment_effective e
  join public.persons p on p.id=e.person_id
  left join public.teams tm on tm.id=e.team_id
  where e.effective_status in ('active','ending') and p.archived_at is null
    and exists(select 1 from filtered_cases fc where fc.employment_id=e.id)
    and (nullif(_team,'') is null or coalesce(tm.name,'—')=_team)
    and (nullif(_employment_type,'') is null or e.employment_type=_employment_type)
),
task_rows as (
  select t.*
  from public.list_operational_tasks(null) t
  join filtered_cases c on c.id=t.case_id
),
outstanding_tasks as (
  select t.* from task_rows t where t.status in ('Not Started','Open','In Progress','Waiting','Blocked')
),
case_task_progress as (
  select case_id,
    count(*) filter(where mandatory and status<>'Not Applicable') mandatory_total,
    count(*) filter(where mandatory and status='Completed') mandatory_completed,
    count(*) filter(where mandatory and status in ('Not Started','Open','In Progress','Waiting','Blocked') and due_date<(select today from params)) overdue
  from task_rows group by case_id
),
attention_candidates as (
  select c.id case_id,c.person_name,c.case_type,'Critical' severity,
    'Mandatory task overdue' reason,t.id task_id,1 severity_rank
  from filtered_cases c join outstanding_tasks t on t.case_id=c.id and t.mandatory
  where t.due_date<(select today from params)
  union all
  select c.id,c.person_name,c.case_type,'Warning','Start Date approaching with mandatory preparation incomplete',null::uuid,2
  from filtered_cases c where c.case_type='Onboarding' and c.joined_at is null
    and c.start_date between (select today from params) and (select today+14 from params)
    and exists(select 1 from outstanding_tasks t where t.case_id=c.id and t.mandatory)
  union all
  select c.id,c.person_name,c.case_type,'Warning','Employee ID missing near Start Date',null::uuid,2
  from filtered_cases c where c.case_type='Onboarding' and c.joined_at is null
    and c.person_employee_id is null and c.start_date<=(select today+28 from params)
  union all
  select c.id,c.person_name,c.case_type,'Warning','Last Working Day not confirmed',null::uuid,2
  from filtered_cases c where c.case_type='Offboarding' and c.left_at is null and c.last_working_day is null
  union all
  select c.id,c.person_name,c.case_type,'Critical','LWD approaching with IT/Admin work unresolved',t.id,1
  from filtered_cases c join outstanding_tasks t on t.case_id=c.id and t.owner_team in ('IT','Admin')
  where c.case_type='Offboarding' and c.left_at is null
    and c.last_working_day between (select today from params) and (select today+7 from params)
  union all
  select c.id,c.person_name,c.case_type,'Critical','Post-leaving mandatory task still open',t.id,1
  from filtered_cases c join outstanding_tasks t on t.case_id=c.id and t.mandatory
  where c.case_type='Offboarding' and c.left_at is not null
),
attention as (
  select distinct on(case_id) * from attention_candidates order by case_id,severity_rank,task_id nulls last
),
months as (
  select generate_series(
    date_trunc('month',(select today from params)::timestamp)-interval '11 months',
    date_trunc('month',(select today from params)::timestamp),interval '1 month'
  )::date month_start
)
select jsonb_build_object(
  'businessDate',(select today from params),
  'metrics',jsonb_build_object(
    'activePeople',(select count(*) from active_people),
    'preboarding',(select count(*) from filtered_cases c left join public.employment_effective e on e.id=c.employment_id
      where c.case_type='Onboarding' and c.status<>'Cancelled' and c.joined_at is null and coalesce(e.effective_status,'planned')='planned'),
    'leaving',(select count(*) from active_people where leaving),
    'joinedYtd',(select count(*) from filtered_cases where case_type='Onboarding' and joined_date between date_trunc('year',(select today from params)::timestamp)::date and (select today from params)),
    'leftYtd',(select count(*) from filtered_cases where case_type='Offboarding' and left_date between date_trunc('year',(select today from params)::timestamp)::date and (select today from params))
  ),
  'activePeople',coalesce((select jsonb_agg(jsonb_build_object(
    'personId',person_id,'caseId',case_id,'name',person_name,'employeeId',employee_id,
    'employmentType',employment_type,'team',team_name,'role',role_title,'location',location,
    'supervisorName',supervisor_name,'startDate',start_date,'leaving',leaving,'lastWorkingDay',last_working_day
  ) order by person_name) from active_people),'[]'::jsonb),
  'upcomingJoiners',coalesce((select jsonb_agg(jsonb_build_object(
    'caseId',c.id,'name',c.person_name,'team',c.team_name,'employmentType',c.employment_type,
    'startDate',c.start_date,'status',c.status,'mandatoryCompleted',coalesce(p.mandatory_completed,0),
    'mandatoryTotal',coalesce(p.mandatory_total,0),'overdueTasks',coalesce(p.overdue,0)
  ) order by c.start_date) from filtered_cases c left join case_task_progress p on p.case_id=c.id
    where c.case_type='Onboarding' and c.status<>'Cancelled' and c.joined_at is null
      and c.start_date between (select today from params) and (select today+60 from params)),'[]'::jsonb),
  'upcomingLeavers',coalesce((select jsonb_agg(jsonb_build_object(
    'caseId',c.id,'name',c.person_name,'team',c.team_name,'employmentType',c.employment_type,
    'lastWorkingDay',c.last_working_day,'contractEndDate',c.contract_end_date,'leavingType',c.leaving_type,
    'status',c.status,'mandatoryCompleted',coalesce(p.mandatory_completed,0),'mandatoryTotal',coalesce(p.mandatory_total,0),
    'overdueTasks',coalesce(p.overdue,0)
  ) order by c.last_working_day nulls last,c.contract_end_date nulls last) from filtered_cases c left join case_task_progress p on p.case_id=c.id
    where c.case_type='Offboarding' and c.status<>'Cancelled' and c.left_at is null),'[]'::jsonb),
  'attentionCases',coalesce((select jsonb_agg(jsonb_build_object(
    'caseId',case_id,'taskId',task_id,'name',person_name,'caseType',case_type,'severity',severity,'reason',reason
  ) order by severity_rank,person_name) from attention),'[]'::jsonb),
  'taskWorkload',coalesce((select jsonb_agg(jsonb_build_object(
    'ownerTeam',team,'open',open_count,'overdue',overdue_count,'dueSoon',due_soon_count,'unassigned',unassigned_count
  ) order by array_position(array['HR','IT','Admin'],team)) from (
    select team,
      count(o.id) open_count,
      count(o.id) filter(where o.due_date<(select today from params)) overdue_count,
      count(o.id) filter(where o.due_date between (select today from params) and (select today+14 from params)) due_soon_count,
      count(o.id) filter(where o.owner_id is null) unassigned_count
    from unnest(array['HR','IT','Admin']) team left join outstanding_tasks o on o.owner_team=team group by team
  ) workload),'[]'::jsonb),
  'activeByEmploymentType',coalesce((select jsonb_agg(jsonb_build_object('name',employment_type,'value',amount) order by employment_type)
    from(select employment_type,count(*) amount from active_people group by employment_type)x),'[]'::jsonb),
  'activeByTeam',coalesce((select jsonb_agg(jsonb_build_object('name',team_name,'value',amount) order by team_name)
    from(select team_name,count(*) amount from active_people group by team_name)x),'[]'::jsonb),
  'monthlyLifecycleTrend',coalesce((select jsonb_agg(jsonb_build_object(
    'month',to_char(m.month_start,'YYYY-MM'),'joined',(select count(*) from filtered_cases c where c.case_type='Onboarding' and date_trunc('month',c.joined_date::timestamp)::date=m.month_start),
    'left',(select count(*) from filtered_cases c where c.case_type='Offboarding' and date_trunc('month',c.left_date::timestamp)::date=m.month_start)
  ) order by m.month_start) from months m),'[]'::jsonb),
  'tasks',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'caseId',case_id,'title',title,'person',person_name,'caseType',case_type,'ownerTeam',owner_team,
    'assignee',owner_name,'mandatory',mandatory,'status',status,'dueDate',due_date,'completedBy',completed_by_name,'completedAt',completed_at
  ) order by due_date nulls last,title) from task_rows),'[]'::jsonb)
)
$$;

revoke all on function public.get_operations_overview(text,text,text,text,date,date) from public,anon;
grant execute on function public.get_operations_overview(text,text,text,text,date,date) to authenticated;
