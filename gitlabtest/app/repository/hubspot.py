from __future__ import annotations

import logging
from typing import Any

import requests
import sentry_sdk

logger = logging.getLogger(__name__)
from hubspot.crm.associations.v4.models import (
    BatchInputPublicFetchAssociationsBatchRequest,
)
from hubspot.crm.associations.v4.models import PublicFetchAssociationsBatchRequest
from hubspot.crm.companies import ApiException
from hubspot.crm.companies import (
    BatchReadInputSimplePublicObjectId as CompaniesBatchReadInput,
)
from hubspot.crm.companies import SimplePublicObjectId as CompanySimplePublicObjectId
from hubspot.crm.contacts import (
    BatchReadInputSimplePublicObjectId as ContactsBatchReadInput,
)
from hubspot.crm.contacts import SimplePublicObjectId as ContactSimplePublicObjectId
from hubspot.crm.deals import BatchReadInputSimplePublicObjectId as DealsBatchReadInput
from hubspot.crm.deals import Filter
from hubspot.crm.deals import FilterGroup
from hubspot.crm.deals import PublicObjectSearchRequest
from hubspot.crm.deals import SimplePublicObjectInput
from hubspot.crm.line_items import BatchReadInputSimplePublicObjectId
from hubspot.crm.owners.exceptions import NotFoundException

from app.constants import DOSSIER_OBJECT_TYPE
from app.exceptions import HubSpotAPIError
from app.exceptions import HubSpotNotFoundError
from app.hubspot_client import client
from app.schemas.classes import UpdateDossierModel
from app.service.operations.constants import SALES_PIPELINE_ID


def get_all_pipelines() -> Any:
    """Retrieve all deal pipelines from HubSpot.

    Returns:
        Any: API response containing all deal pipelines.
    """
    api_response = client.crm.pipelines.pipelines_api.get_all(object_type="deals")

    if api_response is None:
        logger.error("No pipelines found: error")

    return api_response


def get_object_to_dossier_associations(object_type: str, object_id: str) -> Any:
    """Fetch all dossier associations for a given HubSpot object.

    Args:
        object_type (str): The source object type (e.g. 'contact', 'company', 'deal').
        object_id (str): The ID of the source object.

    Returns:
        Any: Paginated list of associated dossier records.
    """

    try:
        return client.crm.associations.v4.basic_api.get_page(
            object_type=object_type,
            object_id=object_id,
            to_object_type=DOSSIER_OBJECT_TYPE,
            limit=100,
        )
    except Exception as e:
        sentry_sdk.capture_exception(e)
        raise HubSpotAPIError(str(e)) from e


def _get_associated_id(deal_id: int, to_object_type: str) -> int:
    api_response = client.crm.associations.v4.basic_api.get_page(
        object_type="deal", object_id=deal_id, to_object_type=to_object_type
    )
    if not api_response or not api_response.results:
        msg = f"No {to_object_type} found for deal id: {deal_id}"
        raise HubSpotNotFoundError(msg)
    return api_response.results[0].to_object_id


def get_contact_id(deal_id: int) -> int:
    """Get the primary contact ID associated with a deal."""
    return _get_associated_id(deal_id, "contact")


def get_company_id(deal_id: int) -> int:
    """Get the primary company ID associated with a deal."""
    return _get_associated_id(deal_id, "company")


def get_deal_info(deal_id: int, properties: list[str] | None = None) -> Any:
    """Fetch deal details from HubSpot by deal ID.

    Args:
        deal_id (int): The HubSpot deal ID.
        properties (list, optional): Properties to retrieve. Defaults to
            ["hubspot_owner_id", "dealname", "closedate", "amount", "pipeline"].

    Returns:
        list: The deal object with requested properties.
    """
    if properties is None:
        properties = ["hubspot_owner_id", "dealname", "closedate", "amount", "pipeline"]

    return client.crm.deals.basic_api.get_by_id(
        deal_id=deal_id, properties=properties, archived=False
    )


def get_company_info(company_id: int, properties: list[str] | None = None) -> Any:
    """Fetch company details from HubSpot by company ID.

    Args:
        company_id (int): The HubSpot company ID.
        properties (list, optional): Properties to retrieve. Defaults to None (all default props).

    Returns:
        Any: The company object with requested properties.
    """

    return client.crm.companies.basic_api.get_by_id(
        company_id=company_id, properties=properties, archived=False
    )


def get_contact_info(contact_id: int, properties: list[str] | None = None) -> Any:
    """Fetch contact details from HubSpot by contact ID.

    Args:
        contact_id (int): The HubSpot contact ID.
        properties (list, optional): Properties to retrieve. Defaults to
            ["hubspot_owner_id", "firstname", "lastname"].

    Returns:
        Any: The contact object with requested properties.
    """

    if properties is None:
        properties = ["hubspot_owner_id", "firstname", "lastname"]

    return client.crm.contacts.basic_api.get_by_id(
        contact_id=contact_id, properties=properties, archived=False
    )


def get_contact_info_with_history(
    contact_id: int,
    properties: list[str] | None = None,
    properties_with_history: list[str] | None = None,
) -> Any:
    """Fetch contact details including property change history from HubSpot.

    Args:
        contact_id (int): The HubSpot contact ID.
        properties (list, optional): Current property values to retrieve.
        properties_with_history (list, optional): Properties for which to include
            the full change history.

    Returns:
        Any: Contact object with `properties_with_history` populated when available.
    """
    if properties is None:
        properties = []
    if properties_with_history is None:
        properties_with_history = []

    return client.crm.contacts.basic_api.get_by_id(
        contact_id=contact_id,
        properties=properties,
        properties_with_history=properties_with_history,
        archived=False,
    )


def batch_get_contacts_info(contact_ids: list[str], properties: list[str]) -> list[Any]:
    """Batch fetch contact records."""
    if not contact_ids:
        return []
    inputs = [ContactSimplePublicObjectId(id=str(cid)) for cid in contact_ids]
    req = ContactsBatchReadInput(
        properties_with_history=[],
        inputs=inputs,
        properties=properties,
    )
    response = client.crm.contacts.batch_api.read(
        batch_read_input_simple_public_object_id=req, archived=False
    )
    return getattr(response, "results", []) or []


def batch_get_companies_info(
    company_ids: list[str], properties: list[str]
) -> list[Any]:
    """Batch fetch company records."""
    if not company_ids:
        return []
    inputs = [CompanySimplePublicObjectId(id=str(cid)) for cid in company_ids]
    req = CompaniesBatchReadInput(
        properties_with_history=[],
        inputs=inputs,
        properties=properties,
    )
    response = client.crm.companies.batch_api.read(
        batch_read_input_simple_public_object_id=req, archived=False
    )
    return getattr(response, "results", []) or []


def get_owner_by_id(owner_id: int) -> Any:
    """Fetch owner (user) details from HubSpot by owner ID.

    Args:
        owner_id (int): The HubSpot owner ID.

    Returns:
        Any: The owner object with name, email, and other details.
    """

    return client.crm.owners.owners_api.get_by_id(
        owner_id=owner_id, id_property="id", archived=False
    )


def get_active_owners() -> list[Any]:
    """Fetch all active HubSpot owners."""
    owners: list[Any] = []
    after: str | None = None

    while True:
        response = client.crm.owners.owners_api.get_page(
            limit=500,
            after=after,
            archived=False,
        )
        owners.extend(getattr(response, "results", []) or [])

        paging = getattr(response, "paging", None)
        next_page = getattr(paging, "next", None) if paging else None
        after = getattr(next_page, "after", None) if next_page else None
        if not after:
            break

    return owners


def get_line_items(deal_id: int) -> Any:
    """Get all line item associations for a deal.

    Args:
        deal_id (int): The HubSpot deal ID.

    Returns:
        Any: Paginated list of associated line item IDs.

    Raises:
        HubSpotNotFoundError: If no line items are found for the deal.
    """

    api_response = client.crm.associations.v4.basic_api.get_page(
        object_type="deal", object_id=deal_id, to_object_type="line_item", limit=500
    )

    if not api_response or not api_response.results:
        logger.error(f"No line items found for deal id: {deal_id}")
        msg = f"No line items found for deal id: {deal_id}"
        raise HubSpotNotFoundError(msg)

    return api_response


def get_line_items_by_id(object_ids: list[Any]) -> Any:
    """Batch-fetch line item details by their IDs.

    Args:
        object_ids (list): List of line item IDs to retrieve.

    Returns:
        Any: Batch response containing line item objects with properties.
    """

    # Retrieves data from object ids
    batch_read_input_simple_public_object_id = BatchReadInputSimplePublicObjectId(
        properties_with_history=[], inputs=object_ids, properties=[]
    )
    return client.crm.line_items.batch_api.read(
        batch_read_input_simple_public_object_id=batch_read_input_simple_public_object_id,
        archived=True,
    )


def delete_deal(deal_id: str) -> None:
    """MAKES CALL TO HUBSPOT API
    Deletes deal in Hubspot

    Args:
        deal_id (str): deal id from hubspot

    Returns:
        deleting deal in Hubspot
    """

    return client.crm.deals.basic_api.archive(deal_id=deal_id)


def update_company_properties(company_id: int, properties: dict[str, Any]) -> Any:
    """MAKES CALL TO HUBSPOT API
    Updates one or more properties of a company in HubSpot.

    Args:
        company_id (int): The ID of the deal to update.
        properties (Dict[str, Any]): Dictionary of property names and values to update.

    Returns:
        Any: Response from the HubSpot API.
    """
    simple_public_object_input = SimplePublicObjectInput(properties=properties)
    return client.crm.companies.basic_api.update(
        company_id=str(company_id),
        simple_public_object_input=simple_public_object_input,
    )


def update_dossier(hs_dossier_id: str, model: UpdateDossierModel) -> dict[str, Any]:
    """MAKES CALL TO HUBSPOT API
    Updates dossier in Hubspot

    Args:

        hs_dossier_id (str): dossier id from hubspot
        model (UpdateDossierModel): model with the properties to update

    Returns:
        Any: updated dossier object
    """

    input = SimplePublicObjectInput(properties={"structuur": model.structuur})
    try:
        updated_dossier = client.crm.objects.basic_api.update(
            object_type=DOSSIER_OBJECT_TYPE,
            simple_public_object_input=input,
            object_id=hs_dossier_id,
        )
        return updated_dossier.to_dict()
    except Exception as e:
        sentry_sdk.capture_exception(e)
        raise HubSpotAPIError(str(e)) from e


def update_deal_properties(deal_id: int, properties: dict[str, Any]) -> Any:
    """MAKES CALL TO HUBSPOT API
    Updates one or more properties of a deal in HubSpot.

    Args:
        deal_id (int): The ID of the deal to update.
        properties (Dict[str, Any]): Dictionary of property names and values to update.

    Returns:
        Any: Response from the HubSpot API.
    """
    simple_public_object_input = SimplePublicObjectInput(properties=properties)
    return client.crm.deals.basic_api.update(
        deal_id=str(deal_id), simple_public_object_input=simple_public_object_input
    )


def update_bank_connection_status(hs_company_id: str, status: str) -> Any:
    """MAKES CALL TO HUBSPOT API
    Changes bank connection status in Hubspot

    Args:

        hs_company_id (str): company id from hubspot
        status (str): status to update

    Returns:
        Any: response from Hubspot API
    """

    # TODO Update property according to hubspot bankkoppeling status property
    properties = {"bankkoppeling_status": f"{status}"}

    simple_public_object_input = SimplePublicObjectInput(properties=properties)

    return client.crm.companies.basic_api.update(
        company_id=str(hs_company_id),
        simple_public_object_input=simple_public_object_input,
    )


def get_company_dossier(hs_company_id: str) -> Any:
    """MAKES CALL TO HUBSPOT API
    Get the associated dossiers of a company

    Args:

        hs_company_id (str): company id from hubspot

    Returns:
        Any: list with all the associated dossiers
    """

    try:
        return client.crm.associations.v4.basic_api.get_page(
            object_type="company",
            object_id=hs_company_id,
            to_object_type="dossiers",
            limit=100,
        )
    except Exception as e:
        sentry_sdk.capture_exception(e)
        raise HubSpotAPIError(str(e)) from e


def get_dossier_object(hs_dossier_id: str, properties: list[str] | None = None) -> Any:
    """MAKES CALL TO HUBSPOT API
    Get dossier by id, returning the raw HubSpot object (not converted to dict).

    Args:
        hs_dossier_id (str): dossier id from hubspot
        properties (list, optional): list of properties to retrieve. Defaults to [].

    Returns:
        Any: raw dossier object with .properties attribute
    """

    if properties is None:
        properties = []
    try:
        return client.crm.objects.basic_api.get_by_id(
            object_type=DOSSIER_OBJECT_TYPE,
            object_id=hs_dossier_id,
            properties=properties,
        )
    except Exception as e:
        sentry_sdk.capture_exception(e)
        raise HubSpotAPIError(str(e)) from e


def get_dossier(
    hs_dossier_id: str, properties: list[str] | None = None
) -> dict[str, Any]:
    """MAKES CALL TO HUBSPOT API
    Get dossier by id

    Args:

        hs_dossier_id (str): dossier id from hubspot
        properties (list, optional): list of properties to retrieve. Defaults to [].

    Returns:
        Any: dossier object
    """

    if properties is None:
        properties = []
    try:
        dossier = client.crm.objects.basic_api.get_by_id(
            object_type="dossiers", object_id=hs_dossier_id, properties=properties
        )
        return dossier.to_dict()
    except Exception as e:
        sentry_sdk.capture_exception(e)
        raise HubSpotAPIError(str(e)) from e


def get_company_sales_pipeline_deal(hs_company_id: str) -> Any:
    """MAKES CALL TO HUBSPOT API
    Get the associated deals of a company in the sales pipeline

    Args:

        hs_company_id (str): company id from hubspot

    Returns:
        Any: list with all the associated deals
    """

    try:
        search_request = PublicObjectSearchRequest(
            limit=100,
            after=0,
            sorts=[],
            properties=[],
            filter_groups=[
                {
                    "filters": [
                        {
                            "value": hs_company_id,
                            "propertyName": "associations.company",
                            "operator": "EQ",
                        },
                        {
                            "value": SALES_PIPELINE_ID,
                            "propertyName": "pipeline",
                            "operator": "EQ",
                        },
                    ]
                }
            ],
        )
        return client.crm.deals.search_api.do_search(
            public_object_search_request=search_request
        )
    except Exception as e:
        sentry_sdk.capture_exception(e)
        raise HubSpotAPIError(str(e)) from e


def get_deal_notes(hs_deal_id: int) -> Any:
    """MAKES CALL TO HUBSPOT API
    Get the associated notes of a deal

    Args:

        hs_deal_id (int): deal id from hubspot

    Returns:
        Any: list with all the associated notes
    """

    return client.crm.associations.v4.basic_api.get_page(
        object_type="deal", object_id=hs_deal_id, to_object_type="notes", limit=100
    )


def get_note_info(hs_note_id: int) -> Any:
    """MAKES CALL TO HUBSPOT API
    Get note info by id

    Args:

        hs_note_id (int): note id from hubspot

    Returns:
        Any: note object
    """

    return client.crm.objects.notes.basic_api.get_by_id(
        note_id=hs_note_id, properties=["hs_note_body"]
    )


def create_deal(simple_public_object_input_for_create: Any) -> Any:
    """MAKES CALL TO HUBSPOT API
    Create a new deal in HubSpot.

    Args:

        simple_public_object_input_for_create (SimplePublicObjectInput): The deal data to create.

    Returns:
        Any: The response from the HubSpot API.
    """

    return client.crm.deals.basic_api.create(
        simple_public_object_input_for_create=simple_public_object_input_for_create
    )


def batch_create_deals_sync(deal_inputs: list[Any]) -> Any:
    """
    deal_inputs: list[dict] each like {"properties": {...}, "associations": [...] (optional)}
    """
    batch = BatchReadInputSimplePublicObjectId(inputs=deal_inputs)
    return client.crm.deals.batch_api.create(batch)


def batch_update_deals_sync(deal_inputs: list[Any]) -> Any:
    """
    deal_inputs: list[dict] each like {"id": "...", "properties": {...}}
    """
    batch = DealsBatchReadInput(inputs=deal_inputs)
    return client.crm.deals.batch_api.update(batch)


def batch_update_deals(batch_payload: Any) -> Any:
    return client.crm.deals.batch_api.update(batch_payload)


def get_pipeline_by_id(pipeline_id: str) -> Any:
    """MAKES CALL TO HUBSPOT API
    Fetches a specific pipeline by its ID.

    Args:

        pipeline_id (str): The ID of the pipeline to fetch.

    Returns:
        Any: The pipeline object containing details about the pipeline.
    """

    try:
        return client.crm.pipelines.pipelines_api.get_by_id(
            object_type="deals", pipeline_id=pipeline_id
        )
    except Exception as e:
        sentry_sdk.capture_exception(e)
        raise HubSpotAPIError(str(e)) from e


def get_deals_for_company(company_id: str) -> list[str]:
    """Fetches all deal IDs associated with a given company."""
    return get_associated_objects("company", company_id, "deal")


def get_deals_for_contact(contact_id: str) -> list[str]:
    """Fetches all deal IDs associated with a given contact."""
    return get_associated_objects("contact", contact_id, "deal")


def get_associated_objects(
    from_object_type: str, from_object_id: str, to_object_type: str
) -> list[str]:
    """MAKES CALL TO HUBSPOT API
    Fetches all associated objects of a given type for a specific object.

    Args:
        from_object_type (str): The type of the source object (e.g., 'contact', 'company', 'deal').
        from_object_id (str): The ID of the source object.
        to_object_type (str): The type of the target associated object (e.g., 'deal', 'company').

    Returns:
        list: A list of associated object IDs.
    """

    try:
        response = client.crm.associations.v4.basic_api.get_page(
            object_type=from_object_type,
            object_id=from_object_id,
            to_object_type=to_object_type,
            limit=100,
        )
        return [r.to_object_id for r in response.results]
    except ApiException as e:
        sentry_sdk.capture_exception(e)
        logger.exception(
            f"Exception when getting {to_object_type} for {from_object_type} {from_object_id}: {e}"
        )
        return []


def get_owner_id(hubspot_owner_id: int) -> int | None:
    """MAKES CALL TO HUBSPOT API
    Gets owner id from hubspot by owner id

    Args:

        hubspot_owner_id (int): owner id from hubspot

    Returns:
        int: owner id from hubspot
    """

    try:
        owner = client.crm.owners.owners_api.get_by_id(
            owner_id=hubspot_owner_id, id_property="id", archived=False
        )
        return owner.id
    except NotFoundException as e:
        sentry_sdk.capture_exception(e)
        logger.exception("Owner not found: error")
        return None


def search_object(public_object_search_request: PublicObjectSearchRequest) -> Any:
    """MAKES A CALL TO HUBSPOT API
    Searches for objects in HubSpot using the provided search request.

    Args:
        public_object_search_request (PublicObjectSearchRequest): The search request containing filters and properties.

    Returns:
        Any: The API response containing the search results.
    """

    return client.crm.deals.search_api.do_search(
        public_object_search_request=public_object_search_request
    )


def update_deal(
    deal_id: int, simple_public_object_input: SimplePublicObjectInput
) -> Any:
    """MAKES A CALL TO HUBSPOT API
    Updates a deal in HubSpot with the given input.

    Args:
        deal_id (int): The ID of the deal to update.
        simple_public_object_input (SimplePublicObjectInput): The input data for updating the deal.

    Returns:
        The updated deal object.
    """
    try:
        return client.crm.deals.basic_api.update(
            deal_id=deal_id, simple_public_object_input=simple_public_object_input
        )
    except ApiException as e:
        sentry_sdk.capture_exception(e)
        logger.exception(f"Exception when updating deal: {e}")
        msg = f"Error updating deal: {e}"
        raise HubSpotAPIError(msg) from e


def update_contact(contact_id: str, properties: dict[str, Any]) -> None:
    """Update a contact's properties in HubSpot.

    Args:
        contact_id (str): The ID of the contact to update.
        properties (Dict[str, Any]): A dictionary of properties to update.

    Raises:
        ContactApiException: If the update fails.
    """
    try:
        simple_public_object_input = SimplePublicObjectInput(properties=properties)
        client.crm.contacts.basic_api.update(
            contact_id=contact_id, simple_public_object_input=simple_public_object_input
        )
    except ApiException as e:
        sentry_sdk.capture_exception(e)
        logger.exception(f"Failed to update contact {contact_id}: {e}")
        raise


def get_property(object_type: str, property_name: str) -> dict[str, Any]:
    """MAKES A CALL TO HUBSPOT API
    Retrieves a specific property for a given object type.

    Args:
        object_type (str): The type of the object (e.g., 'deal', 'contact').
        property_name (str): The name of the property to retrieve.

    Returns:
        Any: The property object containing details about the property.
    """
    try:
        response = client.crm.properties.core_api.get_by_name(
            object_type=object_type, property_name=property_name
        )
        return response.to_dict()
    except ApiException as e:
        sentry_sdk.capture_exception(e)
        logger.exception(
            f"Exception when getting property {property_name} for {object_type}: {e}"
        )
        msg = f"Error retrieving property: {e}"
        raise HubSpotAPIError(msg) from e


def get_companies_for_contact(contact_id: str) -> list[str]:
    """MAKES A CALL TO HUBSPOT API
    Fetches all companies associated with a given contact ID.

    Args:
        contact_id (str): The ID of the contact.

    Returns:
        list: A list of associated company IDs.
    """
    try:
        response = client.crm.associations.v4.basic_api.get_page(
            object_type="contact",
            object_id=contact_id,
            to_object_type="company",
            limit=100,
        )
        return [r.to_object_id for r in response.results]
    except ApiException as e:
        sentry_sdk.capture_exception(e)
        logger.exception(
            f"Exception when getting companies for contact {contact_id}: {e}"
        )
        return []


def batch_get_associations(
    from_type: str, to_type: str, ids: list[str]
) -> dict[str, list[str]]:
    """Batch fetch associations between two HubSpot object types.

    Returns a mapping of {from_id: [to_id, ...]} for each id in `ids`.
    """
    if not ids:
        return {}

    inputs = [PublicFetchAssociationsBatchRequest(id=str(i)) for i in ids]
    req = BatchInputPublicFetchAssociationsBatchRequest(inputs=inputs)
    response = client.crm.associations.v4.batch_api.get_page(
        from_object_type=from_type,
        to_object_type=to_type,
        batch_input_public_fetch_associations_batch_request=req,
    )

    mapping: dict[str, list[str]] = {str(i): [] for i in ids}
    for item in getattr(response, "results", None) or []:
        from_obj = getattr(item, "_from", None)
        from_id = getattr(from_obj, "id", None) if from_obj else None
        if not from_id:
            continue
        mapping[str(from_id)] = [
            str(assoc.to_object_id)
            for assoc in (getattr(item, "to", None) or [])
            if getattr(assoc, "to_object_id", None)
        ]
    return mapping


def batch_get_companies_for_contacts(contact_ids: list[str]) -> dict[str, list[str]]:
    """Batch fetch company associations for multiple contacts."""
    return batch_get_associations("contact", "company", contact_ids)


def batch_get_contacts_for_companies(company_ids: list[str]) -> dict[str, list[str]]:
    """Batch fetch contact associations for multiple companies."""
    return batch_get_associations("company", "contact", company_ids)


def batch_get_contacts_for_deals(deal_ids: list[str]) -> dict[str, list[str]]:
    """Batch fetch contact associations for multiple deals."""
    return batch_get_associations("deal", "contact", deal_ids)


def batch_get_companies_for_deals(deal_ids: list[str]) -> dict[str, list[str]]:
    """Batch fetch company associations for multiple deals."""
    return batch_get_associations("deal", "company", deal_ids)


def get_active_deals() -> list[str]:
    """MAKES A CALL TO HUBSPOT API
    Fetches all active deals from HubSpot

    Returns:
        list: A list of active deal IDs.
    """
    # Filters
    f_pipeline = Filter(
        property_name="pipeline", operator="EQ", value=SALES_PIPELINE_ID
    )
    f_stage = Filter(property_name="activiteit", operator="EQ", value="Actief")

    search_req = PublicObjectSearchRequest(
        filter_groups=[FilterGroup(filters=[f_pipeline, f_stage])],
        properties=[],
        limit=100,
    )

    ids: list[str] = []
    after = None
    while True:
        if after is not None:
            search_req.after = after
        resp = client.crm.deals.search_api.do_search(
            public_object_search_request=search_req
        )
        ids.extend(obj.id for obj in resp.results)

        nxt = getattr(getattr(resp, "paging", None), "next", None)
        if not nxt:
            break
        after = nxt.after

    return ids


def get_volledige_service_deals() -> list[str]:
    """MAKES A CALL TO HUBSPOT API
    Fetches all 'Volledige Service' deals from HubSpot.

    Returns:
        list: A list of 'Volledige Service' deal IDs.
    """
    # Filters
    f_pipeline = Filter(
        property_name="pipeline", operator="EQ", value=SALES_PIPELINE_ID
    )
    f_stage = Filter(property_name="dealstage", operator="EQ", value="1189168762")

    search_req = PublicObjectSearchRequest(
        filter_groups=[FilterGroup(filters=[f_pipeline, f_stage])],
        properties=[],
        limit=100,
    )

    ids: list[str] = []
    after = None
    while True:
        if after is not None:
            search_req.after = after
        resp = client.crm.deals.search_api.do_search(
            public_object_search_request=search_req
        )
        ids.extend(obj.id for obj in resp.results)

        nxt = getattr(getattr(resp, "paging", None), "next", None)
        if not nxt:
            break
        after = nxt.after

    return ids


def batch_get_deals_info(
    deal_ids: list[str] | list[int], properties: list[str]
) -> list[Any]:
    """MAKES CALL TO HUBSPOT API
    Batch-read a set of deals in one request.


    Args:

    deal_ids (list[str|int]): deal ids to fetch
    properties (list[str]): properties to retrieve (e.g. ["pipeline","year","quarter"]).


    Returns:
    list: List of SimplePublicObject results (like basic_api.get_by_id), for the found ids.
    """
    if not deal_ids:
        return []
    inputs = [{"id": str(d)} for d in deal_ids]
    req = DealsBatchReadInput(
        inputs=inputs, properties=properties, properties_with_history=[]
    )
    res = client.crm.deals.batch_api.read(
        batch_read_input_simple_public_object_id=req, archived=False
    )
    return res.results


def search_deals(body: dict[str, Any]) -> Any:
    """MAKES CALL TO HUBSPOT API
    POST /crm/v3/objects/deals/search

    Args:
        body (dict): raw search body (filterGroups, properties, sorts, limit, after)

    Returns:
        Any: HubSpot API response
    """
    try:
        req = PublicObjectSearchRequest(**body)
        api_response = client.crm.deals.search_api.do_search(
            public_object_search_request=req
        )
        if api_response is None:
            logger.error("Deals search returned None")
        return api_response
    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.exception("Deals search failed: %s", e)
        raise


def submit_contact_via_forms_api(
    portal_id: str,
    form_guid: str,
    fields: list[dict[str, str]],
    context: dict[str, str] | None = None,
    submitted_at_ms: int | None = None,
) -> None:
    """Submit a contact to HubSpot via the Forms API v3.

    Unlike the standard Contacts API, this endpoint accepts the hutk cookie
    in the context object, allowing HubSpot to correctly attribute the lead's
    original source from browser session data.

    Args:
        portal_id: HubSpot portal (account) ID.
        form_guid: GUID of the target HubSpot form.
        fields: List of {"objectTypeId": "0-1", "name": ..., "value": ...} dicts.
        context: Optional context dict, e.g. {"hutk": "...", "pageUri": "..."}.
        submitted_at_ms: Optional submission timestamp in milliseconds.
    """
    from app.hubspot_client import get_hs_headers

    url = f"https://api.hsforms.com/submissions/v3/integration/submit/{portal_id}/{form_guid}"
    payload: dict[str, Any] = {"fields": fields}
    if submitted_at_ms is not None:
        payload["submittedAt"] = str(submitted_at_ms)
    if context:
        payload["context"] = context

    response = requests.post(url, headers=get_hs_headers(), json=payload)
    if not response.ok:
        logger.error(
            "Forms API v3 submission failed: %s %s",
            response.status_code,
            response.text,
        )
        response.raise_for_status()
