"""Supabase CRUD service for all 5 application tables.

All methods filter by user_id for multi-user safety.
Uses the supabase-py v2 sync API: client.table(...).select/insert/upsert/update(...).execute()
"""
from __future__ import annotations

from typing import Optional

from supabase import Client


class DBService:
    """Provides CRUD operations for users, jobs, form_qa_pairs, resumes, and chat_messages."""

    def __init__(self, client: Client, user_id: str) -> None:
        self.client = client
        self.user_id = user_id

    # ── Users ────────────────────────────────────────────────────────────────

    def upsert_user(self, data: dict) -> dict:
        """Insert or update the user record identified by user_id."""
        payload = {**data, "id": self.user_id}
        result = self.client.table("users").upsert(payload).execute()
        return result.data[0]

    def get_user(self) -> Optional[dict]:
        """Return the user record for user_id, or None if not found."""
        result = self.client.table("users").select("*").eq("id", self.user_id).execute()
        return result.data[0] if result.data else None

    # ── Jobs ─────────────────────────────────────────────────────────────────

    def create_job(self, data: dict) -> dict:
        """Insert a new job row and return it."""
        payload = {**data, "user_id": self.user_id}
        result = self.client.table("jobs").insert(payload).execute()
        return result.data[0]

    def update_job(self, job_id: str, data: dict) -> dict:
        """Update an existing job row owned by user_id and return the updated row."""
        result = (
            self.client.table("jobs")
            .update(data)
            .eq("id", job_id)
            .eq("user_id", self.user_id)
            .execute()
        )
        return result.data[0]

    def get_job(self, job_id: str) -> Optional[dict]:
        """Return a job filtered by job_id and user_id, or None if not found."""
        result = (
            self.client.table("jobs")
            .select("*")
            .eq("id", job_id)
            .eq("user_id", self.user_id)
            .execute()
        )
        return result.data[0] if result.data else None

    def get_jobs_for_user(self) -> list[dict]:
        """Return all jobs for user_id ordered by created_at desc."""
        result = (
            self.client.table("jobs")
            .select("*")
            .eq("user_id", self.user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return result.data

    # ── Form Q&A Pairs ────────────────────────────────────────────────────────

    def upsert_qa_pairs(self, job_id: str, qa_pairs: list[dict]) -> list[dict]:
        """Upsert Q&A pairs for a job, using (job_id, field_id) as the unique key."""
        if not qa_pairs:
            return []
        payload = [
            {**pair, "job_id": job_id, "user_id": self.user_id}
            for pair in qa_pairs
        ]
        result = (
            self.client.table("form_qa_pairs")
            .upsert(payload, on_conflict="job_id,field_id")
            .execute()
        )
        return result.data

    def get_qa_pairs_for_job(self, job_id: str) -> list[dict]:
        """Return all Q&A pairs for a job filtered by job_id and user_id."""
        result = (
            self.client.table("form_qa_pairs")
            .select("*")
            .eq("job_id", job_id)
            .eq("user_id", self.user_id)
            .execute()
        )
        return result.data

    # ── Resumes ───────────────────────────────────────────────────────────────

    def get_resumes_for_job(self, job_id: str) -> list[dict]:
        """Return all resume records for a specific job."""
        result = (
            self.client.table("resumes")
            .select("*")
            .eq("job_id", job_id)
            .eq("user_id", self.user_id)
            .execute()
        )
        return result.data

    def save_base_resume(self, resume_text: str) -> dict:
        """Insert or update the base resume for user_id (is_base=True, job_id=None)."""
        payload = {
            "user_id": self.user_id,
            "resume_text": resume_text,
            "is_base": True,
            "job_id": None,
        }
        result = (
            self.client.table("resumes")
            .upsert(payload, on_conflict="user_id,is_base")
            .execute()
        )
        return result.data[0]

    def get_base_resume(self) -> Optional[dict]:
        """Return the base resume record for user_id, or None."""
        result = (
            self.client.table("resumes")
            .select("*")
            .eq("user_id", self.user_id)
            .eq("is_base", True)
            .execute()
        )
        return result.data[0] if result.data else None

    # ── Chat Messages ─────────────────────────────────────────────────────────

    def get_chat_messages_for_job(self, job_id: str) -> list[dict]:
        """Return all chat messages for a job ordered by created_at asc."""
        result = (
            self.client.table("chat_messages")
            .select("*")
            .eq("job_id", job_id)
            .eq("user_id", self.user_id)
            .execute()
        )
        return result.data
