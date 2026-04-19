CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid DEFAULT gen_random_uuid()
);

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS booking_id uuid,
  ADD COLUMN IF NOT EXISTS reviewer_id uuid,
  ADD COLUMN IF NOT EXISTS target_id uuid,
  ADD COLUMN IF NOT EXISTS rating integer,
  ADD COLUMN IF NOT EXISTS comment text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.reviews
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN booking_id SET NOT NULL,
  ALTER COLUMN reviewer_id SET NOT NULL,
  ALTER COLUMN target_id SET NOT NULL,
  ALTER COLUMN rating SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reviews_pkey'
      AND conrelid = 'public.reviews'::regclass
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);
  END IF;
END;
$$;

ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_booking_id_fkey,
  DROP CONSTRAINT IF EXISTS reviews_rating_check,
  DROP CONSTRAINT IF EXISTS reviews_no_self_review,
  DROP CONSTRAINT IF EXISTS reviews_one_per_reviewer_per_booking;

ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE RESTRICT,
  ADD CONSTRAINT reviews_rating_check
    CHECK (rating BETWEEN 1 AND 5),
  ADD CONSTRAINT reviews_no_self_review
    CHECK (reviewer_id <> target_id),
  ADD CONSTRAINT reviews_one_per_reviewer_per_booking
    UNIQUE (booking_id, reviewer_id);

CREATE INDEX IF NOT EXISTS idx_reviews_target_id ON public.reviews(target_id);
CREATE INDEX IF NOT EXISTS idx_reviews_booking_id ON public.reviews(booking_id);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.validate_booking_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_status text;
  v_booking_dj_id uuid;
  v_booking_venue_id uuid;
BEGIN
  SELECT b.status, b.dj_id, b.venue_id
    INTO v_booking_status, v_booking_dj_id, v_booking_venue_id
  FROM public.bookings AS b
  WHERE b.id = NEW.booking_id;

  IF v_booking_status IS NULL THEN
    RAISE EXCEPTION 'Booking not found'
      USING ERRCODE = '23503';
  END IF;

  IF v_booking_status <> 'completed' THEN
    RAISE EXCEPTION 'Reviews are allowed only for completed bookings'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.reviewer_id = v_booking_dj_id THEN
    IF NEW.target_id <> v_booking_venue_id THEN
      RAISE EXCEPTION 'DJ can review only the venue from this booking'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.reviewer_id = v_booking_venue_id THEN
    IF NEW.target_id <> v_booking_dj_id THEN
      RAISE EXCEPTION 'Venue can review only the DJ from this booking'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'Only booking participants can review'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_booking_review ON public.reviews;
CREATE TRIGGER validate_booking_review
BEFORE INSERT OR UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.validate_booking_review();

CREATE OR REPLACE FUNCTION public.can_create_booking_review(
  p_booking_id uuid,
  p_reviewer_id uuid,
  p_target_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings AS b
    WHERE b.id = p_booking_id
      AND b.status = 'completed'
      AND (
        (
          p_reviewer_id = b.dj_id
          AND p_target_id = b.venue_id
          AND EXISTS (
            SELECT 1
            FROM public.dj_profiles AS dj
            WHERE dj.id = p_reviewer_id
              AND dj.user_id = auth.uid()
          )
        )
        OR
        (
          p_reviewer_id = b.venue_id
          AND p_target_id = b.dj_id
          AND EXISTS (
            SELECT 1
            FROM public.venue_profiles AS venue
            WHERE venue.id = p_reviewer_id
              AND venue.user_id = auth.uid()
          )
        )
      )
  );
$$;

DROP POLICY IF EXISTS "Anyone can view reviews" ON public.reviews;
CREATE POLICY "Anyone can view reviews"
ON public.reviews
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Participants can create booking reviews" ON public.reviews;
CREATE POLICY "Participants can create booking reviews"
ON public.reviews
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_create_booking_review(booking_id, reviewer_id, target_id)
);
