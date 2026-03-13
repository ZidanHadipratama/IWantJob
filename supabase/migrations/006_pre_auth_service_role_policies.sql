-- 006_pre_auth_service_role_policies.sql
-- Align the shipped RLS policy story with the current pre-auth runtime model.
-- The app currently uses backend-enforced user scoping via X-User-Id together
-- with a Supabase service_role key. These policies preserve the future
-- auth.uid()-based path while explicitly allowing the current service_role path.

DROP POLICY IF EXISTS "users_self_access" ON users;
CREATE POLICY "users_self_access" ON users
    FOR ALL USING (auth.role() = 'service_role' OR auth.uid() = id);

DROP POLICY IF EXISTS "jobs_user_access" ON jobs;
CREATE POLICY "jobs_user_access" ON jobs
    FOR ALL USING (auth.role() = 'service_role' OR auth.uid() = user_id);

DROP POLICY IF EXISTS "resumes_user_access" ON resumes;
CREATE POLICY "resumes_user_access" ON resumes
    FOR ALL USING (auth.role() = 'service_role' OR auth.uid() = user_id);

DROP POLICY IF EXISTS "chat_messages_user_access" ON chat_messages;
CREATE POLICY "chat_messages_user_access" ON chat_messages
    FOR ALL USING (auth.role() = 'service_role' OR auth.uid() = user_id);

DROP POLICY IF EXISTS "form_qa_pairs_user_access" ON form_qa_pairs;
CREATE POLICY "form_qa_pairs_user_access" ON form_qa_pairs
    FOR ALL USING (auth.role() = 'service_role' OR auth.uid() = user_id);
