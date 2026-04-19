ALTER TABLE public.chat_threads
ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS hidden_by_dj boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS hidden_by_venue boolean NOT NULL DEFAULT false;

UPDATE public.chat_threads thread_row
SET booking_id = booking_row.id
FROM public.bookings booking_row
WHERE booking_row.application_id = thread_row.application_id
  AND thread_row.booking_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_booking_id_unique_idx
ON public.chat_threads(booking_id)
WHERE booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS chat_threads_dj_visible_idx
ON public.chat_threads(dj_id, hidden_by_dj);

CREATE INDEX IF NOT EXISTS chat_threads_venue_visible_idx
ON public.chat_threads(venue_id, hidden_by_venue);
