"""Tests for structured JSON logging."""

from __future__ import annotations

import json
import logging
import sys

from app.logging_config import JsonFormatter


def test_json_formatter_emits_expected_fields():
    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="test.logger",
        level=logging.WARNING,
        pathname=__file__,
        lineno=12,
        msg="hello %s",
        args=("world",),
        exc_info=None,
    )

    payload = json.loads(formatter.format(record))

    assert payload["level"] == "warning"
    assert payload["logger"] == "test.logger"
    assert payload["message"] == "hello world"
    assert payload["module"] == "test_logging_config"
    assert payload["function"] is None
    assert payload["line"] == 12
    assert "timestamp" in payload


def test_json_formatter_includes_extra_fields_and_exceptions():
    formatter = JsonFormatter()
    message = "boom"

    try:
        raise ValueError(message)
    except ValueError:
        record = logging.LogRecord(
            name="test.logger",
            level=logging.ERROR,
            pathname=__file__,
            lineno=34,
            msg="failed",
            args=(),
            exc_info=sys.exc_info(),
        )
        record.correlation_id = "abc-123"

    payload = json.loads(formatter.format(record))

    assert payload["level"] == "error"
    assert payload["extra"] == {"correlation_id": "abc-123"}
    assert "ValueError: boom" in payload["exception"]
