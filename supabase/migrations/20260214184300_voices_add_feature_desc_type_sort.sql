-- Migration: 20260214184300_voices_add_feature_desc_type_sort.sql
-- Add feature_type enum and new columns to voices table for character system

-- ─── Enum type ───
-- Single shared enum for the product feature a voice or prompt belongs to
CREATE TYPE public.feature_type AS ENUM ('tts', 'call');

-- ─── voices table changes ───

-- Add feature column using the shared enum type
ALTER TABLE public.voices
ADD COLUMN feature public.feature_type NOT NULL DEFAULT 'tts';

-- Backfill: xai model voices are call voices
UPDATE public.voices SET feature = 'call' WHERE model = 'xai';

-- Add description column (moved from hardcoded data/voices.ts)
ALTER TABLE public.voices
ADD COLUMN description text;

-- Add type column: 'Female', 'Male', 'Neutral' (moved from hardcoded data/voices.ts)
ALTER TABLE public.voices
ADD COLUMN type text;

-- Add sort_order for stable ordering
ALTER TABLE public.voices
ADD COLUMN sort_order integer NOT NULL DEFAULT 0;

-- Backfill the 5 xai call voices with description + type + sort_order
UPDATE public.voices
SET description = 'Default voice, balanced and conversational',
    type = 'Female',
    sort_order = 0
WHERE name = 'Ara' AND model = 'xai';

UPDATE public.voices
SET description = 'Professional and articulate, ideal for business applications',
    type = 'Male',
    sort_order = 1
WHERE name = 'Rex' AND model = 'xai';

UPDATE public.voices
SET description = 'Versatile voice suitable for various contexts',
    type = 'Neutral',
    sort_order = 2
WHERE name = 'Sal' AND model = 'xai';

UPDATE public.voices
SET description = 'Engaging and enthusiastic, great for interactive experiences',
    type = 'Female',
    sort_order = 3
WHERE name = 'Eve' AND model = 'xai';

UPDATE public.voices
SET description = 'Decisive and commanding, suitable for instructional content',
    type = 'Male',
    sort_order = 4
WHERE name = 'Leo' AND model = 'xai';

-- Indexes for new columns
CREATE INDEX voices_feature_idx ON public.voices (feature);
CREATE INDEX voices_sort_order_idx ON public.voices (sort_order);
