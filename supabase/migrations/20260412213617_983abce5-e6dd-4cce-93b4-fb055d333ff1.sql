CREATE TABLE public.dj_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  contact TEXT NOT NULL,
  styles TEXT[] NOT NULL DEFAULT '{}',
  priority_style TEXT,
  price TEXT NOT NULL,
  bio TEXT,
  experience TEXT,
  played_at TEXT[] DEFAULT '{}',
  availability TEXT,
  format TEXT,
  soundcloud TEXT,
  instagram TEXT,
  open_to_collab BOOLEAN DEFAULT false,
  open_to_crew BOOLEAN DEFAULT false,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.venue_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT,
  type TEXT NOT NULL,
  description TEXT,
  music_styles TEXT[] NOT NULL DEFAULT '{}',
  equipment TEXT,
  food_drinks TEXT,
  contact TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.gigs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venue_profiles(id) ON DELETE CASCADE,
  venue_name TEXT NOT NULL,
  city TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  budget TEXT NOT NULL,
  style TEXT NOT NULL,
  format TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.dj_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gigs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view DJ profiles" ON public.dj_profiles FOR SELECT USING (true);
CREATE POLICY "Anyone can view venue profiles" ON public.venue_profiles FOR SELECT USING (true);
CREATE POLICY "Anyone can view gigs" ON public.gigs FOR SELECT USING (true);

CREATE POLICY "Anyone can create DJ profile" ON public.dj_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can create venue profile" ON public.venue_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can create gig" ON public.gigs FOR INSERT WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_dj_profiles_updated_at
  BEFORE UPDATE ON public.dj_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_venue_profiles_updated_at
  BEFORE UPDATE ON public.venue_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();