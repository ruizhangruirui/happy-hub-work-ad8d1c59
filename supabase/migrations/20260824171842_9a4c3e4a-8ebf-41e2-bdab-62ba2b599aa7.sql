CREATE OR REPLACE FUNCTION public.set_task_completion(_task_id uuid, _complete boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _item uuid;
  _case uuid;
  _access text;
begin
  select t.checklist_item_id, t.case_id into _item, _case
  from public.tasks t where t.id = _task_id;
  if _case is null then raise exception 'task not found'; end if;

  _access := public.case_access(auth.uid(), _case);
  if not (
    _access in ('owner', 'collaborator', 'scoped')
    or exists (select 1 from public.tasks t where t.id = _task_id and t.owner_id = auth.uid())
  ) then
    raise exception 'forbidden';
  end if;

  update public.tasks set
    status = case when _complete then 'Completed' else 'Open' end,
    completed_at = case when _complete then now() else null end,
    updated_at = now()
  where id = _task_id;

  if _item is not null then
    update public.checklist_items set
      status = case when _complete then 'Completed' else 'Open' end,
      completed_date = case when _complete then now() else null end,
      completed_by = case when _complete then auth.uid() else null end,
      updated_at = now()
    where id = _item;
  end if;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, case_id)
  values (auth.uid(), 'task', _task_id::text,
          case when _complete then 'Task completed' else 'Task reopened' end, _case);
end
$function$;

CREATE OR REPLACE FUNCTION public.set_checklist_completion(_item_id uuid, _complete boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _task uuid;
  _case uuid;
  _access text;
begin
  select ci.task_id, ci.case_id into _task, _case
  from public.checklist_items ci where ci.id = _item_id;
  if _case is null then raise exception 'checklist item not found'; end if;

  _access := public.case_access(auth.uid(), _case);
  if not (
    _access in ('owner', 'collaborator', 'scoped')
    or exists (select 1 from public.checklist_items ci where ci.id = _item_id and ci.owner_id = auth.uid())
  ) then
    raise exception 'forbidden';
  end if;

  update public.checklist_items set
    status = case when _complete then 'Completed' else 'Open' end,
    completed_date = case when _complete then now() else null end,
    completed_by = case when _complete then auth.uid() else null end,
    updated_at = now()
  where id = _item_id;

  if _task is not null then
    update public.tasks set
      status = case when _complete then 'Completed' else 'Open' end,
      completed_at = case when _complete then now() else null end,
      updated_at = now()
    where id = _task;
  end if;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, case_id)
  values (auth.uid(), 'checklist_item', _item_id::text,
          case when _complete then 'Checklist item completed' else 'Checklist item reopened' end, _case);
end
$function$;