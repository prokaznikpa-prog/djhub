CREATE OR REPLACE FUNCTION public.set_booking_lifecycle_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_date_text text;
  event_moment timestamp with time zone;
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

    IF event_date_text IS NULL OR btrim(event_date_text) = '' THEN
      RAISE EXCEPTION 'Booking can be completed only after event date passes'
        USING ERRCODE = '23514';
    END IF;

    IF event_date_text ~ '^\d{4}-\d{2}-\d{2}$' THEN
      IF event_date_text::date >= CURRENT_DATE THEN
        RAISE EXCEPTION 'Booking can be completed only after event date passes'
          USING ERRCODE = '23514';
      END IF;
    ELSE
      BEGIN
        event_moment := event_date_text::timestamp with time zone;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Booking can be completed only after event date passes'
          USING ERRCODE = '23514';
      END;

      IF event_moment >= now() THEN
        RAISE EXCEPTION 'Booking can be completed only after event date passes'
          USING ERRCODE = '23514';
      END IF;
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
