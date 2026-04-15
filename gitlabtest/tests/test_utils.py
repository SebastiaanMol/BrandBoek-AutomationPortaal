"""Tests for pure utility functions that don't require API calls."""

from datetime import date

import pytest

from app.service.operations.find_correct_stage import first_day_of_next_quarter
from app.service.operations.find_correct_stage import is_deal_before_reference_year
from app.service.operations.find_correct_stage import parse_quarter
from app.service.operations.find_correct_stage import parse_reference_year_quarter
from app.service.operations.find_correct_stage import to_int
from app.service.operations.va_pipelines.utils import parse_date as _parse_date
from app.service.sales.sales import format_ligo_email
from app.utils import get_year_from_date
from app.utils import parse_daily_time as _parse_daily_time

# --- _parse_daily_time ---


class TestParseDailyTime:
    def test_valid_time(self):
        assert _parse_daily_time("03:00") == (3, 0)

    def test_valid_time_afternoon(self):
        assert _parse_daily_time("14:30") == (14, 30)

    def test_midnight(self):
        assert _parse_daily_time("00:00") == (0, 0)

    def test_end_of_day(self):
        assert _parse_daily_time("23:59") == (23, 59)

    def test_invalid_hour(self):
        with pytest.raises(ValueError, match="HH:MM"):
            _parse_daily_time("25:00")

    def test_invalid_minute(self):
        with pytest.raises(ValueError, match="HH:MM"):
            _parse_daily_time("12:60")

    def test_invalid_format(self):
        with pytest.raises(ValueError, match="HH:MM"):
            _parse_daily_time("not-a-time")

    def test_empty_string(self):
        with pytest.raises(ValueError, match="HH:MM"):
            _parse_daily_time("")


# --- get_year_from_date ---


class TestGetYearFromDate:
    def test_millis_timestamp(self):
        # 2024-11-28 in millis
        assert get_year_from_date(1732787689123) == 2024

    def test_string_millis(self):
        assert get_year_from_date("1732787689123") == 2024

    def test_none_returns_none(self):
        assert get_year_from_date(None) is None


# --- _parse_date ---


class TestParseDate:
    def test_iso_date(self):
        result = _parse_date("2024-06-15")
        assert result == date(2024, 6, 15)

    def test_iso_with_z(self):
        result = _parse_date("2024-06-15T12:00:00Z")
        assert result == date(2024, 6, 15)

    def test_millis(self):
        # 2024-11-28 timestamp
        result = _parse_date("1732787689123")
        assert result.year == 2024

    def test_none(self):
        assert _parse_date(None) is None

    def test_empty(self):
        assert _parse_date("") is None


# --- parse_quarter ---


class TestParseQuarter:
    def test_q1(self):
        assert parse_quarter("Q1") == 1

    def test_numeric(self):
        assert parse_quarter("3") == 3

    def test_integer(self):
        assert parse_quarter(4) == 4

    def test_out_of_range(self):
        assert parse_quarter("5") is None

    def test_zero(self):
        assert parse_quarter("0") is None

    def test_none(self):
        assert parse_quarter(None) is None

    def test_parse_quarter_uppercase(self):
        assert parse_quarter("Q2") == 2

    def test_parse_quarter_lowercase(self):
        assert parse_quarter("q3") == 3

    def test_parse_quarter_empty(self):
        assert parse_quarter("") is None


# --- to_int ---


class TestToInt:
    def test_int(self):
        assert to_int(42) == 42

    def test_string(self):
        assert to_int("123") == 123

    def test_string_with_spaces(self):
        assert to_int(" 99 ") == 99

    def test_none(self):
        assert to_int(None) is None

    def test_invalid(self):
        assert to_int("abc") is None


# --- first_day_of_next_quarter ---


class TestFirstDayOfNextQuarter:
    def test_q1(self):
        assert first_day_of_next_quarter(2024, "Q1") == date(2024, 4, 1)

    def test_q2(self):
        assert first_day_of_next_quarter(2024, 2) == date(2024, 7, 1)

    def test_q3(self):
        assert first_day_of_next_quarter(2024, "3") == date(2024, 10, 1)

    def test_q4_wraps_year(self):
        assert first_day_of_next_quarter(2024, "Q4") == date(2025, 1, 1)

    def test_invalid_quarter(self):
        assert first_day_of_next_quarter(2024, "Q5") is None

    def test_none_year(self):
        assert first_day_of_next_quarter(None, "Q1") is None


# --- parse_reference_year_quarter ---


class TestParseReferenceYearQuarter:
    def test_iso_date(self):
        result = parse_reference_year_quarter("2024-07-15T00:00:00Z")
        assert result == (2024, 3)  # July = Q3

    def test_millis(self):
        # 2024-01-15 in millis approx
        result = parse_reference_year_quarter("1705276800000")
        assert result is not None
        assert result[0] == 2024
        assert result[1] == 1  # January = Q1

    def test_none(self):
        assert parse_reference_year_quarter(None) is None

    def test_empty(self):
        assert parse_reference_year_quarter("") is None


# --- is_deal_before_reference_year ---


class TestIsDealBeforeReferenceYear:
    def test_deal_before(self):
        # Deal year 2023, reference date in 2024
        assert is_deal_before_reference_year("2023", "2024-07-01T00:00:00Z") is True

    def test_deal_same_year(self):
        assert is_deal_before_reference_year("2024", "2024-07-01T00:00:00Z") is False

    def test_deal_after(self):
        assert is_deal_before_reference_year("2025", "2024-07-01T00:00:00Z") is False

    def test_missing_deal_year(self):
        assert is_deal_before_reference_year(None, "2024-07-01T00:00:00Z") is False

    def test_missing_reference(self):
        assert is_deal_before_reference_year("2023", None) is False


# --- format_ligo_email ---


class TestFormatLigoEmail:
    def test_parses_sections(self):
        raw = "*Hulp bij belastingaangifte*Jan*de Vries*jan@example.com*0612345678*"
        result = format_ligo_email(raw)
        assert result["description"] == "Hulp bij belastingaangifte"
        assert result["first_name"] == "Jan"
        assert result["last_name"] == "de Vries"
        assert result["email"] == "jan@example.com"
        assert result["phone"] == "0612345678"

    def test_dash_values_become_none(self):
        raw = "*Vraag*-*-*test@test.com*-*"
        result = format_ligo_email(raw)
        assert result["first_name"] is None
        assert result["last_name"] is None
        assert result["phone"] is None
        assert result["email"] == "test@test.com"
        assert result["description"] == "Vraag"
