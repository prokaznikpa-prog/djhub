ALTER TABLE public.venue_posts
DROP CONSTRAINT IF EXISTS venue_posts_moderation_status_check;

ALTER TABLE public.venue_posts
ADD CONSTRAINT venue_posts_moderation_status_check
CHECK (moderation_status IN ('active', 'hidden', 'archived', 'blocked'));
