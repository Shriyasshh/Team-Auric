-- Enable Supabase Realtime for medical_records table
-- This must be run in the Supabase SQL Editor

ALTER PUBLICATION supabase_realtime ADD TABLE public.medical_records;
