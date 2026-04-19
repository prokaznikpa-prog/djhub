ALTER TABLE public.applications
DROP CONSTRAINT IF EXISTS applications_post_id_fkey;

ALTER TABLE public.applications
ADD CONSTRAINT applications_post_id_fkey
FOREIGN KEY (post_id)
REFERENCES public.venue_posts(id)
ON DELETE CASCADE;

ALTER TABLE public.invitations
DROP CONSTRAINT IF EXISTS invitations_post_id_fkey;

ALTER TABLE public.invitations
ADD CONSTRAINT invitations_post_id_fkey
FOREIGN KEY (post_id)
REFERENCES public.venue_posts(id)
ON DELETE CASCADE;

ALTER TABLE public.chat_threads
DROP CONSTRAINT IF EXISTS chat_threads_gig_id_fkey;

ALTER TABLE public.chat_threads
ADD CONSTRAINT chat_threads_gig_id_fkey
FOREIGN KEY (gig_id)
REFERENCES public.venue_posts(id)
ON DELETE CASCADE;

DROP POLICY IF EXISTS "Owners or admins can delete posts" ON public.venue_posts;
CREATE POLICY "Owners or admins can delete posts"
ON public.venue_posts FOR DELETE TO authenticated
USING (
  venue_id IN (SELECT id FROM public.venue_profiles WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Venue owners can delete gigs" ON public.gigs;
CREATE POLICY "Venue owners can delete gigs"
ON public.gigs FOR DELETE TO authenticated
USING (
  venue_id IN (SELECT id FROM public.venue_profiles WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);
