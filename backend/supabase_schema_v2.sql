-- VisaMatch V2 Tables

CREATE TABLE IF NOT EXISTS sessions_v2 (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  nome TEXT,
  email TEXT,
  phone TEXT,
  linkedin_url TEXT,
  linkedin_profile JSONB,
  collected_profile JSONB DEFAULT '{}',
  analysis JSONB,
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','abandoned'))
);

CREATE TABLE IF NOT EXISTS messages_v2 (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  session_id TEXT NOT NULL REFERENCES sessions_v2(session_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leads_v2 (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  session_id TEXT,
  nome TEXT,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  visto_recomendado TEXT,
  score INTEGER,
  label TEXT,
  partner TEXT,
  analysis JSONB,
  utm JSONB,
  hubspot_synced BOOLEAN DEFAULT false,
  hubspot_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_v2_session ON messages_v2(session_id);
CREATE INDEX IF NOT EXISTS idx_leads_v2_email ON leads_v2(email);
CREATE INDEX IF NOT EXISTS idx_leads_v2_hubspot ON leads_v2(hubspot_synced);
