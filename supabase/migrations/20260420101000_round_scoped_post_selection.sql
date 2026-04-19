CREATE OR REPLACE FUNCTION public.post_has_selected_dj(post_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_post AS (
    SELECT COALESCE(application_round, 1) AS current_round
    FROM public.venue_posts
    WHERE id = post_uuid
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.applications AS application_row
    CROSS JOIN current_post
    WHERE application_row.post_id = post_uuid
      AND application_row.status = 'accepted'
      AND COALESCE(application_row.application_round, 1) = current_post.current_round
  )
  OR EXISTS (
    SELECT 1
    FROM public.bookings AS booking_row
    JOIN public.applications AS application_row
      ON application_row.id = booking_row.application_id
    CROSS JOIN current_post
    WHERE booking_row.post_id = post_uuid
      AND booking_row.status <> 'cancelled'
      AND COALESCE(application_row.application_round, 1) = current_post.current_round
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
      AND (
        status <> 'open'
        OR COALESCE(moderation_status, 'active') <> 'active'
      )
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
DECLARE
  current_round integer := COALESCE(OLD.application_round, 1);
BEGIN
  IF OLD.status = 'open' AND NEW.status = 'closed' THEN
    IF public.has_role(auth.uid(), 'admin') THEN
      RETURN NEW;
    END IF;

    IF public.post_has_selected_dj(OLD.id) THEN
      RETURN NEW;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.applications AS application_row
      WHERE application_row.post_id = OLD.id
        AND application_row.status IN ('new', 'accepted')
        AND COALESCE(application_row.application_round, 1) = current_round
    ) THEN
      RAISE EXCEPTION 'Posts with active applications cannot be closed'
        USING ERRCODE = '23503';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.invitations AS invitation_row
      WHERE invitation_row.post_id = OLD.id
        AND invitation_row.status IN ('new', 'accepted')
        AND COALESCE(invitation_row.application_round, 1) = current_round
    ) THEN
      RAISE EXCEPTION 'Posts with active invitations cannot be closed'
        USING ERRCODE = '23503';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.bookings AS booking_row
      JOIN public.applications AS application_row
        ON application_row.id = booking_row.application_id
      WHERE booking_row.post_id = OLD.id
        AND booking_row.status IN ('pending', 'confirmed')
        AND COALESCE(application_row.application_round, 1) = current_round
    ) THEN
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

CREATE OR REPLACE FUNCTION public.close_post_after_booking_selection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'cancelled'
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

DROP TRIGGER IF EXISTS close_post_after_booking_selection ON public.bookings;
CREATE TRIGGER close_post_after_booking_selection
AFTER INSERT OR UPDATE OF status, post_id ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.close_post_after_booking_selection();

UPDATE public.venue_posts AS post_row
SET status = 'closed'
WHERE post_row.status = 'open'
  AND EXISTS (
    SELECT 1
    FROM public.bookings AS booking_row
    JOIN public.applications AS application_row
      ON application_row.id = booking_row.application_id
    WHERE booking_row.post_id = post_row.id
      AND booking_row.status <> 'cancelled'
      AND COALESCE(application_row.application_round, 1) = COALESCE(post_row.application_round, 1)
  );
