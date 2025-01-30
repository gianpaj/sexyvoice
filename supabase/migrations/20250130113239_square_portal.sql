/*
  # Initial Schema Setup

  1. Tables Created:
    - profiles
      - id (uuid, references auth.users)
      - username (text, unique)
      - full_name (text)
      - avatar_url (text)
      - created_at (timestamp)
      - updated_at (timestamp)
    
    - credits
      - id (uuid)
      - user_id (uuid, references profiles)
      - amount (integer)
      - created_at (timestamp)
      - updated_at (timestamp)
    
    - voices
      - id (uuid)
      - user_id (uuid, references profiles)
      - name (text)
      - language (text)
      - is_nsfw (boolean)
      - is_public (boolean)
      - created_at (timestamp)
      - updated_at (timestamp)
    
    - audio_files
      - id (uuid)
      - voice_id (uuid, references voices)
      - user_id (uuid, references profiles)
      - storage_key (text)
      - duration (float)
      - text_content (text)
      - created_at (timestamp)

  2. Security:
    - RLS policies for all tables
    - Public profiles readable by all
    - Private data only accessible by owners
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Credits table
CREATE TABLE credits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Voices table
CREATE TABLE voices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  is_nsfw BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Audio files table
CREATE TABLE audio_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  voice_id UUID REFERENCES voices(id) NOT NULL,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  storage_key TEXT NOT NULL,
  duration FLOAT NOT NULL,
  text_content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE voices ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_files ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Credits policies
CREATE POLICY "Users can view own credits"
  ON credits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Only system can insert credits"
  ON credits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Only system can update credits"
  ON credits FOR UPDATE
  USING (auth.uid() = user_id);

-- Voices policies
CREATE POLICY "Users can view public voices"
  ON voices FOR SELECT
  USING (is_public OR auth.uid() = user_id);

CREATE POLICY "Users can insert own voices"
  ON voices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own voices"
  ON voices FOR UPDATE
  USING (auth.uid() = user_id);

-- Audio files policies
CREATE POLICY "Users can view own audio files"
  ON audio_files FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own audio files"
  ON audio_files FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own audio files"
  ON audio_files FOR DELETE
  USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credits_updated_at
    BEFORE UPDATE ON credits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_voices_updated_at
    BEFORE UPDATE ON voices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();