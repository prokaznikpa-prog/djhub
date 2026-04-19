CREATE OR REPLACE FUNCTION public.post_has_selected_dj(post_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.applications
    WHERE post_id = post_uuid
      AND status = 'accepted'
  )
  OR EXISTS (
    SELECT 1
    FROM public.bookings
    WHERE post_id = post_uuid
      AND status <> 'cancelled'
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_interaction_after_post_selection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.venue_posts
    WHERE id = NEW.post_id
      AND status <> 'open'
  ) THEN
    RAISE EXCEPTION 'Post is not accepting new interactions'
      USING ERRCODE = '23514';
  END IF;

  IF public.post_has_selected_dj(NEW.post_id) THEN
    RAISE EXCEPTION 'A DJ has already been selected for this post'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_application_after_post_selection ON public.applications;
CREATE TRIGGER prevent_application_after_post_selection
BEFORE INSERT ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.prevent_interaction_after_post_selection();

DROP TRIGGER IF EXISTS prevent_invitation_after_post_selection ON public.invitations;
CREATE TRIGGER prevent_invitation_after_post_selection
BEFORE INSERT ON public.invitations
FOR EACH ROW EXECUTE FUNCTION public.prevent_interaction_after_post_selection();

CREATE OR REPLACE FUNCTION public.prevent_closing_engaged_venue_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'open' AND NEW.status = 'closed' THEN
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

DROP TRIGGER IF EXISTS prevent_closing_engaged_venue_post ON public.venue_posts;
CREATE TRIGGER prevent_closing_engaged_venue_post
BEFORE UPDATE OF status ON public.venue_posts
FOR EACH ROW EXECUTE FUNCTION public.prevent_closing_engaged_venue_post();
