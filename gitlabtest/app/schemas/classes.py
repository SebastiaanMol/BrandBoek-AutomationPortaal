from typing import Any
from typing import Literal

from pydantic import BaseModel
from pydantic import Field
from pydantic import model_validator


class UpdateDossierModel(BaseModel):
    structuur: str | None


class VATDeal(BaseModel):
    deal_id: int
    pipeline_label: str


class NewDeal(BaseModel):
    deal_id: int


class IBDealContactPayload(BaseModel):
    deal_id: int
    contact_id: int


class ContactIdPayload(BaseModel):
    contact_id: int

    @model_validator(mode="before")
    @classmethod
    def _normalize(cls, data: Any) -> Any:
        # HubSpot workflows may send the record id under different keys.
        if isinstance(data, dict) and "contact_id" not in data:
            if "record_id" in data:
                data["contact_id"] = data["record_id"]
            elif "objectId" in data:
                data["contact_id"] = data["objectId"]
        return data


class NewPipeline(BaseModel):
    deal_id: int
    pipeline_label: str
    line_item_label: str
    year: str
    quarter: str | None = None


class ContactUpdateDealName(BaseModel):
    contact_id: int


class CompanyUpdateDealName(BaseModel):
    company_id: int


class TrustooLead(BaseModel):
    lead_source: str | None = None
    created: str | None = None
    matched: str | None = None
    request_type: str | None = None
    subject: str | None = None
    details: str | None = None
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    place_name: str | None = None
    postal_code: str | None = None
    street_name: str | None = None
    house_number: str | None = None
    business_name: str | None = None
    questions_answers_text: str | None = None


class OfferteLead(BaseModel):
    id: str | None = None
    name: str | None = None
    companyname: str | None = None
    email: str | None = None
    phone: str | None = None
    description: str | None = None
    street: str | None = None
    housenumber: str | None = None
    postcode: str | None = None
    city: str | None = None
    city_group: str | None = None
    city_group_id: int | None = None
    region: str | None = None
    region_id: int | None = None
    country: dict[str, str | None] | None = None
    product: dict[str, Any] | None = None
    questions: dict[str, str | None] | None = None
    questions_unmapped: dict[str, str | None] | None = None
    date: str | None = None
    notes: str | None = None


class LigoLead(BaseModel):
    raw_email_data: str


class Location(BaseModel):
    lat: str | None = None
    lng: str | None = None


class Product(BaseModel):
    id: int | None = None
    title: str | None = None


class AdditionalData(BaseModel):
    question: str | None = None
    answer: str | None = None


class CreatedAt(BaseModel):
    date: str | None = None
    timezone_type: int | None = None
    timezone: str | None = None


class SolvariLead(BaseModel):
    id: int | None = None
    gender: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    street: str | None = None
    house_nr: str | None = None
    zip_code: str | None = None
    city: str | None = None
    location: Location | None = None
    country: str | None = None
    locale_code: str | None = None
    phone: str | None = None
    email: str | None = None
    spoken_by_solvari: bool | None = None
    message_by_solvari: str | None = None
    competitors: int | None = None
    description: str | None = None
    created_at: CreatedAt | None = None
    products: list[Product] | None = None
    additional_data: list[AdditionalData] | None = None
    secret: str | None = None
    campaign_id: int | None = None
    campaign_name: str | None = None
    customer_id: int | None = None
    customer_name: str | None = None


class CalendlyQuestionAnswer(BaseModel):
    question: str | None = None
    answer: str | None = None
    position: int | None = None


class CalendlyEventMembership(BaseModel):
    user: str | None = None
    user_email: str | None = None
    user_name: str | None = None


class CalendlyEventDetails(BaseModel):
    created_at: str | None = None
    event_memberships: list[CalendlyEventMembership] | None = None
    name: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    location: dict[str, Any] | None = None
    uri: str | None = None


class CalendlyTracking(BaseModel):
    salesforce_uuid: str | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None
    utm_content: str | None = None
    utm_term: str | None = None


class CalendlyPayload(BaseModel):
    event: str | None = None
    uri: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    name: str | None = None
    text_reminder_number: str | None = None
    timezone: str | None = None
    questions_and_answers: list[CalendlyQuestionAnswer] | None = None
    scheduled_event: CalendlyEventDetails | None = None
    tracking: CalendlyTracking | None = None


class CalendlyLead(BaseModel):
    created_at: str | None = None
    created_by: str | None = None
    event: str | None = None
    payload: CalendlyPayload | None = None


class TypeformField(BaseModel):
    id: str | None = None
    title: str | None = None
    type: str | None = None
    ref: str | None = None


class TypeformAnswer(BaseModel):
    field: TypeformField | None = None
    type: str | None = None
    text: str | None = None
    email: str | None = None
    phone_number: str | None = None
    number: float | None = None
    boolean: bool | None = None
    choice: dict[str, Any] | None = None
    choices: dict[str, Any] | None = None
    date: str | None = None
    url: str | None = None
    file_url: str | None = None


class TypeformHiddenFields(BaseModel):
    gclid: str | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None
    utm_term: str | None = None
    utm_content: str | None = None
    hubspot_utk: str | None = None


class TypeformDefinition(BaseModel):
    id: str | None = None
    title: str | None = None
    fields: list[TypeformField] | None = None


class TypeformFormResponse(BaseModel):
    form_id: str | None = None
    token: str | None = None
    submitted_at: str | None = None
    definition: TypeformDefinition | None = None
    answers: list[TypeformAnswer] | None = None
    hidden: TypeformHiddenFields | None = None


class TypeformWebhook(BaseModel):
    event_id: str | None = None
    event_type: str | None = None
    form_response: TypeformFormResponse | None = None


class Administration(BaseModel):
    company_id: str
    company_name: str
    reference_id: str
    bank_connection_status: str


class KeywordRequest(BaseModel):
    keywords: list[str]


class DossierUpdateRequest(BaseModel):
    dossier_id: str | int
    target_property: str
    target_property_value: str | int

    @model_validator(mode="before")
    @classmethod
    def _coerce_to_str(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "dossier_id" in data:
                data["dossier_id"] = str(data["dossier_id"])
            if "target_property_value" in data:
                data["target_property_value"] = str(data["target_property_value"])
        return data


class CompanyAssociationRequest(BaseModel):
    company_id: str | int
    dossier_id: str | int
    target_property: str

    @model_validator(mode="before")
    @classmethod
    def _coerce_to_str(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "company_id" in data:
                data["company_id"] = str(data["company_id"])
            if "dossier_id" in data:
                data["dossier_id"] = str(data["dossier_id"])
        return data


class DealAssociationRequest(BaseModel):
    deal_id: str | int
    company_id: str | int
    target_property: str

    @model_validator(mode="before")
    @classmethod
    def _coerce_to_str(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "company_id" in data:
                data["company_id"] = str(data["company_id"])
            if "deal_id" in data:
                data["deal_id"] = str(data["deal_id"])
        return data


class AssignStageRequest(BaseModel):
    deal_id: str | int
    pipeline_id: str | int
    year: str | int | None = None
    company_id: str | int | None = None
    contact_id: str | int | None = None
    quarter: str | int | None = None

    @model_validator(mode="before")
    @classmethod
    def _coerce_to_str(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # normalize required fields to str
            if "deal_id" in data:
                data["deal_id"] = str(data["deal_id"])
            if "pipeline_id" in data:
                data["pipeline_id"] = str(data["pipeline_id"])
            # normalize optional year/quarter if provided
            if data.get("year") is not None:
                data["year"] = str(data["year"])
            if data.get("quarter") is not None:
                data["quarter"] = str(data["quarter"])
        return data


class NextQuarterPrev2MUpdate(BaseModel):
    company_id: int
    pipeline_id: int
    year: int
    quarter: str
    value: str


class ClockifyCompanyUpsert(BaseModel):
    record_id: int
    company_name: str


class WefactDebtorUpsert(BaseModel):
    record_id: int  # HubSpot company record id
    company_name: str
    contact_name: str | None = None
    email: str | None = None
    wefact_id: str | int | None = None  # optional Wefact debtor ID/code
    company_number: str | int | None = None
    tax_number: str | int | None = None
    initials: str | None = None
    surname: str | None = None
    address: str | None = None
    zip_code: str | int | None = None
    city: str | None = None
    country: str | None = None
    phone_number: str | None = None


class UpdateIntensiteitModel(BaseModel):
    deal_id: int
    company_id: int


class MigrateDealsRequest(BaseModel):
    source_pipeline_id: str = Field(..., description="Source pipeline ID")
    dest_pipeline_id: str = Field(..., description="Destination pipeline ID")
    stage_labels_to_include: list[str] = Field(
        ..., description="Stage labels to migrate (must exist in both pipelines)"
    )
    mode: Literal["move", "copy"] = "move"
    dry_run: bool = True


class CompanyGeboekteKwartalenPayload(BaseModel):
    company_id: int
    year: int
    # HubSpot sends checkbox values as a semicolon-separated string or a list of strings
    geboekte_kwartalen: str | list[str] | None = None


class UpdateYearPayload(BaseModel):
    create_date: int
    deal_id: int


class ClockifyEntryPayload(BaseModel):
    company_name: str


class CompanyBankkoppelingPayload(BaseModel):
    company_id: int
