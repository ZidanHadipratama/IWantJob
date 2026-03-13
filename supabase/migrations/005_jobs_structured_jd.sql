-- 005_jobs_structured_jd.sql
-- Adds structured_job_description JSONB column to the jobs table

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS structured_job_description JSONB;
