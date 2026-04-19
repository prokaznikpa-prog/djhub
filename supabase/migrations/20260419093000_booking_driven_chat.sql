UPDATE public.chat_threads thread_row
SET booking_id = booking_row.id
FROM public.bookings booking_row
WHERE thread_row.booking_id IS NULL
  AND booking_row.application_id = thread_row.application_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.bookings
    GROUP BY post_id, dj_id, venue_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate bookings exist for post_id/dj_id/venue_id; resolve them before adding booking uniqueness'
      USING ERRCODE = '23505';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_post_dj_venue_unique_idx
ON public.bookings(post_id, dj_id, venue_id);

CREATE OR REPLACE FUNCTION public.is_chat_thread_booking_ready(thread_row public.chat_threads)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings booking_row
    JOIN public.applications application_row ON application_row.id = booking_row.application_id
    WHERE booking_row.id = thread_row.booking_id
      AND booking_row.application_id = thread_row.application_id
      AND booking_row.post_id = thread_row.gig_id
      AND booking_row.dj_id = thread_row.dj_id
      AND booking_row.venue_id = thread_row.venue_id
      AND application_row.status = 'accepted'
  );
$$;
