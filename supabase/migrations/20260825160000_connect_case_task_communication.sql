-- Strengthen the existing persons -> cases -> tasks -> communications model.
create unique index if not exists persons_employee_id_unique
  on public.persons (lower(employee_id)) where employee_id is not null and trim(employee_id) <> '';

alter table public.tasks add column if not exists assignee_role text;
alter table public.tasks add column if not exists default_task_key text;
create unique index if not exists tasks_case_default_key_unique
  on public.tasks(case_id, default_task_key) where default_task_key is not null;

alter table public.email_templates
  add column if not exists applicable_case_types text[] not null default array['onboarding','offboarding']::text[];

update public.email_templates
set applicable_case_types = case
  when lower(category) = 'onboarding' then array['onboarding']::text[]
  when lower(category) = 'offboarding' then array['offboarding']::text[]
  else array['onboarding','offboarding']::text[]
end;

create or replace function public.create_default_onboarding_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.case_type = 'Onboarding' then
    insert into public.tasks(case_id,title,task_type,owner_id,assignee_role,status,due_date,priority,default_task_key)
    values
      (new.id,'Prepare IT equipment','IT',new.owner_id,'it_support','Not Started',new.start_date - 14,'High','prepare_it_equipment'),
      (new.id,'Send Welcome Email','Email',new.owner_id,'hr','Not Started',new.start_date - 14,'High','send_welcome_email'),
      (new.id,'Schedule onboarding meeting','Meeting',new.owner_id,'manager','Not Started',new.start_date - 7,'Medium','schedule_onboarding_meeting')
    on conflict (case_id, default_task_key) where default_task_key is not null do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists cases_create_default_onboarding_tasks on public.cases;
create trigger cases_create_default_onboarding_tasks
after insert on public.cases
for each row execute function public.create_default_onboarding_tasks();

-- Safely backfill existing onboarding cases without duplicating any default task.
insert into public.tasks(case_id,title,task_type,owner_id,assignee_role,status,due_date,priority,default_task_key)
select c.id,v.title,v.task_type,c.owner_id,v.assignee_role,'Not Started',c.start_date - v.days_before,v.priority,v.task_key
from public.cases c
cross join (values
  ('Prepare IT equipment','IT','it_support',14,'High','prepare_it_equipment'),
  ('Send Welcome Email','Email','hr',14,'High','send_welcome_email'),
  ('Schedule onboarding meeting','Meeting','manager',7,'Medium','schedule_onboarding_meeting')
) as v(title,task_type,assignee_role,days_before,priority,task_key)
where c.case_type = 'Onboarding'
on conflict (case_id, default_task_key) where default_task_key is not null do nothing;

create or replace function public.complete_email_task(
  _task_id uuid,
  _case_id uuid,
  _template_id uuid,
  _subject text,
  _body text,
  _recipient text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  task_row public.tasks%rowtype;
begin
  select * into task_row from public.tasks where id=_task_id and case_id=_case_id for update;
  if caller_id is null or task_row.id is null
    or public.case_access(caller_id,_case_id) not in ('owner','collaborator') then
    return false;
  end if;
  if task_row.default_task_key <> 'send_welcome_email' and lower(task_row.task_type) <> 'email' then
    raise exception 'Task is not an email task';
  end if;

  update public.tasks set status='Completed',completed_at=now(),updated_at=now() where id=_task_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,previous_value,new_value,case_id,metadata)
  values(caller_id,'task',_task_id::text,'Welcome email marked as sent','status',task_row.status,'Completed',_case_id,
    jsonb_build_object('templateId',_template_id,'subject',_subject,'recipient',_recipient,'body',_body));
  return true;
end;
$$;

revoke all on function public.complete_email_task(uuid,uuid,uuid,text,text,text) from public,anon;
grant execute on function public.complete_email_task(uuid,uuid,uuid,text,text,text) to authenticated;
