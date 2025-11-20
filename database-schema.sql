-- Movie Streaming Backend Database Schema
-- Execute these SQL commands in your Supabase SQL editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================
-- USER SESSIONS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id VARCHAR(50) NOT NULL,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('movie', 'tv')),
  start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_progress INTEGER DEFAULT 0, -- seconds
  end_time TIMESTAMP WITH TIME ZONE,
  total_duration INTEGER, -- seconds
  completion_percentage DECIMAL(5,2) DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  watch_together_room_id VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes for performance
  CONSTRAINT user_sessions_content_idx UNIQUE (user_id, content_id, is_active)
);

-- =====================
-- WATCH HISTORY TABLE
-- =====================
CREATE TABLE IF NOT EXISTS watch_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id VARCHAR(50) NOT NULL,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('movie', 'tv')),
  watched_duration INTEGER DEFAULT 0, -- seconds
  total_duration INTEGER, -- seconds
  last_watched TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completion_percentage DECIMAL(5,2) DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  favorite BOOLEAN DEFAULT false,
  watch_session_id UUID REFERENCES user_sessions(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes for performance
  CONSTRAINT watch_history_unique UNIQUE (user_id, content_id)
);

-- =====================
-- USER PROFILES TABLE
-- =====================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  display_name VARCHAR(100),
  avatar TEXT,
  bio TEXT,
  preferences JSONB DEFAULT '{
    "language": "en",
    "region": "US", 
    "maturityRating": "PG-13",
    "autoplay": true,
    "subtitles": false,
    "theme": "system",
    "notifications": {
      "email": true,
      "push": true,
      "newContent": true,
      "watchParty": true
    }
  }',
  watch_preferences JSONB DEFAULT '{
    "preferredQuality": "auto",
    "preferredAudio": "en",
    "subtitleLanguage": "en",
    "skipIntro": false,
    "skipCredits": false,
    "playbackSpeed": 1.0
  }',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================
-- INDEXES FOR PERFORMANCE
-- =====================

-- User sessions indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_content_id ON user_sessions(content_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_updated_at ON user_sessions(updated_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_room_id ON user_sessions(watch_together_room_id) WHERE watch_together_room_id IS NOT NULL;

-- Watch history indexes
CREATE INDEX IF NOT EXISTS idx_watch_history_user_id ON watch_history(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_content_id ON watch_history(content_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_last_watched ON watch_history(last_watched DESC);
CREATE INDEX IF NOT EXISTS idx_watch_history_favorite ON watch_history(user_id, favorite) WHERE favorite = true;
CREATE INDEX IF NOT EXISTS idx_watch_history_completion ON watch_history(user_id, completion_percentage) WHERE completion_percentage >= 90;

-- User profiles indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_display_name ON user_profiles(display_name);

-- =====================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================

-- Enable RLS on all tables
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- User sessions policies
CREATE POLICY "Users can view their own sessions" ON user_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sessions" ON user_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions" ON user_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Watch history policies
CREATE POLICY "Users can view their own watch history" ON watch_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own watch history" ON watch_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own watch history" ON watch_history
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own watch history" ON watch_history
  FOR DELETE USING (auth.uid() = user_id);

-- User profiles policies
CREATE POLICY "Users can view their own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own profile" ON user_profiles
  FOR DELETE USING (auth.uid() = user_id);

-- =====================
-- FUNCTIONS FOR AUTOMATIC UPDATES
-- =====================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automatic updated_at updates
CREATE TRIGGER update_user_sessions_updated_at 
  BEFORE UPDATE ON user_sessions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_watch_history_updated_at 
  BEFORE UPDATE ON watch_history 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at 
  BEFORE UPDATE ON user_profiles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================
-- INITIAL DATA (OPTIONAL)
-- =====================

-- You can add any initial data here if needed
-- For example, default preferences or configuration data

-- =====================
-- VIEWS FOR COMMON QUERIES
-- =====================

-- View for user's continue watching
CREATE OR REPLACE VIEW continue_watching AS
SELECT 
  wh.*,
  us.current_position,
  us.last_updated
FROM watch_history wh
LEFT JOIN (
  SELECT 
    user_id,
    content_id,
    last_progress as current_position,
    updated_at as last_updated
  FROM user_sessions 
  WHERE is_active = true
) us ON wh.user_id = us.user_id AND wh.content_id = us.content_id
WHERE wh.completion_percentage < 90 
  AND wh.watched_duration > 0
ORDER BY us.last_updated DESC, wh.last_watched DESC;

-- View for user's favorites
CREATE OR REPLACE VIEW user_favorites AS
SELECT 
  wh.*,
  us.completion_percentage as session_completion
FROM watch_history wh
LEFT JOIN (
  SELECT 
    user_id,
    content_id,
    completion_percentage
  FROM user_sessions 
  WHERE is_active = true
) us ON wh.user_id = us.user_id AND wh.content_id = us.content_id
WHERE wh.favorite = true
ORDER BY wh.last_watched DESC;

-- =====================
-- CLEANUP FUNCTIONS
-- =====================

-- Function to cleanup stale sessions (older than 24 hours)
CREATE OR REPLACE FUNCTION cleanup_stale_sessions()
RETURNS INTEGER AS $$
DECLARE
  cleaned_count INTEGER;
BEGIN
  UPDATE user_sessions 
  SET is_active = false 
  WHERE is_active = true 
    AND updated_at < NOW() - INTERVAL '24 hours';
  
  GET DIAGNOSTICS cleaned_count = ROW_COUNT;
  RETURN cleaned_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get user statistics
CREATE OR REPLACE FUNCTION get_user_watch_stats(user_uuid UUID, days_back INTEGER DEFAULT 30)
RETURNS TABLE(
  total_sessions BIGINT,
  total_watch_time BIGINT,
  unique_content BIGINT,
  completed_content BIGINT,
  favorite_content BIGINT,
  average_completion NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_sessions,
    COALESCE(SUM(last_progress), 0) as total_watch_time,
    COUNT(DISTINCT content_id) as unique_content,
    COUNT(CASE WHEN completion_percentage >= 90 THEN 1 END) as completed_content,
    COUNT(CASE WHEN favorite = true THEN 1 END) as favorite_content,
    COALESCE(AVG(completion_percentage), 0) as average_completion
  FROM watch_history
  WHERE user_id = user_uuid
    AND last_watched >= NOW() - INTERVAL '1 day' * days_back;
END;
$$ LANGUAGE plpgsql;

-- =====================
-- COMMENTS FOR DOCUMENTATION
-- =====================

COMMENT ON TABLE user_sessions IS 'Tracks active user watching sessions with real-time progress';
COMMENT ON TABLE watch_history IS 'Stores complete user viewing history and favorite content';
COMMENT ON TABLE user_profiles IS 'User profiles with preferences and watch preferences';
COMMENT ON VIEW continue_watching IS 'Content user has started but not completed (less than 90%)';
COMMENT ON VIEW user_favorites IS 'Content marked as favorite by user';

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;