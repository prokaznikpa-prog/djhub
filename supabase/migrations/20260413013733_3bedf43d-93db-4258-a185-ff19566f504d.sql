
-- Create post_type enum
CREATE TYPE public.post_type AS ENUM ('gig', 'casting', 'residency');

-- Create interaction_status enum
CREATE TYPE public.interaction_status AS ENUM ('new', 'accepted', 'rejected', 'cancelled');

-- Venue posts table
CREATE TABLE public.venue_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venue_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  city TEXT NOT NULL,
  music_styles TEXT[] NOT NULL DEFAULT '{}'::text[],
  description TEXT,
  budget TEXT,
  post_type public.post_type NOT NULL DEFAULT 'gig',
  status TEXT NOT NULL DEFAULT 'open',
  -- gig fields
  event_date TEXT,
  start_time TEXT,
  duration TEXT,
  -- casting fields
  requirements TEXT,
  portfolio_required BOOLEAN DEFAULT false,
  deadline TEXT,
  -- residency fields
  schedule TEXT,
  frequency TEXT,
  long_term BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view venue posts" ON public.venue_posts FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create posts" ON public.venue_posts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Post owners can update" ON public.venue_posts FOR UPDATE TO authenticated USING (venue_id IN (SELECT id FROM public.venue_profiles) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Post owners can delete" ON public.venue_posts FOR DELETE TO authenticated USING (venue_id IN (SELECT id FROM public.venue_profiles) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update all posts" ON public.venue_posts FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete all posts" ON public.venue_posts FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_venue_posts_updated_at BEFORE UPDATE ON public.venue_posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Applications table
CREATE TABLE public.applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dj_id UUID NOT NULL REFERENCES public.dj_profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.venue_posts(id) ON DELETE CASCADE,
  status public.interaction_status NOT NULL DEFAULT 'new',
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(dj_id, post_id)
);

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view applications" ON public.applications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create applications" ON public.applications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Participants can update applications" ON public.applications FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete applications" ON public.applications FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Invitations table
CREATE TABLE public.invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venue_profiles(id) ON DELETE CASCADE,
  dj_id UUID NOT NULL REFERENCES public.dj_profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.venue_posts(id) ON DELETE CASCADE,
  status public.interaction_status NOT NULL DEFAULT 'new',
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(venue_id, dj_id, post_id)
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view invitations" ON public.invitations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create invitations" ON public.invitations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Participants can update invitations" ON public.invitations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete invitations" ON public.invitations FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_invitations_updated_at BEFORE UPDATE ON public.invitations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
