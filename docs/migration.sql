-- ============================================================
-- TeamQuyTran - Full Database Migration
-- Run this to RESET and recreate all tables
-- ============================================================

-- DROP ALL (clean slate)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM ('admin', 'moderator', 'user');
CREATE TYPE user_status AS ENUM ('online', 'idle', 'dnd', 'offline');
CREATE TYPE request_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE friend_status AS ENUM ('pending', 'accepted', 'blocked');
CREATE TYPE channel_type AS ENUM ('text', 'voice', 'announcement');
CREATE TYPE bot_mode AS ENUM ('romantic', 'cold', 'adult', 'evil');
CREATE TYPE message_type AS ENUM ('text', 'image', 'file', 'system', 'bot');

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT DEFAULT '',
    role user_role DEFAULT 'user',
    status user_status DEFAULT 'offline',
    custom_status TEXT,
    is_banned BOOLEAN DEFAULT FALSE,
    ban_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SIGNUP REQUESTS (pending admin approval)
-- ============================================================
CREATE TABLE signup_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL,
    username TEXT NOT NULL,
    display_name TEXT,
    password_hash TEXT NOT NULL,
    status request_status DEFAULT 'pending',
    reviewed_by UUID REFERENCES profiles(id),
    reviewed_at TIMESTAMPTZ,
    reject_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FRIENDS
-- ============================================================
CREATE TABLE friends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    addressee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status friend_status DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(requester_id, addressee_id),
    CHECK (requester_id != addressee_id)
);

-- ============================================================
-- SERVERS (Groups)
-- ============================================================
CREATE TABLE servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    banner_url TEXT,
    owner_id UUID NOT NULL REFERENCES profiles(id),
    invite_code TEXT UNIQUE DEFAULT encode(gen_random_bytes(6), 'base64'),
    is_public BOOLEAN DEFAULT FALSE,
    member_count INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SERVER MEMBERS
-- ============================================================
CREATE TABLE server_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    nickname TEXT,
    role user_role DEFAULT 'user',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(server_id, user_id)
);

-- ============================================================
-- CHANNELS
-- ============================================================
CREATE TABLE channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    topic TEXT,
    type channel_type DEFAULT 'text',
    position INT DEFAULT 0,
    is_dm BOOLEAN DEFAULT FALSE,
    is_group_dm BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DM Participants
CREATE TABLE dm_participants (
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    PRIMARY KEY (channel_id, user_id)
);

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    content TEXT,
    type message_type DEFAULT 'text',
    edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMPTZ,
    reply_to UUID REFERENCES messages(id) ON DELETE SET NULL,
    pinned BOOLEAN DEFAULT FALSE,
    is_bot BOOLEAN DEFAULT FALSE,
    bot_mode bot_mode,
    attachments JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message Reactions
CREATE TABLE reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(message_id, user_id, emoji)
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT,
    body TEXT,
    data JSONB DEFAULT '{}',
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BOT CONVERSATIONS (stored locally + summary in DB)
-- ============================================================
CREATE TABLE bot_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    mode bot_mode DEFAULT 'cold',
    message_count INT DEFAULT 0,
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX idx_messages_channel ON messages(channel_id, created_at DESC);
CREATE INDEX idx_messages_author ON messages(author_id);
CREATE INDEX idx_friends_users ON friends(requester_id, addressee_id);
CREATE INDEX idx_server_members ON server_members(server_id, user_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at DESC);
CREATE INDEX idx_profiles_status ON profiles(status);
CREATE INDEX idx_signup_requests_status ON signup_requests(status);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE signup_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_sessions ENABLE ROW LEVEL SECURITY;

-- Profiles: public read, self-write
CREATE POLICY "profiles_public_read" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_self_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Messages: members of channel can read/write
CREATE POLICY "messages_channel_member_select" ON messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM server_members sm
            JOIN channels c ON c.server_id = sm.server_id
            WHERE c.id = messages.channel_id AND sm.user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM dm_participants dp
            WHERE dp.channel_id = messages.channel_id AND dp.user_id = auth.uid()
        )
    );

CREATE POLICY "messages_insert" ON messages FOR INSERT
    WITH CHECK (author_id = auth.uid());

CREATE POLICY "messages_update_own" ON messages FOR UPDATE
    USING (author_id = auth.uid());

-- Servers: members can read
CREATE POLICY "servers_member_read" ON servers FOR SELECT
    USING (
        is_public = TRUE OR
        EXISTS (SELECT 1 FROM server_members WHERE server_id = servers.id AND user_id = auth.uid())
    );

CREATE POLICY "servers_owner_manage" ON servers FOR ALL
    USING (owner_id = auth.uid());

-- Friends: only see your own
CREATE POLICY "friends_own" ON friends FOR ALL
    USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Notifications: own only
CREATE POLICY "notifications_own" ON notifications FOR ALL
    USING (user_id = auth.uid());

-- DM Participants: own channels
CREATE POLICY "dm_participants_own" ON dm_participants FOR SELECT
    USING (user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM dm_participants WHERE channel_id = dm_participants.channel_id AND user_id = auth.uid()
    ));

-- Signup requests: admin only read all, public insert
CREATE POLICY "signup_requests_insert" ON signup_requests FOR INSERT
    WITH CHECK (true);

CREATE POLICY "signup_requests_admin_read" ON signup_requests FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Bot sessions: own only
CREATE POLICY "bot_sessions_own" ON bot_sessions FOR ALL
    USING (user_id = auth.uid());

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, username, display_name)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Update last_seen
CREATE OR REPLACE FUNCTION update_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE profiles SET last_seen = NOW() WHERE id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update member count on server
CREATE OR REPLACE FUNCTION update_server_member_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE servers SET member_count = member_count + 1 WHERE id = NEW.server_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE servers SET member_count = member_count - 1 WHERE id = OLD.server_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER server_member_count_trigger
    AFTER INSERT OR DELETE ON server_members
    FOR EACH ROW EXECUTE FUNCTION update_server_member_count();

-- ============================================================
-- REALTIME subscriptions
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE friends;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE server_members;
ALTER PUBLICATION supabase_realtime ADD TABLE channels;

-- ============================================================
-- SEED: Default admin (change password after setup!)
-- ============================================================
-- NOTE: Create admin via Supabase Dashboard > Auth > Users
-- Then run: UPDATE profiles SET role = 'admin' WHERE username = 'admin';

SELECT 'Migration complete! TeamQuyTran DB ready.' AS status;
