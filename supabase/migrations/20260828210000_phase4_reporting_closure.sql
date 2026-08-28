-- Phase 4 Closure: reporting is capability-scoped, not Case-membership-scoped.

create or replace view public.active_employee_roster
with (security_invoker = true) as
select p.id person_id,e.source_onboarding_case_id case_id,p.display_name full_name,p.email,
  coalesce(e.employee_id,p.employee_id) employee_id,p.phone,e.employment_type,e.role_title role,
  e.location,t.name team_name,e.start_date,e.supervisor_name,(oc.id is not null) leaving,oc.last_working_day
from public.employment_effective e join public.persons p on p.id=e.person_id left join public.teams t on t.id=e.team_id
left join lateral (
  select c.id,c.last_working_day from public.cases c where c.employment_id=e.id and c.case_type='Offboarding'
    and c.status<>'Cancelled' and c.left_at is null and c.archived_at is null
    and public.can_manage_case(auth.uid(),c.id) order by c.created_at desc limit 1
) oc on true
where e.effective_status in ('active','ending') and p.archived_at is null
  and e.source_onboarding_case_id is not null and public.is_hr_user(auth.uid())
  and public.can_manage_case(auth.uid(),e.source_onboarding_case_id);
grant select on public.active_employee_roster to authenticated;

drop function if exists public.list_operational_tasks(uuid);
create function public.list_operational_tasks(_case_id uuid default null)
returns table(
  id uuid,title text,description text,case_id uuid,case_type text,person_name text,person_team text,
  start_date date,contract_end_date date,last_working_day date,due_date date,priority text,status text,
  task_type text,owner_team text,owner_id uuid,checklist_item_id uuid,owner_name text,mandatory boolean,completed_at timestamptz,
  completed_by_name text,assignee_role text,default_task_key text,template_item_id uuid,source text,
  not_applicable_reason text,preferred_email_template_id uuid,can_edit boolean
)
language sql stable security definer set search_path=public as $$
  select t.id,t.title,t.description,t.case_id,c.case_type,p.display_name,coalesce(tm.name,'—'),
    c.start_date,c.contract_end_date,c.last_working_day,t.due_date,t.priority,t.status,t.task_type,
    t.owner_team,t.owner_id,t.checklist_item_id,assignee.name,t.mandatory,t.completed_at,completer.name,
    t.assignee_role,t.default_task_key,t.template_item_id,t.source,t.not_applicable_reason,
    t.preferred_email_template_id,public.can_update_task(auth.uid(),t.id)
  from public.tasks t join public.cases c on c.id=t.case_id join public.persons p on p.id=c.person_id
  left join public.employments e on e.id=c.employment_id left join public.teams tm on tm.id=coalesce(e.team_id,p.team_id)
  left join public.profiles assignee on assignee.id=t.owner_id left join public.profiles completer on completer.id=t.completed_by
  where (_case_id is null or t.case_id=_case_id) and public.is_active_user(auth.uid()) and (
    public.can_manage_case(auth.uid(),t.case_id)
    or (not public.is_hr_user(auth.uid()) and public.is_operational_team_member(auth.uid(),t.owner_team))
  ) order by t.due_date nulls last,t.created_at
$$;
revoke all on function public.list_operational_tasks(uuid) from public,anon;
grant execute on function public.list_operational_tasks(uuid) to authenticated;

create or replace function public.get_operations_overview(
  _team text default null,_employment_type text default null,_case_type text default null,
  _status text default null,_date_from date default null,_date_to date default null
) returns jsonb
language sql stable security definer set search_path=public as $$
with
params as (select public.business_date() today,public.is_hr_user(auth.uid()) hr_reporting),
reportable_hr_cases as (
  select c.*,p.display_name person_name,p.employee_id person_employee_id,
    coalesce(tm.name,'—') team_name,e.team_id,e.role_title employment_role,
    e.supervisor_name employment_supervisor,e.location employment_location,
    case when c.case_type='Onboarding' then c.start_date
         when c.case_type='Offboarding' then coalesce(c.last_working_day,c.contract_end_date) end reporting_date
  from public.cases c join public.persons p on p.id=c.person_id
  left join public.employments e on e.id=c.employment_id
  left join public.teams tm on tm.id=coalesce(e.team_id,p.team_id)
  where c.archived_at is null and p.archived_at is null
    and (select hr_reporting from params)
    and public.can_manage_case(auth.uid(),c.id)
),
filtered_hr_cases as (
  select * from reportable_hr_cases c where
    (nullif(_team,'') is null or c.team_name=_team)
    and (nullif(_employment_type,'') is null or c.employment_type=_employment_type)
    and (nullif(_case_type,'') is null or lower(c.case_type)=lower(_case_type))
    and (nullif(_status,'') is null or c.status=_status)
    and (_date_from is null or c.reporting_date>=_date_from)
    and (_date_to is null or c.reporting_date<=_date_to)
),
authorized_tasks as (
  select t.*,c.employment_type,c.status case_status,
    case when t.case_type='Onboarding' then t.start_date
         when t.case_type='Offboarding' then coalesce(t.last_working_day,t.contract_end_date) end reporting_date
  from public.list_operational_tasks(null) t join public.cases c on c.id=t.case_id
),
task_rows as (
  select * from authorized_tasks t where
    (nullif(_team,'') is null or t.person_team=_team)
    and (nullif(_employment_type,'') is null or t.employment_type=_employment_type)
    and (nullif(_case_type,'') is null or lower(t.case_type)=lower(_case_type))
    and (nullif(_status,'') is null or t.case_status=_status)
    and (_date_from is null or t.reporting_date>=_date_from)
    and (_date_to is null or t.reporting_date<=_date_to)
),
outstanding_tasks as (
  select * from task_rows where status in ('Not Started','Open','In Progress','Waiting','Blocked')
),
active_people as (
  select e.person_id,e.source_onboarding_case_id case_id,p.display_name person_name,
    coalesce(e.employee_id,p.employee_id) employee_id,e.employment_type,coalesce(tm.name,'—') team_name,
    e.role_title,e.location,e.supervisor_name,e.start_date,
    exists(select 1 from filtered_hr_cases oc where oc.employment_id=e.id and oc.case_type='Offboarding'
      and oc.status<>'Cancelled' and oc.left_at is null) leaving,
    (select oc.last_working_day from filtered_hr_cases oc where oc.employment_id=e.id and oc.case_type='Offboarding'
      and oc.status<>'Cancelled' and oc.left_at is null order by oc.created_at desc limit 1) last_working_day
  from public.employment_effective e join public.persons p on p.id=e.person_id left join public.teams tm on tm.id=e.team_id
  where e.effective_status in ('active','ending') and p.archived_at is null
    and exists(select 1 from filtered_hr_cases fc where fc.employment_id=e.id)
),
case_task_progress as (
  select case_id,count(*) filter(where mandatory and status<>'Not Applicable') mandatory_total,
    count(*) filter(where mandatory and status='Completed') mandatory_completed,
    count(*) filter(where mandatory and status in ('Not Started','Open','In Progress','Waiting','Blocked')
      and due_date<(select today from params)) overdue
  from task_rows group by case_id
),
attention_candidates as (
  select c.id case_id,c.person_name,c.case_type,'Critical' severity,'Mandatory task overdue' reason,t.id task_id,1 severity_rank
  from filtered_hr_cases c join outstanding_tasks t on t.case_id=c.id and t.mandatory
  where t.due_date<(select today from params)
  union all select c.id,c.person_name,c.case_type,'Warning','Start Date approaching with mandatory preparation incomplete',null::uuid,2
  from filtered_hr_cases c where c.case_type='Onboarding' and c.joined_at is null
    and c.start_date between (select today from params) and (select today+14 from params)
    and exists(select 1 from outstanding_tasks t where t.case_id=c.id and t.mandatory)
  union all select c.id,c.person_name,c.case_type,'Warning','Employee ID missing near Start Date',null::uuid,2
  from filtered_hr_cases c where c.case_type='Onboarding' and c.joined_at is null and c.person_employee_id is null
    and c.start_date between (select today from params) and (select today+28 from params)
  union all select c.id,c.person_name,c.case_type,'Warning','Last Working Day not confirmed',null::uuid,2
  from filtered_hr_cases c where c.case_type='Offboarding' and c.left_at is null and c.last_working_day is null
  union all select c.id,c.person_name,c.case_type,'Critical','LWD approaching with IT/Admin work unresolved',t.id,1
  from filtered_hr_cases c join outstanding_tasks t on t.case_id=c.id and t.owner_team in ('IT','Admin')
  where c.case_type='Offboarding' and c.left_at is null
    and c.last_working_day between (select today from params) and (select today+7 from params)
  union all select c.id,c.person_name,c.case_type,'Critical','Post-leaving mandatory task still open',t.id,1
  from filtered_hr_cases c join outstanding_tasks t on t.case_id=c.id and t.mandatory
  where c.case_type='Offboarding' and c.left_at is not null
),
attention as (select distinct on(case_id) * from attention_candidates order by case_id,severity_rank,task_id nulls last),
months as (select generate_series(date_trunc('month',(select today from params)::timestamp)-interval '11 months',
  date_trunc('month',(select today from params)::timestamp),interval '1 month')::date month_start)
select jsonb_build_object(
  'reportingMode',case when (select hr_reporting from params) then 'hr' else 'operational' end,
  'businessDate',(select today from params),
  'metrics',jsonb_build_object(
    'activePeople',(select count(*) from active_people),
    'preboarding',(select count(*) from filtered_hr_cases c left join public.employment_effective e on e.id=c.employment_id
      where c.case_type='Onboarding' and c.status<>'Cancelled' and c.joined_at is null and coalesce(e.effective_status,'planned')='planned'),
    'leaving',(select count(*) from active_people where leaving),
    'joinedYtd',(select count(*) from filtered_hr_cases where case_type='Onboarding' and joined_date between date_trunc('year',(select today from params)::timestamp)::date and (select today from params)),
    'leftYtd',(select count(*) from filtered_hr_cases where case_type='Offboarding' and left_date between date_trunc('year',(select today from params)::timestamp)::date and (select today from params)),
    'openMandatoryTasks',(select count(*) from outstanding_tasks where mandatory),
    'overdueMandatoryTasks',(select count(*) from outstanding_tasks where mandatory and due_date<(select today from params))
  ),
  'activePeople',coalesce((select jsonb_agg(jsonb_build_object('personId',person_id,'caseId',case_id,'name',person_name,
    'employeeId',employee_id,'employmentType',employment_type,'team',team_name,'role',role_title,'location',location,
    'supervisorName',supervisor_name,'startDate',start_date,'leaving',leaving,'lastWorkingDay',last_working_day) order by person_name)
    from active_people),'[]'::jsonb),
  'upcomingJoiners',coalesce((select jsonb_agg(jsonb_build_object('caseId',c.id,'name',c.person_name,'team',c.team_name,
    'employmentType',c.employment_type,'startDate',c.start_date,'status',c.status,'mandatoryCompleted',coalesce(p.mandatory_completed,0),
    'mandatoryTotal',coalesce(p.mandatory_total,0),'overdueTasks',coalesce(p.overdue,0)) order by c.start_date)
    from filtered_hr_cases c left join case_task_progress p on p.case_id=c.id where c.case_type='Onboarding'
      and c.status<>'Cancelled' and c.joined_at is null and c.start_date between (select today from params) and (select today+30 from params)),'[]'::jsonb),
  'upcomingLeavers',coalesce((select jsonb_agg(jsonb_build_object('caseId',c.id,'name',c.person_name,'team',c.team_name,
    'employmentType',c.employment_type,'lastWorkingDay',c.last_working_day,'contractEndDate',c.contract_end_date,
    'leavingType',c.leaving_type,'status',c.status,'mandatoryCompleted',coalesce(p.mandatory_completed,0),
    'mandatoryTotal',coalesce(p.mandatory_total,0),'overdueTasks',coalesce(p.overdue,0)) order by c.reporting_date)
    from filtered_hr_cases c left join case_task_progress p on p.case_id=c.id where c.case_type='Offboarding'
      and c.status<>'Cancelled' and c.left_at is null and c.reporting_date between (select today from params) and (select today+30 from params)),'[]'::jsonb),
  'attentionCases',coalesce((select jsonb_agg(jsonb_build_object('caseId',case_id,'taskId',task_id,'name',person_name,
    'caseType',case_type,'severity',severity,'reason',reason) order by severity_rank,person_name) from attention),'[]'::jsonb),
  'taskWorkload',coalesce((select jsonb_agg(jsonb_build_object('ownerTeam',team,'open',open_count,'overdue',overdue_count,
    'dueSoon',due_soon_count,'unassigned',unassigned_count) order by array_position(array['HR','IT','Admin'],team)) from (
      select team,count(o.id) open_count,count(o.id) filter(where o.due_date<(select today from params)) overdue_count,
        count(o.id) filter(where o.due_date>=(select today from params) and o.due_date<=(select today+14 from params)) due_soon_count,
        count(o.id) filter(where o.owner_id is null) unassigned_count
      from unnest(case when (select hr_reporting from params) then array['HR','IT','Admin'] else
        coalesce((select array_agg(owner_team order by owner_team) from public.user_operational_teams where user_id=auth.uid()),array[]::text[]) end) team
      left join outstanding_tasks o on o.owner_team=team group by team
    ) workload),'[]'::jsonb),
  'activeByEmploymentType',coalesce((select jsonb_agg(jsonb_build_object('name',employment_type,'value',amount) order by employment_type)
    from(select employment_type,count(*) amount from active_people group by employment_type)x),'[]'::jsonb),
  'activeByTeam',coalesce((select jsonb_agg(jsonb_build_object('name',team_name,'value',amount) order by team_name)
    from(select team_name,count(*) amount from active_people group by team_name)x),'[]'::jsonb),
  'monthlyLifecycleTrend',coalesce((select jsonb_agg(jsonb_build_object('month',to_char(m.month_start,'YYYY-MM'),
    'joined',(select count(*) from filtered_hr_cases c where c.case_type='Onboarding' and date_trunc('month',c.joined_date::timestamp)::date=m.month_start),
    'left',(select count(*) from filtered_hr_cases c where c.case_type='Offboarding' and date_trunc('month',c.left_date::timestamp)::date=m.month_start))
    order by m.month_start) from months m),'[]'::jsonb),
  'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',id,'caseId',case_id,'title',title,'person',person_name,
    'caseType',case_type,'ownerTeam',owner_team,'assignee',owner_name,'mandatory',mandatory,'status',status,
    'dueDate',due_date,'completedBy',completed_by_name,'completedAt',completed_at) order by due_date nulls last,title) from task_rows),'[]'::jsonb)
)
$$;
revoke all on function public.get_operations_overview(text,text,text,text,date,date) from public,anon;
grant execute on function public.get_operations_overview(text,text,text,text,date,date) to authenticated;
