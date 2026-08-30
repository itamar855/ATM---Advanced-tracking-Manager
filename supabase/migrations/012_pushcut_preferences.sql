ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS pushcut_notify_approved BOOLEAN DEFAULT true; ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS pushcut_notify_pending BOOLEAN DEFAULT true;
