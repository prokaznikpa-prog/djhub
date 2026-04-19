
-- Fix venue_posts INSERT policy
DROP POLICY IF EXISTS "Authenticated users can create posts" ON public.venue_posts;
CREATE POLICY "Venue owners can create posts" ON public.venue_posts FOR INSERT TO authenticated WITH CHECK (
  venue_id IN (SELECT id FROM public.venue_profiles)
);

-- Fix venue_posts UPDATE - drop duplicate, keep proper one
DROP POLICY IF EXISTS "Post owners can update" ON public.venue_posts;
DROP POLICY IF EXISTS "Admins can update all posts" ON public.venue_posts;
CREATE POLICY "Owners or admins can update posts" ON public.venue_posts FOR UPDATE TO authenticated USING (
  venue_id IN (SELECT id FROM public.venue_profiles) OR public.has_role(auth.uid(), 'admin')
);

-- Fix venue_posts DELETE
DROP POLICY IF EXISTS "Post owners can delete" ON public.venue_posts;
DROP POLICY IF EXISTS "Admins can delete all posts" ON public.venue_posts;
CREATE POLICY "Owners or admins can delete posts" ON public.venue_posts FOR DELETE TO authenticated USING (
  venue_id IN (SELECT id FROM public.venue_profiles) OR public.has_role(auth.uid(), 'admin')
);

-- Fix applications INSERT
DROP POLICY IF EXISTS "Authenticated can create applications" ON public.applications;
CREATE POLICY "DJs can create applications" ON public.applications FOR INSERT TO authenticated WITH CHECK (
  dj_id IN (SELECT id FROM public.dj_profiles)
);

-- Fix applications UPDATE
DROP POLICY IF EXISTS "Participants can update applications" ON public.applications;
CREATE POLICY "Participants can update applications" ON public.applications FOR UPDATE TO authenticated USING (
  dj_id IN (SELECT id FROM public.dj_profiles)
  OR post_id IN (SELECT id FROM public.venue_posts WHERE venue_id IN (SELECT id FROM public.venue_profiles))
  OR public.has_role(auth.uid(), 'admin')
);

-- Fix invitations INSERT
DROP POLICY IF EXISTS "Authenticated can create invitations" ON public.invitations;
CREATE POLICY "Venues can create invitations" ON public.invitations FOR INSERT TO authenticated WITH CHECK (
  venue_id IN (SELECT id FROM public.venue_profiles)
);

-- Fix invitations UPDATE
DROP POLICY IF EXISTS "Participants can update invitations" ON public.invitations;
CREATE POLICY "Participants can update invitations" ON public.invitations FOR UPDATE TO authenticated USING (
  dj_id IN (SELECT id FROM public.dj_profiles)
  OR venue_id IN (SELECT id FROM public.venue_profiles)
  OR public.has_role(auth.uid(), 'admin')
);
