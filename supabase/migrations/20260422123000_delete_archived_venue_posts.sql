CREATE OR REPLACE FUNCTION public.delete_archived_venue_post(post_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_post public.venue_posts%ROWTYPE;
BEGIN
  SELECT *
    INTO target_post
  FROM public.venue_posts
  WHERE id = post_uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    target_post.venue_id IN (SELECT id FROM public.venue_profiles WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Not allowed to delete this post'
      USING ERRCODE = '42501';
  END IF;

  IF target_post.status <> 'closed' AND COALESCE(target_post.moderation_status, 'active') <> 'archived' THEN
    RAISE EXCEPTION 'Only archived posts can be permanently deleted'
      USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.reviews
  WHERE booking_id IN (
    SELECT id FROM public.bookings WHERE post_id = post_uuid
  );

  DELETE FROM public.chat_threads
  WHERE gig_id = post_uuid
     OR booking_id IN (
       SELECT id FROM public.bookings WHERE post_id = post_uuid
     );

  DELETE FROM public.bookings
  WHERE post_id = post_uuid;

  DELETE FROM public.applications
  WHERE post_id = post_uuid;

  DELETE FROM public.invitations
  WHERE post_id = post_uuid;

  DELETE FROM public.venue_posts
  WHERE id = post_uuid;
END;
$$;

