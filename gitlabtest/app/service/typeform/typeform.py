import base64
import hashlib
import hmac
import json
import logging
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC
from datetime import datetime
from typing import Any

import sentry_sdk

from app.repository import hubspot as hubspot_repository
from app.service.operations.constants import IB_PIPELINE_ID

GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
TYPEFORM_API_BASE_URL = "https://api.typeform.com"
DEFAULT_SHAREPOINT_SITE_PATH = "/sites/Clients"
DEFAULT_YEAR_FOLDER = "2025"
TYPEFORM_SIGNATURE_HEADER = "Typeform-Signature"


def verify_signature(signature_header: str | None, raw_body: bytes) -> bool:
    secret = os.getenv("TYPEFORM_WEBHOOK_SECRET")
    if not secret:
        return True

    if not signature_header:
        return False

    digest = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).digest()
    expected = "sha256=" + base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(expected, signature_header)


def process_typeform_webhook(payload: dict[str, Any]) -> dict[str, Any]:
    event_type = payload.get("event_type")
    if event_type and event_type != "form_response":
        logging.info("Ignoring Typeform event_type=%s", event_type)
        return {"status": "ignored", "reason": f"Unsupported event_type {event_type}"}

    form_response = payload.get("form_response")
    if not isinstance(form_response, dict):
        msg = "Typeform payload does not contain form_response."
        raise TypeError(msg)

    contact_id = extract_contact_id(payload, form_response)
    if not contact_id:
        sentry_sdk.capture_message(
            "Typeform webhook received without a usable contact ID in the first question.",
            level="warning",
        )
        return {"status": "ignored", "reason": "Missing contact ID"}

    year_folder_name = os.getenv("TYPEFORM_SHAREPOINT_YEAR_FOLDER", DEFAULT_YEAR_FOLDER)
    ib_deals_updated = mark_ib_typeform_completed(contact_id, year_folder_name)

    token = get_graph_access_token()
    site_path = os.getenv("TYPEFORM_SHAREPOINT_SITE_PATH", DEFAULT_SHAREPOINT_SITE_PATH)
    host = require_env("SP_HOST")
    site = get_site(token, host, site_path)
    site_id = site["id"]

    drive = graph_json("GET", f"/sites/{site_id}/drive", token)
    drive_id = drive["id"]
    drive_root = graph_json("GET", f"/drives/{drive_id}/root", token)
    drive_root_id = drive_root["id"]

    dossier_folder = find_dossier_folder(drive_id, drive_root_id, contact_id, token)
    if not dossier_folder:
        message = f"No SharePoint dossier folder found in {site_path} for contact ID {contact_id}."
        sentry_sdk.capture_message(message, level="warning")
        logging.warning(message)
        return {
            "status": "missing_dossier_folder",
            "contact_id": contact_id,
            "site_path": site_path,
        }
    contact_name = get_contact_display_name(contact_id)
    contact_folder_name = build_contact_folder_name(contact_name, contact_id)
    contact_folder = resolve_contact_folder(
        drive_id,
        dossier_folder["id"],
        contact_name,
        contact_folder_name,
        token,
    )
    year_folder = ensure_child_folder(
        drive_id, contact_folder["id"], year_folder_name, token
    )
    ib_typeform_folder = ensure_child_folder(
        drive_id,
        year_folder["id"],
        "IB Typeform",
        token,
    )

    uploaded_files = upload_typeform_files_to_sharepoint(
        payload,
        drive_id,
        ib_typeform_folder["id"],
        token,
    )

    summary_name = build_summary_filename(contact_folder["name"])
    summary_content = render_summary_document(payload, contact_id, uploaded_files)
    upload_bytes_to_folder(
        drive_id,
        ib_typeform_folder["id"],
        summary_name,
        summary_content,
        "application/pdf",
        token,
    )
    logging.info(
        "Processed Typeform webhook for contact %s into SharePoint folder '%s/%s/%s'.",
        contact_id,
        contact_folder["name"],
        year_folder["name"],
        ib_typeform_folder["name"],
    )

    return {
        "status": "uploaded",
        "contact_id": contact_id,
        "dossier_folder": dossier_folder["name"],
        "contact_folder": contact_folder["name"],
        "year_folder": year_folder["name"],
        "ib_typeform_folder": ib_typeform_folder["name"],
        "summary_file": summary_name,
        "uploaded_files": [item["name"] for item in uploaded_files],
        "ib_deals_updated": ib_deals_updated,
    }


def mark_ib_typeform_completed(contact_id: str, year: str) -> int:
    deal_ids = hubspot_repository.get_deals_for_contact(contact_id)
    if not deal_ids:
        return 0

    deals = hubspot_repository.batch_get_deals_info(
        deal_ids,
        ["pipeline", "year", "ib_typeform_ingevuld"],
    )

    updated = 0
    for deal in deals or []:
        props = getattr(deal, "properties", {}) or {}
        if str(props.get("pipeline") or "") != IB_PIPELINE_ID:
            continue
        if str(props.get("year") or "") != str(year):
            continue
        if str(props.get("ib_typeform_ingevuld") or "").lower() == "true":
            continue

        hubspot_repository.update_deal_properties(
            deal.id,
            properties={"ib_typeform_ingevuld": "true"},
        )
        updated += 1

    logging.info(
        "Marked ib_typeform_ingevuld=true for %s IB deal(s) for contact %s year %s.",
        updated,
        contact_id,
        year,
    )
    return updated


def extract_contact_id(
    payload: dict[str, Any], form_response: dict[str, Any]
) -> str | None:
    definition = resolve_typeform_definition(payload, form_response)
    fields = definition.get("fields") or []
    answers = form_response.get("answers") or []
    answer_by_field_id = {
        answer.get("field", {}).get("id"): answer
        for answer in answers
        if answer.get("field", {}).get("id")
    }

    first_field_id = None
    if fields:
        first_field_id = fields[0].get("id")

    answer = answer_by_field_id.get(first_field_id) if first_field_id else None
    if answer is None and answers:
        answer = answers[0]

    value = answer_to_display_value(answer) if answer else None
    if value is None:
        return None

    normalized = str(value).strip()
    return normalized or None


def render_summary_document(
    payload: dict[str, Any],
    contact_id: str,
    uploaded_files: list[dict[str, str]] | None = None,
) -> bytes:
    form_response = payload["form_response"]
    submitted_at = form_response.get("submitted_at") or payload.get("submitted_at")
    submitted_display = submitted_at or datetime.now(UTC).isoformat()
    definition = resolve_typeform_definition(payload, form_response)
    field_titles = build_field_title_map(definition)
    title = definition.get("title") or payload.get("form_id") or "Typeform response"
    hidden = form_response.get("hidden") or {}
    answers = form_response.get("answers") or []
    uploaded_file_links = {
        item["field_id"]: {"name": item["name"], "url": item["web_url"]}
        for item in (uploaded_files or [])
        if item.get("field_id") and item.get("web_url")
    }
    answer_entries: list[dict[str, str]] = []
    for index, answer in enumerate(answers, start=1):
        rendered = format_answer_entry(answer, field_titles, index, uploaded_file_links)
        if rendered:
            answer_entries.append(rendered)

    if not answer_entries:
        answer_entries.append(
            {"question": "Antwoorden", "value": "Geen antwoorden ingevuld."}
        )

    hidden_entries = [
        (str(key), str(value))
        for key, value in sorted(hidden.items())
        if value not in (None, "")
    ]

    metadata = [
        ("Contact ID", contact_id),
        ("Response ID", str(form_response.get("token", "-"))),
        ("Ingediend op", submitted_display),
    ]
    return build_summary_pdf(title, metadata, answer_entries, hidden_entries)


def format_answer_entry(
    answer: dict[str, Any],
    field_titles: dict[str, str],
    question_index: int,
    uploaded_file_links: dict[str, dict[str, str]],
) -> dict[str, str] | None:
    value = answer_to_display_value(answer)
    if value in (None, "", []):
        return None

    field = answer.get("field") or {}
    field_id = field.get("id")
    field_id_str = str(field_id) if field_id is not None else ""
    title = (
        field_titles.get(field_id_str, "")
        or field.get("title")
        or f"Question {question_index}"
    )
    answer_type = answer.get("type")

    if answer_type == "choices" and isinstance(value, list):
        text = ", ".join(str(item) for item in value if item not in (None, ""))
    else:
        text = str(value)
    title = normalize_display_text(title)
    text = normalize_display_text(text)

    if not text.strip():
        return None

    if answer_type == "file_url":
        field_id = field.get("id")
        uploaded_file = uploaded_file_links.get(field_id or "")
        link_url = uploaded_file["url"] if uploaded_file else text
        link_label = uploaded_file["name"] if uploaded_file else text
        return {"question": title, "value": link_label, "url": link_url}
    return {"question": title, "value": text}


def build_summary_pdf(
    title: str,
    metadata: list[tuple[str, str]],
    answer_entries: list[dict[str, str]],
    hidden_entries: list[tuple[str, str]],
) -> bytes:
    page_width = 595
    page_height = 842
    left = 54
    right = 541
    top = 786
    bottom = 52
    content_width = right - left

    pages: list[list[str]] = [[]]
    annotations: list[list[dict[str, Any]]] = [[]]
    y = top

    def current_page() -> list[str]:
        return pages[-1]

    def current_annotations() -> list[dict[str, Any]]:
        return annotations[-1]

    def ensure_space(required_height: float) -> None:
        nonlocal y
        if y - required_height < bottom:
            pages.append([])
            annotations.append([])
            y = top

    def add_text_line(
        text: str,
        *,
        x: float,
        font: str,
        size: int,
        color: tuple[float, float, float] = (0.12, 0.16, 0.22),
        underline: bool = False,
        link: str | None = None,
    ) -> None:
        nonlocal y
        line_height = size + 6
        ensure_space(line_height)
        escaped = pdf_escape_text(text)
        current_page().append("BT")
        current_page().append(f"/{font} {size} Tf")
        current_page().append(f"{color[0]:.3f} {color[1]:.3f} {color[2]:.3f} rg")
        current_page().append(f"1 0 0 1 {x:.2f} {y:.2f} Tm")
        current_page().append(f"({escaped}) Tj")
        current_page().append("ET")

        text_width = estimate_text_width(text, size)
        if underline:
            underline_y = y - 2
            current_page().append(f"{color[0]:.3f} {color[1]:.3f} {color[2]:.3f} RG")
            current_page().append(
                f"{x:.2f} {underline_y:.2f} m {(x + text_width):.2f} {underline_y:.2f} l S"
            )
        if link:
            current_annotations().append(
                {
                    "rect": (x, y - 2, min(x + text_width, right), y + size + 2),
                    "url": link,
                }
            )
        y -= line_height

    def add_wrapped_block(
        text: str,
        *,
        x: float,
        font: str,
        size: int,
        color: tuple[float, float, float] = (0.12, 0.16, 0.22),
        max_width: float | None = None,
        indent: float = 0,
        underline: bool = False,
        link: str | None = None,
    ) -> None:
        width = max_width if max_width is not None else content_width
        lines = wrap_text_for_pdf(text, width - indent, size)
        for idx, line in enumerate(lines):
            add_text_line(
                line,
                x=x + (indent if idx > 0 else 0),
                font=font,
                size=size,
                color=color,
                underline=underline if idx == 0 else False,
                link=link if idx == 0 else None,
            )

    add_text_line(
        "INTERNE SAMENVATTING",
        x=left,
        font="F1",
        size=11,
        color=(0.60, 0.20, 0.07),
    )
    y -= 4
    add_wrapped_block(title, x=left, font="F2", size=22)
    y -= 4
    add_wrapped_block(
        "Overzicht van de ingevulde antwoorden uit Typeform, bedoeld voor intern gebruik.",
        x=left,
        font="F1",
        size=11,
        color=(0.33, 0.38, 0.45),
    )
    y -= 10

    for label, value in metadata:
        add_text_line(f"{label}:", x=left, font="F2", size=11, color=(0.33, 0.38, 0.45))
        y += 17
        add_wrapped_block(
            value, x=left + 88, font="F1", size=12, max_width=content_width - 88
        )
        y -= 2

    y -= 10
    add_text_line("Antwoorden", x=left, font="F2", size=16)
    y -= 2

    for entry in answer_entries:
        add_wrapped_block(entry["question"], x=left, font="F2", size=12)
        add_wrapped_block(
            entry["value"],
            x=left + 14,
            font="F1",
            size=11,
            color=(0.12, 0.16, 0.22) if "url" not in entry else (0.60, 0.20, 0.07),
            max_width=content_width - 14,
            underline="url" in entry,
            link=entry.get("url"),
        )
        y -= 8

    if hidden_entries:
        y -= 4
        add_text_line("Verborgen velden", x=left, font="F2", size=16)
        y -= 2
        for key, value in hidden_entries:
            add_text_line(
                f"{key}:", x=left, font="F2", size=11, color=(0.33, 0.38, 0.45)
            )
            y += 17
            add_wrapped_block(
                value, x=left + 88, font="F1", size=11, max_width=content_width - 88
            )
            y -= 2

    pdf = PDFBuilder()
    for index, commands in enumerate(pages):
        content_stream = "\n".join(commands).encode("cp1252", errors="replace")
        page_annotations = annotations[index]
        pdf.add_page(
            page_width=page_width,
            page_height=page_height,
            content_stream=content_stream,
            annotations=page_annotations,
        )
    return pdf.build()


def build_field_title_map(definition: dict[str, Any]) -> dict[str, str]:
    fields = definition.get("fields") or []
    title_map: dict[str, str] = {}
    collect_field_titles(fields, title_map)
    return title_map


def collect_field_titles(
    fields: list[dict[str, Any]],
    title_map: dict[str, str],
) -> None:
    for field in fields:
        field_id = field.get("id")
        title = field.get("title")
        if field_id and title:
            title_map[field_id] = title

        nested_fields = (field.get("properties") or {}).get("fields") or []
        if nested_fields:
            collect_field_titles(nested_fields, title_map)


def resolve_typeform_definition(
    payload: dict[str, Any],
    form_response: dict[str, Any],
) -> dict[str, Any]:
    payload_definition = payload.get("definition")
    if isinstance(payload_definition, dict) and payload_definition.get("fields"):
        return payload_definition

    response_definition = form_response.get("definition")
    if isinstance(response_definition, dict) and response_definition.get("fields"):
        return response_definition

    fetched_definition = fetch_typeform_definition(payload.get("form_id"))
    if fetched_definition:
        return fetched_definition

    return {}


def fetch_typeform_definition(form_id: str | None) -> dict[str, Any] | None:
    token = os.getenv("TYPEFORM_TOKEN")
    if not token or not form_id:
        return None

    url = f"{TYPEFORM_API_BASE_URL}/forms/{form_id}"
    try:
        _, response_body = http_request(
            "GET",
            url,
            headers={"Authorization": f"Bearer {token}"},
        )
    except RuntimeError as exc:
        logging.warning("Typeform definition fetch failed: %s", exc)
        return None

    try:
        definition = json.loads(response_body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        logging.warning("Typeform definition JSON decode failed: %s", exc)
        return None

    if definition.get("fields"):
        return definition
    return None


def wrap_text_for_pdf(text: str, max_width: float, font_size: int) -> list[str]:
    lines: list[str] = []
    for paragraph in str(text).splitlines() or [""]:
        words = paragraph.split()
        if not words:
            lines.append("")
            continue

        current = words[0]
        for word in words[1:]:
            candidate = f"{current} {word}"
            if estimate_text_width(candidate, font_size) <= max_width:
                current = candidate
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines


def estimate_text_width(text: str, font_size: int) -> float:
    return max(len(text), 1) * font_size * 0.52


def normalize_display_text(text: str) -> str:
    normalized = str(text)
    normalized = re.sub(r"\*\*(.*?)\*\*", r"\1", normalized)
    return re.sub(r"(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)", r"\1", normalized)


def pdf_escape_text(text: str) -> str:
    safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    return safe.encode("cp1252", errors="replace").decode("cp1252")


def pdf_escape_url(url: str) -> str:
    safe = url.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    return safe.encode("ascii", errors="ignore").decode("ascii")


class PDFBuilder:
    def __init__(self) -> None:
        self.objects: list[bytes] = []
        self.page_ids: list[int] = []

    def _add_object(self, data: bytes) -> int:
        self.objects.append(data)
        return len(self.objects)

    def add_page(
        self,
        *,
        page_width: int,
        page_height: int,
        content_stream: bytes,
        annotations: list[dict[str, Any]],
    ) -> None:
        content_id = self._add_object(
            f"<< /Length {len(content_stream)} >>\nstream\n".encode("ascii")
            + content_stream
            + b"\nendstream"
        )

        annotation_ids: list[int] = []
        for item in annotations:
            x1, y1, x2, y2 = item["rect"]
            escaped_url = pdf_escape_url(item["url"])
            annotation_id = self._add_object(
                (
                    f"<< /Type /Annot /Subtype /Link /Rect [{x1:.2f} {y1:.2f} {x2:.2f} {y2:.2f}] "
                    f"/Border [0 0 0] /A << /S /URI /URI ({escaped_url}) >> >>"
                ).encode("ascii")
            )
            annotation_ids.append(annotation_id)

        annotations_part = ""
        if annotation_ids:
            refs = " ".join(f"{obj_id} 0 R" for obj_id in annotation_ids)
            annotations_part = f"/Annots [{refs}] "

        page_id = self._add_object(
            (
                f"<< /Type /Page /Parent PAGES_ID 0 R /MediaBox [0 0 {page_width} {page_height}] "
                f"/Resources << /Font << /F1 FONT1_ID 0 R /F2 FONT2_ID 0 R >> >> "
                f"{annotations_part}/Contents {content_id} 0 R >>"
            ).encode("ascii")
        )
        self.page_ids.append(page_id)

    def build(self) -> bytes:
        font1_id = self._add_object(
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
        )
        font2_id = self._add_object(
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
        )
        pages_id = self._add_object(b"<< /Type /Pages /Kids [] /Count 0 >>")
        catalog_id = self._add_object(
            f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("ascii")
        )

        updated_objects = list(self.objects)
        page_refs = " ".join(f"{page_id} 0 R" for page_id in self.page_ids)
        updated_objects[pages_id - 1] = (
            f"<< /Type /Pages /Kids [{page_refs}] /Count {len(self.page_ids)} >>".encode(
                "ascii"
            )
        )

        for page_id in self.page_ids:
            page_bytes = updated_objects[page_id - 1]
            page_bytes = page_bytes.replace(b"PAGES_ID", str(pages_id).encode("ascii"))
            page_bytes = page_bytes.replace(b"FONT1_ID", str(font1_id).encode("ascii"))
            page_bytes = page_bytes.replace(b"FONT2_ID", str(font2_id).encode("ascii"))
            updated_objects[page_id - 1] = page_bytes

        pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for index, obj in enumerate(updated_objects, start=1):
            offsets.append(len(pdf))
            pdf.extend(f"{index} 0 obj\n".encode("ascii"))
            pdf.extend(obj)
            pdf.extend(b"\nendobj\n")

        xref_offset = len(pdf)
        pdf.extend(f"xref\n0 {len(updated_objects) + 1}\n".encode("ascii"))
        pdf.extend(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))

        pdf.extend(
            (
                f"trailer\n<< /Size {len(updated_objects) + 1} /Root {catalog_id} 0 R >>\n"
                f"startxref\n{xref_offset}\n%%EOF"
            ).encode("ascii")
        )
        return bytes(pdf)


def answer_to_display_value(answer: dict[str, Any] | None) -> Any:
    if not answer:
        return None

    answer_type = answer.get("type")
    if answer_type == "boolean":
        boolean_value = answer.get("boolean")
        if boolean_value is None:
            return None
        return "Ja" if boolean_value else "Nee"
    if answer_type == "choice":
        choice = answer.get("choice") or {}
        return choice.get("label")
    if answer_type == "choices":
        choices = answer.get("choices") or {}
        labels = choices.get("labels")
        if labels:
            return labels
        return choices.get("other")
    if answer_type == "number":
        return answer.get("number")
    if answer_type == "phone_number":
        return answer.get("phone_number")
    if answer_type == "email":
        return answer.get("email")
    if answer_type == "date":
        return answer.get("date")
    if answer_type == "file_url":
        return answer.get("file_url")
    if answer_type == "payment":
        payment = answer.get("payment") or {}
        if not payment:
            return None
        amount = payment.get("amount")
        currency = payment.get("currency")
        return f"{amount} {currency}".strip()
    if answer_type in ("text", "url"):
        return answer.get(answer_type)
    if isinstance(answer_type, str):
        return answer.get(answer_type)
    return None


def build_summary_filename(contact_folder_name: str) -> str:
    safe_contact_name = sanitize_filename(contact_folder_name)
    return f"IB Typeform 2025 - {safe_contact_name}.pdf"


def upload_typeform_files_to_sharepoint(
    payload: dict[str, Any],
    drive_id: str,
    parent_folder_id: str,
    graph_token: str,
) -> list[dict[str, str]]:
    form_response = payload["form_response"]
    answers = form_response.get("answers") or []
    form_id = payload.get("form_id")
    response_id = form_response.get("token")
    typeform_token = os.getenv("TYPEFORM_TOKEN")
    uploaded_items: list[dict[str, str]] = []

    for answer in answers:
        if answer.get("type") != "file_url":
            continue

        file_url = answer.get("file_url")
        field = answer.get("field") or {}
        field_id = field.get("id")
        if not file_url or not field_id:
            continue

        file_name = infer_filename_from_url(file_url)
        content = fetch_typeform_file(
            form_id=form_id,
            response_id=response_id,
            field_id=field_id,
            file_name=file_name,
            direct_url=file_url,
            token=typeform_token,
        )
        if content is None:
            warning = (
                f"Typeform file could not be downloaded for contact ID "
                f"{extract_contact_id(payload, form_response)} and file {file_name}."
            )
            sentry_sdk.capture_message(warning, level="warning")
            logging.warning(warning)
            continue

        safe_name = sanitize_filename(file_name)
        uploaded_item = upload_bytes_to_folder(
            drive_id,
            parent_folder_id,
            safe_name,
            content,
            "application/octet-stream",
            graph_token,
        )
        uploaded_items.append(
            {
                "field_id": field_id,
                "name": safe_name,
                "web_url": uploaded_item.get("webUrl", ""),
            }
        )

    return uploaded_items


def fetch_typeform_file(
    *,
    form_id: str | None,
    response_id: str | None,
    field_id: str,
    file_name: str,
    direct_url: str,
    token: str | None,
) -> bytes | None:
    if token and form_id and response_id:
        encoded_name = urllib.parse.quote(file_name, safe="")
        url = (
            f"{TYPEFORM_API_BASE_URL}/forms/{form_id}/responses/{response_id}"
            f"/fields/{field_id}/files/{encoded_name}"
        )
        try:
            _, content = http_request(
                "GET",
                url,
                headers={"Authorization": f"Bearer {token}"},
            )
            return content
        except RuntimeError as exc:
            logging.warning("Typeform API file download failed: %s", exc)

    try:
        _, content = http_request("GET", direct_url)
        return content
    except RuntimeError as exc:
        logging.warning("Direct file_url download failed: %s", exc)
        return None


def get_graph_access_token() -> str:
    tenant_id = require_env("SP_TENANT_ID")
    client_id = require_env("SP_CLIENT_ID")
    client_secret = require_env("SP_CLIENT_SECRET")

    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    form_data = urllib.parse.urlencode(
        {
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "https://graph.microsoft.com/.default",
        }
    ).encode("utf-8")

    _, response_body = http_request(
        "POST",
        token_url,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        body=form_data,
    )
    response_json = json.loads(response_body.decode("utf-8"))
    access_token = response_json.get("access_token")
    if not access_token:
        msg = "Access token was not returned by Azure AD."
        raise RuntimeError(msg)
    return access_token


def get_site(token: str, host: str, site_path: str) -> dict[str, Any]:
    normalized = site_path if site_path.startswith("/") else f"/{site_path}"
    return graph_json(
        "GET",
        f"/sites/{host}:{normalized}",
        token,
    )


def find_dossier_folder(
    drive_id: str,
    drive_root_id: str,
    contact_id: str,
    token: str,
) -> dict[str, Any] | None:
    dossier_search_key = get_dossier_search_key(contact_id)
    if not dossier_search_key:
        return None
    dossier_name = get_dossier_name(dossier_search_key)
    desired_folder_name = build_dossier_folder_name(dossier_search_key, dossier_name)
    matches = [
        item
        for item in search_dossier_folders(drive_id, dossier_search_key, token)
        if (item.get("parentReference") or {}).get("id") == drive_root_id
    ]
    if not matches:
        return None
    matches.sort(key=lambda item: item.get("name", "").lower())
    dossier_folder = matches[0]
    if dossier_folder.get("name") == desired_folder_name:
        return dossier_folder
    return rename_drive_item(
        drive_id,
        dossier_folder["id"],
        desired_folder_name,
        token,
    )


def get_dossier_search_key(contact_id: str) -> str | None:
    try:
        associations = hubspot_repository.get_object_to_dossier_associations(
            "contact",
            str(contact_id),
        )
    except Exception as exc:
        logging.warning(
            "HubSpot dossier lookup failed for contact %s: %s",
            contact_id,
            exc,
        )
        return None

    results = getattr(associations, "results", None) or []
    if not results:
        return None
    dossier_id = getattr(results[0], "to_object_id", None)
    if dossier_id is None:
        return None
    return str(dossier_id)


def get_dossier_name(dossier_id: str) -> str | None:
    try:
        dossier = hubspot_repository.get_dossier_object(
            dossier_id,
            properties=["dossier_naam"],
        )
    except Exception as exc:
        logging.warning(
            "HubSpot dossier fetch failed for dossier %s: %s", dossier_id, exc
        )
        return None

    properties = getattr(dossier, "properties", None) or {}
    dossier_name = str(properties.get("dossier_naam") or "").strip()
    return dossier_name or None


def build_dossier_folder_name(dossier_id: str, dossier_name: str | None) -> str:
    safe_name = sanitize_folder_name((dossier_name or "").strip() or dossier_id)
    return f"{safe_name}, {dossier_id}"


def search_dossier_folders(
    drive_id: str,
    dossier_search_key: str,
    token: str,
) -> list[dict[str, Any]]:
    dossier_pattern = re.compile(re.escape(dossier_search_key), re.IGNORECASE)
    return [
        item
        for item in search_drive_items(drive_id, dossier_search_key, token)
        if item.get("folder") is not None
        and dossier_pattern.search(item.get("name", ""))
    ]


def search_drive_items(
    drive_id: str,
    query: str,
    token: str,
) -> list[dict[str, Any]]:
    escaped_query = query.replace("'", "''")
    path: str | None = f"/drives/{drive_id}/root/search(q='{escaped_query}')"
    results: list[dict[str, Any]] = []

    while path:
        response = graph_json("GET", path, token, absolute_path=path.startswith("http"))
        results.extend(response.get("value") or [])
        path = response.get("@odata.nextLink")
    return results


def build_contact_folder_name(contact_name: str, contact_id: str) -> str:
    return f"{sanitize_folder_name(contact_name)}, {contact_id}"


def get_contact_display_name(contact_id: str) -> str:
    try:
        contact = hubspot_repository.get_contact_info(
            int(contact_id),
            properties=["firstname", "lastname"],
        )
    except Exception as exc:
        logging.warning(
            "HubSpot contact lookup failed for contact %s: %s",
            contact_id,
            exc,
        )
        return "Onbekende contactpersoon"

    properties = getattr(contact, "properties", None) or {}
    first_name = (properties.get("firstname") or "").strip()
    last_name = (properties.get("lastname") or "").strip()
    full_name = " ".join(part for part in (first_name, last_name) if part).strip()
    return full_name or "Onbekende contactpersoon"


def resolve_contact_folder(
    drive_id: str,
    dossier_folder_id: str,
    contact_name: str,
    desired_folder_name: str,
    token: str,
) -> dict[str, Any]:
    children = list_children(drive_id, dossier_folder_id, token)
    contact_id = desired_folder_name.rsplit(",", 1)[-1].strip()

    for item in children:
        if item.get("folder") is not None and item.get("name") == desired_folder_name:
            return item

    for item in children:
        if _folder_contains_record_id(item, contact_id):
            if item.get("name") == desired_folder_name:
                return item
            return rename_drive_item(
                drive_id,
                item["id"],
                desired_folder_name,
                token,
            )

    legacy_folder_name = sanitize_folder_name(contact_name)
    for item in children:
        if item.get("folder") is not None and item.get("name") == legacy_folder_name:
            return rename_drive_item(
                drive_id,
                item["id"],
                desired_folder_name,
                token,
            )

    return ensure_child_folder(
        drive_id,
        dossier_folder_id,
        desired_folder_name,
        token,
    )


def ensure_child_folder(
    drive_id: str,
    parent_folder_id: str,
    folder_name: str,
    token: str,
) -> dict[str, Any]:
    children = list_children(drive_id, parent_folder_id, token)
    for item in children:
        if _folder_name_matches(item, folder_name):
            return item

    try:
        return graph_json(
            "POST",
            f"/drives/{drive_id}/items/{parent_folder_id}/children",
            token,
            payload={
                "name": folder_name,
                "folder": {},
                "@microsoft.graph.conflictBehavior": "fail",
            },
        )
    except RuntimeError as exc:
        message = str(exc)
        if "failed with 409" not in message or "nameAlreadyExists" not in message:
            raise

        # Another request created the folder after our initial child lookup.
        children = list_children(drive_id, parent_folder_id, token)
        for item in children:
            if _folder_name_matches(item, folder_name):
                return item
        raise


def rename_drive_item(
    drive_id: str,
    item_id: str,
    new_name: str,
    token: str,
) -> dict[str, Any]:
    return graph_json(
        "PATCH",
        f"/drives/{drive_id}/items/{item_id}",
        token,
        payload={"name": new_name},
    )


def list_children(
    drive_id: str,
    item_id: str,
    token: str,
) -> list[dict[str, Any]]:
    response = graph_json(
        "GET",
        f"/drives/{drive_id}/items/{item_id}/children",
        token,
    )
    return response.get("value") or []


def _folder_name_matches(item: dict[str, Any], folder_name: str) -> bool:
    return (
        item.get("folder") is not None
        and str(item.get("name") or "").casefold() == folder_name.casefold()
    )


def _folder_contains_record_id(item: dict[str, Any], record_id: str) -> bool:
    if item.get("folder") is None or not record_id:
        return False

    name = str(item.get("name") or "")
    pattern = re.compile(rf"(?<!\d){re.escape(record_id)}(?!\d)")
    return bool(pattern.search(name))


def upload_bytes_to_folder(
    drive_id: str,
    parent_folder_id: str,
    file_name: str,
    content: bytes,
    content_type: str,
    token: str,
) -> dict[str, Any]:
    encoded_name = urllib.parse.quote(file_name, safe="")
    url = (
        f"{GRAPH_BASE_URL}/drives/{drive_id}/items/{parent_folder_id}:"
        f"/{encoded_name}:/content"
    )
    _, response_body = http_request(
        "PUT",
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": content_type,
        },
        body=content,
    )
    return json.loads(response_body.decode("utf-8"))


def graph_json(
    method: str,
    path: str,
    token: str,
    *,
    payload: dict[str, Any] | None = None,
    absolute_path: bool = False,
) -> dict[str, Any]:
    body = None
    headers = {"Authorization": f"Bearer {token}"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    _, response_body = http_request(
        method,
        path if absolute_path else f"{GRAPH_BASE_URL}{path}",
        headers=headers,
        body=body,
    )
    if not response_body:
        return {}
    return json.loads(response_body.decode("utf-8"))


def http_request(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
) -> tuple[int, bytes]:
    normalized_url = normalize_request_url(url)
    parsed_url = urllib.parse.urlparse(normalized_url)
    if parsed_url.scheme not in {"http", "https"}:
        msg = f"Unsupported URL scheme for request: {parsed_url.scheme!r}"
        raise ValueError(msg)

    request = urllib.request.Request(normalized_url, data=body, method=method)  # noqa: S310
    for key, value in (headers or {}).items():
        request.add_header(key, value)

    try:
        with urllib.request.urlopen(request) as response:  # noqa: S310
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        msg = f"{method} {normalized_url} failed with {exc.code}: {error_body}"
        raise RuntimeError(msg) from exc


def normalize_request_url(url: str) -> str:
    split = urllib.parse.urlsplit(url)
    path = urllib.parse.quote(
        urllib.parse.unquote(split.path),
        safe="/%:@-._~!$&'()*+,;=",
    )
    query = urllib.parse.quote(
        split.query,
        safe="=&%/:,+-_.~!$'()*;@",
    )
    fragment = urllib.parse.quote(
        split.fragment,
        safe="=&%/:,+-_.~!$'()*;@",
    )
    return urllib.parse.urlunsplit((split.scheme, split.netloc, path, query, fragment))


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        msg = f"Missing required environment variable: {name}"
        raise RuntimeError(msg)
    return value


def sanitize_filename(name: str) -> str:
    safe = re.sub(r"[<>:\"/\\\\|?*]+", "-", name.strip())
    safe = safe.strip(". ")
    return safe or "file"


def sanitize_folder_name(name: str) -> str:
    return sanitize_filename(name)


def infer_filename_from_url(url: str) -> str:
    path = urllib.parse.urlparse(url).path
    file_name = urllib.parse.unquote(path.rsplit("/", 1)[-1])
    return file_name or "typeform-upload"
