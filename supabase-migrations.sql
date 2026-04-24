-- ============================================
-- Faraway Grandparents Database Schema Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Add family_members_limit to families table
ALTER TABLE families 
ADD COLUMN IF NOT EXISTS family_members_limit INTEGER DEFAULT 1;

-- 2. Create family_invites table
CREATE TABLE IF NOT EXISTS family_invites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    family_code TEXT NOT NULL REFERENCES families(family_code),
    email TEXT NOT NULL,
    invite_token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ
);

-- Add indexes for family_invites
CREATE INDEX IF NOT EXISTS idx_family_invites_family_code ON family_invites(family_code);
CREATE INDEX IF NOT EXISTS idx_family_invites_token ON family_invites(invite_token);
CREATE INDEX IF NOT EXISTS idx_family_invites_email ON family_invites(email);

-- 3. Create family_members table
CREATE TABLE IF NOT EXISTS family_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    family_code TEXT NOT NULL REFERENCES families(family_code),
    name TEXT NOT NULL,
    email TEXT,
    photo_url TEXT,
    audio_url TEXT,
    consent_accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for family_members
CREATE INDEX IF NOT EXISTS idx_family_members_family_code ON family_members(family_code);
CREATE INDEX IF NOT EXISTS idx_family_members_email ON family_members(email);

-- 4. Create game_sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    family_code TEXT NOT NULL REFERENCES families(family_code),
    game_id TEXT NOT NULL,
    found_count INTEGER DEFAULT 0,
    session_started_at TIMESTAMPTZ DEFAULT NOW(),
    session_completed_at TIMESTAMPTZ,
    final_screenshot_url TEXT
);

-- Add indexes for game_sessions
CREATE INDEX IF NOT EXISTS idx_game_sessions_family_code ON game_sessions(family_code);
CREATE INDEX IF NOT EXISTS idx_game_sessions_game_id ON game_sessions(game_id);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE family_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS Policies for family_invites
CREATE POLICY "Users can view invites for their family"
    ON family_invites FOR SELECT
    USING (
        family_code IN (
            SELECT family_code FROM families 
            WHERE family_code = current_setting('x-family-code', true)
        )
    );

CREATE POLICY "Users can insert invites for their family"
    ON family_invites FOR INSERT
    WITH CHECK (
        family_code IN (
            SELECT family_code FROM families 
            WHERE family_code = current_setting('x-family-code', true)
        )
    );

CREATE POLICY "Users can update invites for their family"
    ON family_invites FOR UPDATE
    USING (
        family_code IN (
            SELECT family_code FROM families 
            WHERE family_code = current_setting('x-family-code', true)
        )
    );

-- 7. Create RLS Policies for family_members
CREATE POLICY "Users can view members of their family"
    ON family_members FOR SELECT
    USING (
        family_code IN (
            SELECT family_code FROM families 
            WHERE family_code = current_setting('x-family-code', true)
        )
    );

CREATE POLICY "Users can insert members for their family"
    ON family_members FOR INSERT
    WITH CHECK (
        family_code IN (
            SELECT family_code FROM families 
            WHERE family_code = current_setting('x-family-code', true)
        )
    );

CREATE POLICY "Users can update members of their family"
    ON family_members FOR UPDATE
    USING (
        family_code IN (
            SELECT family_code FROM families 
            WHERE family_code = current_setting('x-family-code', true)
        )
    );

-- 8. Create RLS Policies for game_sessions
CREATE POLICY "Users can view their game sessions"
    ON game_sessions FOR SELECT
    USING (
        family_code IN (
            SELECT family_code FROM families 
            WHERE family_code = current_setting('x-family-code', true)
        )
    );

CREATE POLICY "Users can insert game sessions for their family"
    ON game_sessions FOR INSERT
    WITH CHECK (
        family_code IN (
            SELECT family_code FROM families 
            WHERE family_code = current_setting('x-family-code', true)
        )
    );

CREATE POLICY "Users can update their game sessions"
    ON game_sessions FOR UPDATE
    USING (
        family_code IN (
            SELECT family_code FROM families 
            WHERE family_code = current_setting('x-family-code', true)
        )
    );

-- 9. Create helper function to check family members limit
CREATE OR REPLACE FUNCTION check_family_members_limit()
RETURNS TRIGGER AS $$
DECLARE
    current_limit INTEGER;
    member_count INTEGER;
BEGIN
    -- Get the family's member limit
    SELECT family_members_limit INTO current_limit
    FROM families
    WHERE family_code = NEW.family_code;
    
    -- Count current family members
    SELECT COUNT(*) INTO member_count
    FROM family_members
    WHERE family_code = NEW.family_code;
    
    -- Check if limit exceeded
    IF member_count >= current_limit THEN
        RAISE EXCEPTION 'Family member limit (%) exceeded for family code %', 
            current_limit, NEW.family_code;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Create trigger to enforce family members limit
DROP TRIGGER IF EXISTS enforce_family_members_limit ON family_members;
CREATE TRIGGER enforce_family_members_limit
    BEFORE INSERT ON family_members
    FOR EACH ROW
    EXECUTE FUNCTION check_family_members_limit();

-- 11. Grant necessary permissions
GRANT ALL ON family_invites TO authenticated;
GRANT ALL ON family_members TO authenticated;
GRANT ALL ON game_sessions TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 12. Create audio_prompts table
CREATE TABLE IF NOT EXISTS audio_prompts (
    id SERIAL PRIMARY KEY,
    prompt_text TEXT NOT NULL,
    audio_filename TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Insert default audio prompts
INSERT INTO audio_prompts (prompt_text, audio_filename, display_order) VALUES
('Hello! Say "Hello, I love you!"', 'hello_love_you.ogg', 1),
('Tell them you''re proud of them. Say "I am so proud of you!"', 'proud_of_you.ogg', 2),
('Give them encouragement. Say "You can do anything you set your mind to!"', 'encouragement.ogg', 3),
('Share a special memory. Say "Remember when we went to the park together?"', 'special_memory.ogg', 4),
('Say something sweet. Say "You make my heart smile!"', 'heart_smile.ogg', 5)
ON CONFLICT DO NOTHING;

-- Allow public read access for audio prompts
ALTER TABLE audio_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to audio prompts"
ON audio_prompts FOR SELECT
USING (true);

-- Grant permissions
GRANT SELECT ON audio_prompts TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE audio_prompts_id_seq TO authenticated;

-- 13. Add columns to game_audio_scripts table
ALTER TABLE game_audio_scripts 
ADD COLUMN IF NOT EXISTS family_code TEXT REFERENCES families(family_code),
ADD COLUMN IF NOT EXISTS audio_url TEXT,
ADD COLUMN IF NOT EXISTS is_recorded BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

-- Create indexes for game_audio_scripts
CREATE INDEX IF NOT EXISTS idx_game_audio_scripts_game_id ON game_audio_scripts(game_id);
CREATE INDEX IF NOT EXISTS idx_game_audio_scripts_family_code ON game_audio_scripts(family_code);
CREATE INDEX IF NOT EXISTS idx_game_audio_scripts_is_recorded ON game_audio_scripts(is_recorded);

-- 14. Insert default audio scripts for "default" game
-- These can be edited in the Supabase dashboard
INSERT INTO game_audio_scripts (game_id, audio_type, script_text, is_required, display_order) VALUES
('default', 'greeting', 'Hello! Say "Hello, I love you so much!"', true, 1),
('default', 'pride', 'Tell them you''re proud. Say "I am so proud of you!"', true, 2),
('default', 'encouragement', 'Give encouragement. Say "You can do anything you set your mind to!"', true, 3),
('default', 'memory', 'Share a memory. Say "Remember when we played together?"', false, 4),
('default', 'sweet', 'Say something sweet. Say "You make my heart smile!"', false, 5)
ON CONFLICT DO NOTHING;

-- 15. Enable RLS on game_audio_scripts
ALTER TABLE game_audio_scripts ENABLE ROW LEVEL SECURITY;

-- Allow users to view scripts for their entitled games
CREATE POLICY "Users can view audio scripts for their games"
ON game_audio_scripts FOR SELECT
USING (
    game_id IN (
        SELECT game_id FROM entitlements 
        WHERE family_code = current_setting('x-family-code', true)
    )
);

-- Allow users to update their own recordings
CREATE POLICY "Users can update their audio scripts"
ON game_audio_scripts FOR UPDATE
USING (
    family_code = current_setting('x-family-code', true)
);

-- Grant permissions
GRANT SELECT, UPDATE ON game_audio_scripts TO authenticated;

-- ============================================
-- Migration Complete!
-- ============================================
