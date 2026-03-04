"""Tests for FastAPI dependencies and DBService CRUD methods.

Uses unittest.mock to avoid real DB connections.
"""
from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request


# ─── Dependency tests ───────────────────────────────────────────────────────


def _make_request(headers: dict) -> Request:
    """Build a minimal Starlette Request with the given headers."""
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "query_string": b"",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
    }
    return Request(scope)


class TestGetSupabaseClient:
    def test_raises_400_when_url_missing(self):
        from app.dependencies import get_supabase_client

        request = _make_request({"X-Supabase-Key": "some-key"})
        with pytest.raises(HTTPException) as exc_info:
            get_supabase_client(request)
        assert exc_info.value.status_code == 400
        assert "X-Supabase-Url" in exc_info.value.detail

    def test_raises_400_when_key_missing(self):
        from app.dependencies import get_supabase_client

        request = _make_request({"X-Supabase-Url": "https://example.supabase.co"})
        with pytest.raises(HTTPException) as exc_info:
            get_supabase_client(request)
        assert exc_info.value.status_code == 400
        assert "X-Supabase-Key" in exc_info.value.detail

    def test_returns_client_when_headers_present(self):
        from app.dependencies import get_supabase_client

        request = _make_request(
            {
                "X-Supabase-Url": "https://example.supabase.co",
                "X-Supabase-Key": "some-anon-key",
            }
        )
        with patch("app.dependencies.create_client") as mock_create:
            mock_client = MagicMock()
            mock_create.return_value = mock_client
            result = get_supabase_client(request)
        mock_create.assert_called_once_with("https://example.supabase.co", "some-anon-key")
        assert result is mock_client


class TestGetUserId:
    def test_raises_400_when_user_id_missing(self):
        from app.dependencies import get_user_id

        request = _make_request({})
        with pytest.raises(HTTPException) as exc_info:
            get_user_id(request)
        assert exc_info.value.status_code == 400
        assert "X-User-Id" in exc_info.value.detail

    def test_returns_uuid_string_when_present(self):
        from app.dependencies import get_user_id

        uid = "550e8400-e29b-41d4-a716-446655440000"
        request = _make_request({"X-User-Id": uid})
        result = get_user_id(request)
        assert result == uid


# ─── DBService tests ─────────────────────────────────────────────────────────


def _make_db_service(mock_client=None):
    from app.services.db_service import DBService

    if mock_client is None:
        mock_client = MagicMock()
    return DBService(client=mock_client, user_id="user-123"), mock_client


def _chain(mock_client, table_name: str):
    """Return the mock chain: client.table(table_name).method(...)...execute()"""
    return mock_client.table.return_value


class TestDBServiceUpsertUser:
    def test_upsert_user_calls_upsert_with_user_id_as_id(self):
        svc, client = _make_db_service()
        chain = _chain(client, "users")
        chain.upsert.return_value.execute.return_value.data = [{"id": "user-123", "name": "Alice"}]

        result = svc.upsert_user({"name": "Alice", "email": "alice@example.com"})

        client.table.assert_called_with("users")
        upsert_call_kwargs = chain.upsert.call_args
        payload = upsert_call_kwargs[0][0]
        assert payload["id"] == "user-123"
        assert result == {"id": "user-123", "name": "Alice"}


class TestDBServiceGetUser:
    def test_get_user_returns_record_filtered_by_id(self):
        svc, client = _make_db_service()
        chain = _chain(client, "users")
        execute_mock = chain.select.return_value.eq.return_value.execute
        execute_mock.return_value.data = [{"id": "user-123"}]

        result = svc.get_user()

        client.table.assert_called_with("users")
        assert result == {"id": "user-123"}

    def test_get_user_returns_none_when_not_found(self):
        svc, client = _make_db_service()
        chain = _chain(client, "users")
        chain.select.return_value.eq.return_value.execute.return_value.data = []

        result = svc.get_user()
        assert result is None


class TestDBServiceCreateJob:
    def test_create_job_inserts_with_user_id(self):
        svc, client = _make_db_service()
        chain = _chain(client, "jobs")
        chain.insert.return_value.execute.return_value.data = [
            {"id": "job-abc", "user_id": "user-123", "company": "Acme"}
        ]

        result = svc.create_job({"company": "Acme", "title": "Engineer"})

        client.table.assert_called_with("jobs")
        insert_payload = chain.insert.call_args[0][0]
        assert insert_payload["user_id"] == "user-123"
        assert result["company"] == "Acme"


class TestDBServiceGetJob:
    def test_get_job_returns_job_with_matching_id_and_user_id(self):
        svc, client = _make_db_service()
        chain = _chain(client, "jobs")
        # Simulate chained .eq().eq().execute()
        chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
            {"id": "job-abc", "user_id": "user-123"}
        ]

        result = svc.get_job("job-abc")

        client.table.assert_called_with("jobs")
        assert result == {"id": "job-abc", "user_id": "user-123"}

    def test_get_job_returns_none_when_not_found(self):
        svc, client = _make_db_service()
        chain = _chain(client, "jobs")
        chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []

        result = svc.get_job("nonexistent")
        assert result is None


class TestDBServiceGetJobsForUser:
    def test_get_jobs_for_user_returns_all_jobs_filtered_by_user_id(self):
        svc, client = _make_db_service()
        chain = _chain(client, "jobs")
        chain.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [
            {"id": "j1", "user_id": "user-123"},
            {"id": "j2", "user_id": "user-123"},
        ]

        result = svc.get_jobs_for_user()

        client.table.assert_called_with("jobs")
        assert len(result) == 2


class TestDBServiceUpsertQAPairs:
    def test_upsert_qa_pairs_calls_upsert_with_on_conflict(self):
        svc, client = _make_db_service()
        chain = _chain(client, "form_qa_pairs")
        chain.upsert.return_value.execute.return_value.data = [
            {"job_id": "job-abc", "field_id": "field-1"}
        ]

        pairs = [{"field_id": "field-1", "question": "Name?", "answer": "Alice", "field_type": "text"}]
        result = svc.upsert_qa_pairs("job-abc", pairs)

        client.table.assert_called_with("form_qa_pairs")
        upsert_kwargs = chain.upsert.call_args[1]
        assert "on_conflict" in upsert_kwargs
        assert "job_id" in upsert_kwargs["on_conflict"]
        assert "field_id" in upsert_kwargs["on_conflict"]


class TestDBServiceGetQAPairsForJob:
    def test_get_qa_pairs_returns_filtered_by_job_id_and_user_id(self):
        svc, client = _make_db_service()
        chain = _chain(client, "form_qa_pairs")
        chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
            {"job_id": "job-abc", "user_id": "user-123", "field_id": "f1"}
        ]

        result = svc.get_qa_pairs_for_job("job-abc")

        client.table.assert_called_with("form_qa_pairs")
        assert len(result) == 1
        assert result[0]["field_id"] == "f1"
