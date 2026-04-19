ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS confirmed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone;

ALTER TABLE public.bookings
ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE public.bookings
ADD CONSTRAINT bookings_status_check
CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled'));

CREATE OR REPLACE FUNCTION public.set_booking_lifecycle_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_date_text text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := COALESCE(NEW.status, 'pending');
  END IF;

  IF NEW.status NOT IN ('pending', 'confirmed', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid booking status: %', NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IN ('completed', 'cancelled') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'Completed or cancelled bookings cannot change status'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF TG_OP = 'UPDATE' AND OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Only pending bookings can be confirmed'
        USING ERRCODE = '23514';
    END IF;
    NEW.confirmed_at := COALESCE(NEW.confirmed_at, now());
  END IF;

  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF TG_OP = 'UPDATE' AND OLD.status <> 'confirmed' THEN
      RAISE EXCEPTION 'Only confirmed bookings can be completed'
        USING ERRCODE = '23514';
    END IF;

    SELECT event_date
    INTO event_date_text
    FROM public.venue_posts
    WHERE id = NEW.post_id;

    IF event_date_text IS NULL
      OR event_date_text !~ '^\d{4}-\d{2}-\d{2}$'
      OR event_date_text::date >= CURRENT_DATE THEN
      RAISE EXCEPTION 'Booking can be completed only after event date passes'
        USING ERRCODE = '23514';
    END IF;

    NEW.completed_at := COALESCE(NEW.completed_at, now());
  END IF;

  IF NEW.status = 'cancelled' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF TG_OP = 'UPDATE' AND OLD.status NOT IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'Only pending or confirmed bookings can be cancelled'
        USING ERRCODE = '23514';
    END IF;
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_booking_lifecycle_fields ON public.bookings;
CREATE TRIGGER set_booking_lifecycle_fields
BEFORE INSERT OR UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.set_booking_lifecycle_fields();

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
  );
$$;

DROP POLICY IF EXISTS "Participants can update bookings" ON public.bookings;
CREATE POLICY "Participants can update bookings"
ON public.bookings FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.dj_profiles
    WHERE id = bookings.dj_id AND user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.venue_profiles
    WHERE id = bookings.venue_id AND user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.dj_profiles
    WHERE id = bookings.dj_id AND user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.venue_profiles
    WHERE id = bookings.venue_id AND user_id = auth.uid()
  )
);
