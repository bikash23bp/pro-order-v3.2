
CREATE TABLE public.note_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('shipping','invoice','internal')),
  label TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_note_templates_kind ON public.note_templates(kind);

ALTER TABLE public.note_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view note_templates" ON public.note_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "staff manage note_templates insert" ON public.note_templates
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'can_manage_orders'));

CREATE POLICY "staff manage note_templates update" ON public.note_templates
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'can_manage_orders'))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'can_manage_orders'));

CREATE POLICY "staff manage note_templates delete" ON public.note_templates
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR user_has_permission(auth.uid(),'can_manage_orders'));
