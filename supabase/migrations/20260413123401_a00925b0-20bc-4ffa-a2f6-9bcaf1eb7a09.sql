
-- Add user_id to dj_profiles
ALTER TABLE public.dj_profiles ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS dj_profiles_user_id_idx ON public.dj_profiles(user_id);

-- Add user_id to venue_profiles
ALTER TABLE public.venue_profiles ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS venue_profiles_user_id_idx ON public.venue_profiles(user_id);

-- ===================== DJ PROFILES RLS =====================
DROP POLICY IF EXISTS "Anyone can create DJ profile" ON public.dj_profiles;
DROP POLICY IF EXISTS "Admins can update DJ profiles" ON public.dj_profiles;
DROP POLICY IF EXISTS "Admins can delete DJ profiles" ON public.dj_profiles;

CREATE POLICY "Authenticated users can create their DJ profile"
ON public.dj_profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners or admins can update DJ profiles"
ON public.dj_profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners or admins can delete DJ profiles"
ON public.dj_profiles FOR DELETE TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

-- ===================== VENUE PROFILES RLS =====================
DROP POLICY IF EXISTS "Anyone can create venue profile" ON public.venue_profiles;
DROP POLICY IF EXISTS "Admins can update venue profiles" ON public.venue_profiles;
DROP POLICY IF EXISTS "Admins can delete venue profiles" ON public.venue_profiles;

CREATE POLICY "Authenticated users can create their venue profile"
ON public.venue_profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners or admins can update venue profiles"
ON public.venue_profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners or admins can delete venue profiles"
ON public.venue_profiles FOR DELETE TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

-- ===================== VENUE POSTS RLS =====================
DROP POLICY IF EXISTS "Anyone can create venue posts" ON public.venue_posts;
DROP POLICY IF EXISTS "Anyone can update venue posts" ON public.venue_posts;
DROP POLICY IF EXISTS "Anyone can delete venue posts" ON public.venue_posts;

CREATE POLICY "Venue owners can create posts"
ON public.venue_posts FOR INSERT TO authenticated
WITH CHECK (venue_id IN (SELECT id FROM venue_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Owners or admins can update posts"
ON public.venue_posts FOR UPDATE TO authenticated
USING (venue_id IN (SELECT id FROM venue_profiles WHERE user_id = auth.uid()) OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners or admins can delete posts"
ON public.venue_posts FOR DELETE TO authenticated
USING (venue_id IN (SELECT id FROM venue_profiles WHERE user_id = auth.uid()) OR has_role(auth.uid(), 'admin'));

-- ===================== APPLICATIONS RLS =====================
DROP POLICY IF EXISTS "Anyone can create applications" ON public.applications;
DROP POLICY IF EXISTS "Anyone can view applications" ON public.applications;
DROP POLICY IF EXISTS "Anyone can update applications" ON public.applications;

CREATE POLICY "Authenticated can view applications"
ON public.applications FOR SELECT TO authenticated
USING (true);

CREATE POLICY "DJs can create applications"
ON public.applications FOR INSERT TO authenticated
WITH CHECK (dj_id IN (SELECT id FROM dj_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Participants can update applications"
ON public.applications FOR UPDATE TO authenticated
USING (
  dj_id IN (SELECT id FROM dj_profiles WHERE user_id = auth.uid())
  OR post_id IN (SELECT id FROM venue_posts WHERE venue_id IN (SELECT id FROM venue_profiles WHERE user_id = auth.uid()))
  OR has_role(auth.uid(), 'admin')
);

-- ===================== INVITATIONS RLS =====================
DROP POLICY IF EXISTS "Anyone can create invitations" ON public.invitations;
DROP POLICY IF EXISTS "Anyone can view invitations" ON public.invitations;
DROP POLICY IF EXISTS "Anyone can update invitations" ON public.invitations;

CREATE POLICY "Authenticated can view invitations"
ON public.invitations FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Venue owners can create invitations"
ON public.invitations FOR INSERT TO authenticated
WITH CHECK (venue_id IN (SELECT id FROM venue_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Participants can update invitations"
ON public.invitations FOR UPDATE TO authenticated
USING (
  dj_id IN (SELECT id FROM dj_profiles WHERE user_id = auth.uid())
  OR venue_id IN (SELECT id FROM venue_profiles WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);

-- ===================== GIGS RLS =====================
-- Keep gigs public for now but restrict write to authenticated
DROP POLICY IF EXISTS "Anyone can create gig" ON public.gigs;

CREATE POLICY "Authenticated users can create gigs"
ON public.gigs FOR INSERT TO authenticated
WITH CHECK (true);
