from __future__ import annotations

# Backward-compatible re-exports. All callers can continue to import from this module.
from app.service.operations.deal_creation import DUTCH_MONTHS
from app.service.operations.deal_creation import create_deal_with_retry
from app.service.operations.deal_creation import create_new_deal
from app.service.operations.deal_creation import handle_pipelines
from app.service.operations.deal_creation import process_btw_pipeline
from app.service.operations.deal_creation import process_monthly_pipeline
from app.service.operations.deal_creation import process_yearly_pipeline
from app.service.operations.deal_creation import update_deal_amount_in_new_pipeline
from app.service.operations.deal_updates import check_correct_stage
from app.service.operations.deal_updates import company_change
from app.service.operations.deal_updates import contact_change
from app.service.operations.deal_updates import move_btw_q_deal_volledige_service
from app.service.operations.deal_updates import update_doorlopende_machtiging_deal

__all__ = [
    "DUTCH_MONTHS",
    "check_correct_stage",
    "company_change",
    "contact_change",
    "create_deal_with_retry",
    "create_new_deal",
    "handle_pipelines",
    "move_btw_q_deal_volledige_service",
    "process_btw_pipeline",
    "process_monthly_pipeline",
    "process_yearly_pipeline",
    "update_deal_amount_in_new_pipeline",
    "update_doorlopende_machtiging_deal",
]
