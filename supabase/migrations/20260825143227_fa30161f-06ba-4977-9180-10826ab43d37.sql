GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;

DROP POLICY IF EXISTS "Templates are readable by active users" ON public.email_templates;
DROP POLICY IF EXISTS "Admins and operators can manage templates" ON public.email_templates;
DROP POLICY IF EXISTS "email_templates_select_active" ON public.email_templates;
DROP POLICY IF EXISTS "email_templates_manage_admin_operator" ON public.email_templates;

CREATE POLICY "email_templates_select_active"
ON public.email_templates
FOR SELECT
TO authenticated
USING (public.is_active_user(auth.uid()));

CREATE POLICY "email_templates_manage_admin_operator"
ON public.email_templates
FOR ALL
TO authenticated
USING (
  public.is_active_user(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  )
)
WITH CHECK (
  public.is_active_user(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  )
);