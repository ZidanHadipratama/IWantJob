-- 002_form_qa_pairs.sql
-- Creates the form_qa_pairs table for storing form fill Q&A data per job
-- Separate migration because this is the core feature table

-- =============================================================================
-- form_qa_pairs
-- =============================================================================
CREATE TABLE form_qa_pairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    field_id TEXT,
    question TEXT,
    answer TEXT,
    field_type TEXT,
    edited_by_user BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(job_id, field_id)
);

-- =============================================================================
-- Row Level Security
-- =============================================================================
ALTER TABLE form_qa_pairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "form_qa_pairs_user_access" ON form_qa_pairs
    FOR ALL USING (auth.uid() = user_id);
