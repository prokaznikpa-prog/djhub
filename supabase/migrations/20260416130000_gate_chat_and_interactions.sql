ALTER TABLE public.invitations
ADD COLUMN IF NOT EXISTS application_round integer NOT NULL DEFAULT 1;

ALTER TABLE public.invitations
DROP CONSTRAINT IF EXISTS invitations_venue_id_dj_id_post_id_key;

DROP INDEX IF EXISTS public.invitations_venue_dj_post_round_unique_idx;
CREATE UNIQUE INDEX invitations_venue_dj_post_round_unique_idx
ON public.invitations(venue_id, dj_id, post_id, application_round);

ALTER TABLE public.chat_threads
DROP CONSTRAINT IF EXISTS chat_threads_gig_id_dj_id_venue_id_key;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_application_interaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_round integer;
BEGIN
  SELECT application_round
  INTO current_round
  FROM public.venue_posts
  WHERE id = NEW.post_id;

  NEW.application_round := COALESCE(NEW.application_round, current_round, 1);

  IF EXISTS (
    SELECT 1
    FROM public.invitations invitation_row
    WHERE invitation_row.dj_id = NEW.dj_id
      AND invitation_row.post_id = NEW.post_id
      AND invitation_row.application_round = NEW.application_round
      AND invitation_row.status IN ('new', 'accepted')
  ) THEN
    RAISE EXCEPTION 'Active interaction already exists for this DJ and post round'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_invitation_interaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_round integer;
BEGIN
  SELECT application_round
  INTO current_round
  FROM public.venue_posts
  WHERE id = NEW.post_id;

  NEW.application_round := COALESCE(NEW.application_round, current_round, 1);

  IF EXISTS (
    SELECT 1
    FROM public.applications application_row
    WHERE application_row.dj_id = NEW.dj_id
      AND application_row.post_id = NEW.post_id
      AND application_row.application_round = NEW.application_round
  ) THEN
    RAISE EXCEPTION 'Application already exists for this DJ and post round'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings booking_row
    JOIN public.applications application_row ON application_row.id = booking_row.application_id
    WHERE booking_row.dj_id = NEW.dj_id
      AND booking_row.post_id = NEW.post_id
      AND application_row.application_round = NEW.application_round
  ) THEN
    RAISE EXCEPTION 'Booking already exists for this DJ and post round'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_duplicate_application_interaction ON public.applications;
CREATE TRIGGER prevent_duplicate_application_interaction
BEFORE INSERT ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_application_interaction();

DROP TRIGGER IF EXISTS prevent_duplicate_invitation_interaction ON public.invitations;
CREATE TRIGGER prevent_duplicate_invitation_interaction
BEFORE INSERT ON public.invitations
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_invitation_interaction();

CREATE OR REPLACE FUNCTION public.is_chat_thread_booking_ready(thread_row public.chat_threads)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.applications application_row
    JOIN public.bookings booking_row ON booking_row.application_id = application_row.id
    WHERE application_row.id = thread_row.application_id
      AND application_row.status = 'accepted'
      AND booking_row.status <> 'cancelled'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_chat_thread_participant(thread_row public.chat_threads)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_chat_thread_booking_ready(thread_row)
    AND (
      EXISTS (
        SELECT 1 FROM public.dj_profiles
        WHERE id = thread_row.dj_id AND user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.venue_profiles
        WHERE id = thread_row.venue_id AND user_id = auth.uid()
      )
      OR public.has_role(auth.uid(), 'admin')
    );
$$;

CREATE OR REPLACE FUNCTION public.can_send_chat_message(thread_uuid uuid, sender_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_chat_thread_id_participant(thread_uuid)
    AND (
      EXISTS (
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
      OR public.has_role(auth.uid(), 'admin')
    );
$$;
