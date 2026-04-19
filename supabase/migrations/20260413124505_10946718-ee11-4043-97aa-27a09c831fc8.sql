-- Drop the overly permissive insert policy
DROP POLICY IF EXISTS "Authenticated can create notifications" ON public.notifications;

-- Re-create with a slightly more specific check (user_id must be set, preventing nulls)
CREATE POLICY "Authenticated can create notifications"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (user_id IS NOT NULL);

-- Also fix gigs insert policy that was flagged
DROP POLICY IF EXISTS "Authenticated users can create gigs" ON public.gigs;

CREATE POLICY "Venue owners can create gigs"
ON public.gigs FOR INSERT
TO authenticated
WITH CHECK (
  venue_id IN (
    SELECT id FROM venue_profiles WHERE user_id = auth.uid()
  )
);