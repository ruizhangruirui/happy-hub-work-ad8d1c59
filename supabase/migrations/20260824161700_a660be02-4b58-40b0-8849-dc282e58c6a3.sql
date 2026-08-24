CREATE OR REPLACE FUNCTION public.is_active_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = _user_id and p.status = 'Active'
  )
$$;

DROP POLICY "Active users read profiles" ON public.profiles;
CREATE POLICY "Active users read profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_active_user(auth.uid()));