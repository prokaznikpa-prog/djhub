ALTER TABLE public.venue_posts
ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'active'
CHECK (moderation_status IN ('active', 'hidden', 'archived'));

CREATE INDEX IF NOT EXISTS venue_posts_moderation_status_idx
ON public.venue_posts(moderation_status);

CREATE OR REPLACE FUNCTION public.prevent_non_admin_profile_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.status, 'active') IS DISTINCT FROM COALESCE(NEW.status, 'active')
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can change profile moderation status'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_non_admin_dj_status_change ON public.dj_profiles;
CREATE TRIGGER prevent_non_admin_dj_status_change
BEFORE UPDATE ON public.dj_profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_non_admin_profile_status_change();

DROP TRIGGER IF EXISTS prevent_non_admin_venue_status_change ON public.venue_profiles;
CREATE TRIGGER prevent_non_admin_venue_status_change
BEFORE UPDATE ON public.venue_profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_non_admin_profile_status_change();

CREATE OR REPLACE FUNCTION public.prevent_non_admin_post_moderation_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.moderation_status, 'active') IS DISTINCT FROM COALESCE(NEW.moderation_status, 'active')
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can change post moderation status'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_non_admin_post_moderation_change ON public.venue_posts;
CREATE TRIGGER prevent_non_admin_post_moderation_change
BEFORE UPDATE ON public.venue_posts
FOR EACH ROW EXECUTE FUNCTION public.prevent_non_admin_post_moderation_change();
