CREATE OR REPLACE FUNCTION public.prevent_unsafe_venue_post_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'closed' THEN
    RAISE EXCEPTION 'Open posts cannot be deleted'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (SELECT 1 FROM public.applications WHERE post_id = OLD.id) THEN
    RAISE EXCEPTION 'Posts with applications cannot be deleted'
      USING ERRCODE = '23503';
  END IF;

  IF EXISTS (SELECT 1 FROM public.invitations WHERE post_id = OLD.id) THEN
    RAISE EXCEPTION 'Posts with invitations cannot be deleted'
      USING ERRCODE = '23503';
  END IF;

  IF EXISTS (SELECT 1 FROM public.bookings WHERE post_id = OLD.id) THEN
    RAISE EXCEPTION 'Posts with bookings cannot be deleted'
      USING ERRCODE = '23503';
  END IF;

  IF EXISTS (SELECT 1 FROM public.chat_threads WHERE gig_id = OLD.id) THEN
    RAISE EXCEPTION 'Posts with chat threads cannot be deleted'
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_unsafe_venue_post_delete ON public.venue_posts;
CREATE TRIGGER prevent_unsafe_venue_post_delete
BEFORE DELETE ON public.venue_posts
FOR EACH ROW EXECUTE FUNCTION public.prevent_unsafe_venue_post_delete();
