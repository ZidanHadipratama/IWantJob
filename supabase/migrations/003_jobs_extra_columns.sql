-- 003_jobs_extra_columns.sql
-- Adds job_type, location, and salary_range columns to the jobs table

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_type TEXT DEFAULT 'unknown';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_range TEXT;
