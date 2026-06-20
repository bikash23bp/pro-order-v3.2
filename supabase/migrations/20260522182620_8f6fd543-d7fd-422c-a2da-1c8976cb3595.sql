CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  content text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_pair ON public.chat_messages (sender_id, receiver_id, created_at DESC);
CREATE INDEX idx_chat_messages_receiver_unread ON public.chat_messages (receiver_id) WHERE read_at IS NULL;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own chat_messages"
ON public.chat_messages FOR SELECT TO authenticated
USING (sender_id = (SELECT auth.uid()) OR receiver_id = (SELECT auth.uid()));

CREATE POLICY "users send chat_messages"
ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (sender_id = (SELECT auth.uid()));

CREATE POLICY "receiver marks read chat_messages"
ON public.chat_messages FOR UPDATE TO authenticated
USING (receiver_id = (SELECT auth.uid()))
WITH CHECK (receiver_id = (SELECT auth.uid()));

CREATE POLICY "admins delete chat_messages"
ON public.chat_messages FOR DELETE TO authenticated
USING (has_role((SELECT auth.uid()), 'admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;