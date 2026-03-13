"""Tests for connection-check route behavior."""
from unittest.mock import MagicMock

import pytest

from app.models.schemas import TestConnectionResponse as ConnectionResponseModel
from app.routers.connection import test_connection as run_test_connection


def test_test_connection_with_valid_client_returns_connected_true():
    """Working Supabase query returns connected=True."""
    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.limit.return_value.execute.return_value.data = [
        {"id": "user-1"}
    ]

    response = run_test_connection(client=mock_client, user_id="user-1")

    assert isinstance(response, ConnectionResponseModel)
    assert response.connected is True
    assert "message" in response.model_dump()


def test_test_connection_with_invalid_client_returns_connected_false():
    """DB query exceptions are converted into connected=False."""
    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.limit.return_value.execute.side_effect = Exception(
        "Invalid API key"
    )

    response = run_test_connection(client=mock_client, user_id="user-1")

    assert isinstance(response, ConnectionResponseModel)
    assert response.connected is False
    assert "Invalid API key" in response.message
