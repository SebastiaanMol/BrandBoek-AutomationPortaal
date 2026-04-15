"""Tests for Typeform HubSpot sync helpers."""

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.service.operations.constants import IB_PIPELINE_ID
from app.service.typeform import typeform


def _deal(deal_id: str, **properties: str) -> SimpleNamespace:
    return SimpleNamespace(id=deal_id, properties=properties)


class _Response:
    def __init__(self, status: int = 200, body: bytes = b"ok") -> None:
        self.status = status
        self._body = body

    def __enter__(self) -> "_Response":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def read(self) -> bytes:
        return self._body


def test_mark_ib_typeform_completed_updates_matching_ib_deal():
    updated_deals: list[tuple[str, dict[str, str]]] = []

    with (
        patch.object(
            typeform.hubspot_repository,
            "get_deals_for_contact",
            return_value=["ib-2025", "ib-2024", "jr-2025"],
        ),
        patch.object(
            typeform.hubspot_repository,
            "batch_get_deals_info",
            return_value=[
                _deal(
                    "ib-2025",
                    pipeline=IB_PIPELINE_ID,
                    year="2025",
                    ib_typeform_ingevuld="false",
                ),
                _deal(
                    "ib-2024",
                    pipeline=IB_PIPELINE_ID,
                    year="2024",
                    ib_typeform_ingevuld="false",
                ),
                _deal("jr-2025", pipeline="jr-pipeline", year="2025"),
            ],
        ),
        patch.object(
            typeform.hubspot_repository,
            "update_deal_properties",
            side_effect=lambda deal_id, properties: updated_deals.append(
                (str(deal_id), properties)
            ),
        ),
    ):
        updated = typeform.mark_ib_typeform_completed("contact-1", "2025")

    assert updated == 1
    assert updated_deals == [("ib-2025", {"ib_typeform_ingevuld": "true"})]


def test_mark_ib_typeform_completed_skips_already_completed_deal():
    with (
        patch.object(
            typeform.hubspot_repository,
            "get_deals_for_contact",
            return_value=["ib-2025"],
        ),
        patch.object(
            typeform.hubspot_repository,
            "batch_get_deals_info",
            return_value=[
                _deal(
                    "ib-2025",
                    pipeline=IB_PIPELINE_ID,
                    year="2025",
                    ib_typeform_ingevuld="true",
                )
            ],
        ),
        patch.object(
            typeform.hubspot_repository, "update_deal_properties"
        ) as update_mock,
    ):
        updated = typeform.mark_ib_typeform_completed("contact-1", "2025")

    assert updated == 0
    update_mock.assert_not_called()


def test_ensure_child_folder_returns_existing_folder_after_409_conflict():
    conflict_error = RuntimeError(
        "POST https://graph.microsoft.com/v1.0/... failed with 409: "
        '{"error":{"code":"nameAlreadyExists","message":"Name already exists"}}'
    )

    with (
        patch.object(
            typeform,
            "list_children",
            side_effect=[
                [],
                [{"id": "folder-1", "name": "2026", "folder": {}}],
            ],
        ),
        patch.object(typeform, "graph_json", side_effect=conflict_error),
    ):
        result = typeform.ensure_child_folder(
            drive_id="drive-1",
            parent_folder_id="parent-1",
            folder_name="2026",
            token="token-1",
        )

    assert result == {"id": "folder-1", "name": "2026", "folder": {}}


def test_ensure_child_folder_reraises_non_conflict_error():
    with (
        patch.object(typeform, "list_children", return_value=[]),
        patch.object(
            typeform,
            "graph_json",
            side_effect=RuntimeError(
                "POST https://graph.microsoft.com/v1.0/... failed with 500"
            ),
        ),
    ):
        with pytest.raises(RuntimeError, match="failed with 500"):
            typeform.ensure_child_folder(
                drive_id="drive-1",
                parent_folder_id="parent-1",
                folder_name="2026",
                token="token-1",
            )


def test_http_request_normalizes_unicode_url_before_urlopen():
    captured_url: list[str] = []

    def fake_urlopen(request):
        captured_url.append(request.full_url)
        return _Response()

    with patch("urllib.request.urlopen", side_effect=fake_urlopen):
        status, body = typeform.http_request(
            "GET",
            "https://example.com/files/Jan\u2019s bestand.pdf?name=Jan\u2019s bestand.pdf",
        )

    assert status == 200
    assert body == b"ok"
    assert captured_url == [
        "https://example.com/files/Jan%E2%80%99s%20bestand.pdf?name=Jan%E2%80%99s%20bestand.pdf"
    ]


def test_resolve_contact_folder_renames_existing_folder_with_contact_id_to_exact_name():
    with (
        patch.object(
            typeform,
            "list_children",
            return_value=[
                {
                    "id": "existing-folder",
                    "name": "Emiliano Kooijman 43394833999",
                    "folder": {},
                }
            ],
        ),
        patch.object(
            typeform,
            "rename_drive_item",
            return_value={
                "id": "existing-folder",
                "name": "Emiliano Kooijman, 43394833999",
                "folder": {},
            },
        ) as rename_drive_item,
        patch.object(typeform, "ensure_child_folder") as ensure_child_folder,
    ):
        result = typeform.resolve_contact_folder(
            drive_id="drive-1",
            dossier_folder_id="dossier-1",
            contact_name="Emiliano Kooijman",
            desired_folder_name="Emiliano Kooijman, 43394833999",
            token="token-1",
        )

    assert result == {
        "id": "existing-folder",
        "name": "Emiliano Kooijman, 43394833999",
        "folder": {},
    }
    rename_drive_item.assert_called_once_with(
        "drive-1",
        "existing-folder",
        "Emiliano Kooijman, 43394833999",
        "token-1",
    )
    ensure_child_folder.assert_not_called()


def test_find_dossier_folder_renames_root_level_match_to_exact_name():
    with (
        patch.object(
            typeform,
            "get_dossier_search_key",
            return_value="13685461428",
        ),
        patch.object(
            typeform,
            "get_dossier_name",
            return_value="A de Boer",
        ),
        patch.object(
            typeform,
            "search_dossier_folders",
            return_value=[
                {
                    "id": "nested-folder",
                    "name": "A de Boer 13685461428",
                    "folder": {},
                    "parentReference": {"id": "some-other-parent"},
                },
                {
                    "id": "root-folder",
                    "name": "A. & Y. de Boer - de Cock 13685461428",
                    "folder": {},
                    "parentReference": {"id": "root-1"},
                },
            ],
        ),
        patch.object(
            typeform,
            "rename_drive_item",
            return_value={
                "id": "root-folder",
                "name": "A de Boer, 13685461428",
                "folder": {},
                "parentReference": {"id": "root-1"},
            },
        ) as rename_drive_item,
    ):
        result = typeform.find_dossier_folder(
            drive_id="drive-1",
            drive_root_id="root-1",
            contact_id="contact-1",
            token="token-1",
        )

    assert result == {
        "id": "root-folder",
        "name": "A de Boer, 13685461428",
        "folder": {},
        "parentReference": {"id": "root-1"},
    }
    rename_drive_item.assert_called_once_with(
        "drive-1",
        "root-folder",
        "A de Boer, 13685461428",
        "token-1",
    )
