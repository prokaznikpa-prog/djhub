CREATE TABLE IF NOT EXISTS public.chat_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  gig_id UUID NOT NULL REFERENCES public.venue_posts(id) ON DELETE CASCADE,
  dj_id UUID NOT NULL REFERENCES public.dj_profiles(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venue_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(application_id),
  UNIQUE(gig_id, dj_id, venue_id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  text TEXT NOT NULL CHECK (char_length(trim(text)) > 0 AND char_length(text) <= 1000),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_chat_threads_updated_at
BEFORE UPDATE ON public.chat_threads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_chat_thread_participant(thread_row public.chat_threads)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dj_profiles
    WHERE id = thread_row.dj_id AND user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.venue_profiles
    WHERE id = thread_row.venue_id AND user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_chat_thread_id_participant(thread_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_threads thread_row
    WHERE thread_row.id = thread_uuid
    AND public.is_chat_thread_participant(thread_row)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_send_chat_message(thread_uuid uuid, sender_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_threads thread_row
    JOIN public.dj_profiles dj ON dj.id = thread_row.dj_id
    WHERE thread_row.id = thread_uuid
      AND thread_row.dj_id = sender_uuid
      AND dj.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.chat_threads thread_row
    JOIN public.venue_profiles venue ON venue.id = thread_row.venue_id
    WHERE thread_row.id = thread_uuid
      AND thread_row.venue_id = sender_uuid
      AND venue.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin');
$$;

DROP POLICY IF EXISTS "Participants can view chat threads" ON public.chat_threads;
CREATE POLICY "Participants can view chat threads"
ON public.chat_threads FOR SELECT TO authenticated
USING (public.is_chat_thread_participant(chat_threads));

DROP POLICY IF EXISTS "Participants can create chat threads" ON public.chat_threads;
CREATE POLICY "Participants can create chat threads"
ON public.chat_threads FOR INSERT TO authenticated
WITH CHECK (public.is_chat_thread_participant(chat_threads));

DROP POLICY IF EXISTS "Participants can update chat threads" ON public.chat_threads;
CREATE POLICY "Participants can update chat threads"
ON public.chat_threads FOR UPDATE TO authenticated
USING (public.is_chat_thread_participant(chat_threads));

DROP POLICY IF EXISTS "Participants can view chat messages" ON public.chat_messages;
CREATE POLICY "Participants can view chat messages"
ON public.chat_messages FOR SELECT TO authenticated
USING (public.is_chat_thread_id_participant(thread_id));

DROP POLICY IF EXISTS "Participants can send chat messages" ON public.chat_messages;
CREATE POLICY "Participants can send chat messages"
ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (public.can_send_chat_message(thread_id, sender_id));
