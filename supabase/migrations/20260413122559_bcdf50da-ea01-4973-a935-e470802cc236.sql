
-- venue_posts: allow public insert
DROP POLICY IF EXISTS "Venue owners can create posts" ON public.venue_posts;
CREATE POLICY "Anyone can create venue posts"
ON public.venue_posts
FOR INSERT
TO public
WITH CHECK (true);

-- applications: allow public insert
DROP POLICY IF EXISTS "DJs can create applications" ON public.applications;
CREATE POLICY "Anyone can create applications"
ON public.applications
FOR INSERT
TO public
WITH CHECK (true);

-- applications: allow public select
DROP POLICY IF EXISTS "Anyone can view applications" ON public.applications;
CREATE POLICY "Anyone can view applications"
ON public.applications
FOR SELECT
TO public
USING (true);

-- applications: allow public update
DROP POLICY IF EXISTS "Participants can update applications" ON public.applications;
CREATE POLICY "Anyone can update applications"
ON public.applications
FOR UPDATE
TO public
USING (true);

-- invitations: allow public insert
DROP POLICY IF EXISTS "Venues can create invitations" ON public.invitations;
CREATE POLICY "Anyone can create invitations"
ON public.invitations
FOR INSERT
TO public
WITH CHECK (true);

-- invitations: allow public select
DROP POLICY IF EXISTS "Anyone can view invitations" ON public.invitations;
CREATE POLICY "Anyone can view invitations"
ON public.invitations
FOR SELECT
TO public
USING (true);

-- invitations: allow public update
DROP POLICY IF EXISTS "Participants can update invitations" ON public.invitations;
CREATE POLICY "Anyone can update invitations"
ON public.invitations
FOR UPDATE
TO public
USING (true);

-- venue_posts: allow public update
DROP POLICY IF EXISTS "Owners or admins can update posts" ON public.venue_posts;
CREATE POLICY "Anyone can update venue posts"
ON public.venue_posts
FOR UPDATE
TO public
USING (true);

-- venue_posts: allow public delete
DROP POLICY IF EXISTS "Owners or admins can delete posts" ON public.venue_posts;
CREATE POLICY "Anyone can delete venue posts"
ON public.venue_posts
FOR DELETE
TO public
USING (true);
