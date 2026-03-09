-- 004_jobs_employment_type.sql
-- Adds employment_type column to the jobs table

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS employment_type TEXT;
