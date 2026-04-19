CREATE OR REPLACE FUNCTION public.close_post_after_booking_selection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'cancelled' THEN
    UPDATE public.venue_posts
    SET status = 'closed'
    WHERE id = NEW.post_id
      AND status = 'open';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS close_post_after_booking_selection ON public.bookings;
CREATE TRIGGER close_post_after_booking_selection
AFTER INSERT OR UPDATE OF status, post_id ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.close_post_after_booking_selection();

UPDATE public.venue_posts AS post
SET status = 'closed'
WHERE post.status = 'open'
  AND EXISTS (
    SELECT 1
    FROM public.bookings AS booking
    WHERE booking.post_id = post.id
      AND booking.status <> 'cancelled'
  );
