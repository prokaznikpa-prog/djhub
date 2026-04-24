CREATE OR REPLACE FUNCTION public.close_post_after_booking_selection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'confirmed'
    AND EXISTS (
      SELECT 1
      FROM public.applications AS application_row
      JOIN public.venue_posts AS post_row
        ON post_row.id = NEW.post_id
      WHERE application_row.id = NEW.application_id
        AND COALESCE(application_row.application_round, 1) = COALESCE(post_row.application_round, 1)
    )
  THEN
    UPDATE public.venue_posts
    SET status = 'closed'
    WHERE id = NEW.post_id
      AND status = 'open';
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.venue_posts AS post_row
SET status = 'open'
WHERE post_row.status = 'closed'
  AND EXISTS (
    SELECT 1
    FROM public.bookings AS booking_row
    JOIN public.applications AS application_row
      ON application_row.id = booking_row.application_id
    WHERE booking_row.post_id = post_row.id
      AND booking_row.status = 'pending'
      AND COALESCE(application_row.application_round, 1) = COALESCE(post_row.application_round, 1)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.bookings AS booking_row
    JOIN public.applications AS application_row
      ON application_row.id = booking_row.application_id
    WHERE booking_row.post_id = post_row.id
      AND booking_row.status IN ('confirmed', 'completed')
      AND COALESCE(application_row.application_round, 1) = COALESCE(post_row.application_round, 1)
  );
