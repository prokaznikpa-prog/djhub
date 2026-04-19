ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS hidden_by_dj boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS hidden_by_venue boolean NOT NULL DEFAULT false;
