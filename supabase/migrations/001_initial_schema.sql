-- 001_initial_schema.sql
-- Creates the core tables for JobPilot: users, jobs, resumes, chat_messages
-- All tables include user_id for multi-user safety and RLS policies

-- =============================================================================
-- 1. users
-- =============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    email TEXT,
    linkedin_url TEXT,
    github_url TEXT,
    work_authorization TEXT,
    base_resume_text TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 2. jobs
-- =============================================================================
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    company TEXT,
    title TEXT,
    url TEXT,
    job_description TEXT,
    status TEXT DEFAULT 'saved',
    applied_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 3. resumes
-- =============================================================================
CREATE TABLE resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    resume_text TEXT,
    pdf_url TEXT,
    is_base BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 4. chat_messages
-- =============================================================================
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role TEXT,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- Row Level Security
-- =============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_self_access" ON users
    FOR ALL USING (auth.uid() = id);

CREATE POLICY "jobs_user_access" ON jobs
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "resumes_user_access" ON resumes
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "chat_messages_user_access" ON chat_messages
    FOR ALL USING (auth.uid() = user_id);
