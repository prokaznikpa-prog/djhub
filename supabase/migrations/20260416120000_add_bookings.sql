CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  dj_id UUID NOT NULL REFERENCES public.dj_profiles(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venue_profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.venue_posts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(application_id)
);

CREATE INDEX IF NOT EXISTS bookings_dj_id_idx ON public.bookings(dj_id);
CREATE INDEX IF NOT EXISTS bookings_venue_id_idx ON public.bookings(venue_id);
CREATE INDEX IF NOT EXISTS bookings_post_id_idx ON public.bookings(post_id);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_bookings_updated_at ON public.bookings;
CREATE TRIGGER update_bookings_updated_at
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_booking_participant(booking_row public.bookings)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dj_profiles
    WHERE id = booking_row.dj_id AND user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.venue_profiles
    WHERE id = booking_row.venue_id AND user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin');
$$;

DROP POLICY IF EXISTS "Participants can view bookings" ON public.bookings;
CREATE POLICY "Participants can view bookings"
ON public.bookings FOR SELECT TO authenticated
USING (public.is_booking_participant(bookings));

DROP POLICY IF EXISTS "Participants can create bookings" ON public.bookings;
CREATE POLICY "Participants can create bookings"
ON public.bookings FOR INSERT TO authenticated
WITH CHECK (public.is_booking_participant(bookings));

DROP POLICY IF EXISTS "Participants can update bookings" ON public.bookings;
CREATE POLICY "Participants can update bookings"
ON public.bookings FOR UPDATE TO authenticated
USING (public.is_booking_participant(bookings))
WITH CHECK (public.is_booking_participant(bookings));
