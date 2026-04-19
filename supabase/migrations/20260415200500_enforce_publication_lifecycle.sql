ALTER TABLE public.applications
DROP CONSTRAINT IF EXISTS applications_post_id_fkey;

ALTER TABLE public.applications
ADD CONSTRAINT applications_post_id_fkey
FOREIGN KEY (post_id)
REFERENCES public.venue_posts(id)
ON DELETE RESTRICT;

ALTER TABLE public.invitations
DROP CONSTRAINT IF EXISTS invitations_post_id_fkey;

ALTER TABLE public.invitations
ADD CONSTRAINT invitations_post_id_fkey
FOREIGN KEY (post_id)
REFERENCES public.venue_posts(id)
ON DELETE RESTRICT;

ALTER TABLE public.chat_threads
DROP CONSTRAINT IF EXISTS chat_threads_gig_id_fkey;

ALTER TABLE public.chat_threads
ADD CONSTRAINT chat_threads_gig_id_fkey
FOREIGN KEY (gig_id)
REFERENCES public.venue_posts(id)
ON DELETE RESTRICT;

UPDATE public.venue_posts
SET status = 'open'
WHERE status IS NULL OR status NOT IN ('open', 'closed');
