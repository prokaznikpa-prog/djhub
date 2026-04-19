
-- Add status column to dj_profiles
ALTER TABLE public.dj_profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Add status column to venue_profiles
ALTER TABLE public.venue_profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Allow admins to update dj_profiles
CREATE POLICY "Admins can update DJ profiles"
ON public.dj_profiles FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to update venue_profiles
CREATE POLICY "Admins can update venue profiles"
ON public.venue_profiles FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to update gigs
CREATE POLICY "Admins can update gigs"
ON public.gigs FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
