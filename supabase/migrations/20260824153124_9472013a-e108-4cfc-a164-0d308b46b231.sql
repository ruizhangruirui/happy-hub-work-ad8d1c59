revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.case_access(uuid, uuid) from public, anon;
revoke execute on function public.set_task_completion(uuid, boolean) from public, anon;
revoke execute on function public.set_checklist_completion(uuid, boolean) from public, anon;