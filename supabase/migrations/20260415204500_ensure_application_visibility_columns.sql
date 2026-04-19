ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS hidden_by_dj boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS hidden_by_venue boolean DEFAULT false;

UPDATE public.applications
SET hidden_by_dj = false
WHERE hidden_by_dj IS NULL;

UPDATE public.applications
SET hidden_by_venue = false
WHERE hidden_by_venue IS NULL;

ALTER TABLE public.applications
ALTER COLUMN hidden_by_dj SET DEFAULT false,
ALTER COLUMN hidden_by_dj SET NOT NULL,
ALTER COLUMN hidden_by_venue SET DEFAULT false,
ALTER COLUMN hidden_by_venue SET NOT NULL;
