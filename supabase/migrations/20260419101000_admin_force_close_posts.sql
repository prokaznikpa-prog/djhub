CREATE OR REPLACE FUNCTION public.prevent_closing_engaged_venue_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'open' AND NEW.status = 'closed' THEN
    IF public.has_role(auth.uid(), 'admin') THEN
      RETURN NEW;
    END IF;

    IF public.post_has_selected_dj(OLD.id) THEN
      RETURN NEW;
    END IF;

    IF EXISTS (SELECT 1 FROM public.applications WHERE post_id = OLD.id AND status IN ('new', 'accepted')) THEN
      RAISE EXCEPTION 'Posts with active applications cannot be closed'
        USING ERRCODE = '23503';
    END IF;

    IF EXISTS (SELECT 1 FROM public.invitations WHERE post_id = OLD.id AND status IN ('new', 'accepted')) THEN
      RAISE EXCEPTION 'Posts with active invitations cannot be closed'
        USING ERRCODE = '23503';
    END IF;

    IF EXISTS (SELECT 1 FROM public.bookings WHERE post_id = OLD.id AND status IN ('pending', 'confirmed')) THEN
      RAISE EXCEPTION 'Posts with active bookings cannot be closed'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
