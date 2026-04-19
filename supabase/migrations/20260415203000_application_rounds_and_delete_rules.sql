ALTER TABLE public.venue_posts
ADD COLUMN IF NOT EXISTS application_round integer NOT NULL DEFAULT 1;

ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS application_round integer NOT NULL DEFAULT 1;

ALTER TABLE public.applications
DROP CONSTRAINT IF EXISTS applications_dj_id_post_id_key;

DROP INDEX IF EXISTS public.applications_dj_post_round_unique_idx;
CREATE UNIQUE INDEX applications_dj_post_round_unique_idx
ON public.applications(dj_id, post_id, application_round);

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

CREATE OR REPLACE FUNCTION public.prevent_open_venue_post_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'open' THEN
    RAISE EXCEPTION 'Open venue posts cannot be deleted';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_open_venue_post_delete_trigger ON public.venue_posts;
CREATE TRIGGER prevent_open_venue_post_delete_trigger
BEFORE DELETE ON public.venue_posts
FOR EACH ROW
EXECUTE FUNCTION public.prevent_open_venue_post_delete();
