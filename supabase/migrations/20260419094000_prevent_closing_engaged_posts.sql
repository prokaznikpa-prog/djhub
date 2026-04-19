CREATE OR REPLACE FUNCTION public.prevent_closing_engaged_venue_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'open' AND NEW.status = 'closed' THEN
    IF EXISTS (SELECT 1 FROM public.applications WHERE post_id = OLD.id) THEN
      RAISE EXCEPTION 'Posts with applications cannot be closed'
        USING ERRCODE = '23503';
    END IF;

    IF EXISTS (SELECT 1 FROM public.invitations WHERE post_id = OLD.id) THEN
      RAISE EXCEPTION 'Posts with invitations cannot be closed'
        USING ERRCODE = '23503';
    END IF;

    IF EXISTS (SELECT 1 FROM public.bookings WHERE post_id = OLD.id) THEN
      RAISE EXCEPTION 'Posts with bookings cannot be closed'
        USING ERRCODE = '23503';
    END IF;

    IF EXISTS (SELECT 1 FROM public.chat_threads WHERE gig_id = OLD.id) THEN
      RAISE EXCEPTION 'Posts with chat threads cannot be closed'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_closing_engaged_venue_post ON public.venue_posts;
CREATE TRIGGER prevent_closing_engaged_venue_post
BEFORE UPDATE OF status ON public.venue_posts
FOR EACH ROW EXECUTE FUNCTION public.prevent_closing_engaged_venue_post();
