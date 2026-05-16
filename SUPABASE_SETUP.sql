-- JALANKAN SQL INI DI SUPABASE SQL EDITOR
-- RUN THIS SQL IN YOUR SUPABASE SQL EDITOR

-- 1. Create Tables
CREATE TABLE IF NOT EXISTS public.profiles (
  uid UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  email TEXT,
  photo_url TEXT,
  password TEXT,
  last_seen BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.status (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT DEFAULT 'text',
  text TEXT,
  audio_url TEXT,
  audio_duration INTEGER,
  image_url TEXT,
  sticker_url TEXT,
  sender_id TEXT NOT NULL,
  sender_name TEXT,
  sender_photo TEXT,
  reply_to JSONB,
  reactions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stickers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable Realtime
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Add tables to publication
-- Use exception block in case they are already added
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- 3. Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies
-- Profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = uid);

DROP POLICY IF EXISTS "Service role can do everything" ON public.profiles;
CREATE POLICY "Service role can do everything" ON public.profiles FOR ALL USING (true);

-- Messages
DROP POLICY IF EXISTS "Anyone can read messages" ON public.messages;
CREATE POLICY "Anyone can read messages" ON public.messages FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert messages" ON public.messages;
CREATE POLICY "Authenticated users can insert messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update messages" ON public.messages;
CREATE POLICY "Anyone can update messages" ON public.messages FOR UPDATE USING (true);

-- Stickers
DROP POLICY IF EXISTS "Anyone can read stickers" ON public.stickers;
CREATE POLICY "Anyone can read stickers" ON public.stickers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert stickers" ON public.stickers;
CREATE POLICY "Users can insert stickers" ON public.stickers FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete stickers" ON public.stickers;
CREATE POLICY "Users can delete stickers" ON public.stickers FOR DELETE TO authenticated USING (true);

-- Status
DROP POLICY IF EXISTS "Anyone can read status" ON public.status;
CREATE POLICY "Anyone can read status" ON public.status FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can update status" ON public.status;
CREATE POLICY "Anyone can update status" ON public.status FOR ALL USING (true);
