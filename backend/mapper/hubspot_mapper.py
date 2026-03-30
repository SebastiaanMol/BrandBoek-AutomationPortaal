"""
Rule-based HubSpot → Automation Portal mapper.
Converts raw HubSpot workflow JSON into a structured proposal dict.
No AI/tokens used — fully deterministic.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any

# ── Lookup tables ──────────────────────────────────────────────────────────────

ACTION_SYSTEM_MAP: dict[str, str | None] = {
    "SEND_EMAIL":             "HubSpot",
    "EMAIL":                  "HubSpot",
    "SET_CONTACT_PROPERTY":   "HubSpot",
    "SET_COMPANY_PROPERTY":   "HubSpot",
    "SET_DEAL_PROPERTY":      "HubSpot",
    "CREATE_TASK":            "HubSpot",
    "WEBHOOK":                "Webhook",
    "DELAY":                  None,
    "BRANCH":                 None,
    "IF_THEN":                None,
    "EXTENSION":              None,
    "SALESFORCE_CREATE":      "Salesforce",
    "SALESFORCE_UPDATE":      "Salesforce",
    "SLACK_NOTIFICATION":     "Slack",
    "GOOGLE_SHEETS_ADD_ROW":  "Google Sheets",
}

ACTION_LABEL_MAP: dict[str, str] = {
    "SEND_EMAIL":             "Stuur e-mail",
    "EMAIL":                  "Stuur e-mail",
    "SET_CONTACT_PROPERTY":   "Stel contacteigenschap in",
    "SET_COMPANY_PROPERTY":   "Stel bedrijfseigenschap in",
    "SET_DEAL_PROPERTY":      "Stel deal-eigenschap in",
    "CREATE_TASK":            "Maak taak aan",
    "WEBHOOK":                "Stuur webhook",
    "DELAY":                  "Wacht",
    "BRANCH":                 "Vertakking (if/then)",
    "IF_THEN":                "Vertakking (if/then)",
    "EXTENSION":              "Externe actie (integratie)",
    "ENROLLMENT_TRIGGER":     "Inschrijftrigger",
    "SLACK_NOTIFICATION":     "Stuur Slack-bericht",
    "GOOGLE_SHEETS_ADD_ROW":  "Voeg rij toe aan Google Sheets",
    "DEAL":                   "Deal-actie",
}

TRIGGER_LABEL_MAP: dict[str, str] = {
    "STATIC_LIST":              "Contact toegevoegd aan lijst",
    "ACTIVE_LIST":              "Contact in actieve lijst",
    "ContactList":              "Contact toegevoegd aan lijst",
    "CONTACT_LIST_MEMBERSHIP":  "Contact toegevoegd aan lijst",
    "FORM_SUBMISSION":          "Formulier ingediend",
    "FormSubmission":           "Formulier ingediend",
    "DEAL_PROPERTY_CHANGE":     "Deal-eigenschap gewijzigd",
    "CONTACT_PROPERTY_CHANGE":  "Contact-eigenschap gewijzigd",
    "ContactProperty":          "Contact-eigenschap gewijzigd",
    "COMPANY_PROPERTY_CHANGE":  "Bedrijfseigenschap gewijzigd",
    "PAGE_VIEW":                "Paginabezoek",
    "EMAIL_OPENED":             "E-mail geopend",
    "EMAIL_CLICKED":            "Link in e-mail aangeklikt",
    "CONTACT_CREATED":          "Nieuw contact aangemaakt",
    "DEAL_CREATED":             "Nieuwe deal aangemaakt",
    "COMPANY_CREATED":          "Nieuw bedrijf aangemaakt",
}

WORKFLOW_TYPE_TRIGGER_MAP: dict[str, str] = {
    "DRIP_DELAY":                      "Tijdgebaseerde inschrijving",
    "PROPERTY_ANCHOR_EVENT_BASED":     "Eigenschap gewijzigd",
    "FORM_SUBMISSION":                 "Formulier ingediend",
    "CONTACT_DATE_PROPERTY":           "Contactdatum bereikt",
    "COMPANY_PROPERTY_ANCHOR":         "Bedrijfseigenschap gewijzigd",
    "DEAL_PROPERTY_ANCHOR":            "Deal-eigenschap gewijzigd",
}

STATUS_MAP = {True: "Actief", False: "Uitgeschakeld"}

CATEGORIE_RULES: list[tuple[set[str], str]] = [
    ({"EMAIL", "SEND_EMAIL"},                   "E-mail marketing"),
    ({"WEBHOOK"},                                "Integratie"),
    ({"EXTENSION"},                              "Integratie"),
    ({"SALESFORCE_CREATE", "SALESFORCE_UPDATE"}, "CRM synchronisatie"),
    ({"SLACK_NOTIFICATION"},                     "Notificaties"),
    ({"SET_CONTACT_PROPERTY",
      "SET_COMPANY_PROPERTY",
      "SET_DEAL_PROPERTY"},                      "Data beheer"),
    ({"CREATE_TASK"},                            "Taakbeheer"),
]


# ── Output dataclass ───────────────────────────────────────────────────────────

@dataclass
class MappedAutomation:
    external_id:               str
    naam:                      str
    status:                    str
    beschrijving:              str
    doel:                      str
    trigger:                   str
    trigger_raw:               list[dict]
    systemen:                  list[str]
    stappen:                   list[str]
    stappen_raw:               list[dict]
    branches:                  list[dict]
    categorie:                 str
    enrollment:                dict
    beschrijving_in_simpele_taal: list[str]   # ← plain-language story for end users
    import_source:             str = "hubspot"
    confidence:                dict = field(default_factory=dict)

    def to_proposal(self) -> dict:
        return {
            "naam":                       self.naam,
            "status":                     self.status,
            "beschrijving":               self.beschrijving,
            "doel":                       self.doel,
            "trigger":                    self.trigger,
            "trigger_raw":                self.trigger_raw,
            "systemen":                   self.systemen,
            "stappen":                    self.stappen,
            "stappen_raw":                self.stappen_raw,
            "branches":                   self.branches,
            "categorie":                  self.categorie,
            "enrollment":                 self.enrollment,
            "beschrijving_in_simpele_taal": self.beschrijving_in_simpele_taal,
            "confidence":                 self.confidence,
        }

    def to_db_row(self, raw_payload: dict) -> dict:
        return {
            "id":                   f"AUTO-HS-{self.external_id}",
            "naam":                 self.naam,
            "status":               self.status,
            "doel":                 "",
            "trigger_beschrijving": self.trigger,
            "systemen":             self.systemen,
            "stappen":              self.stappen,
            "branches":             self.branches,
            "categorie":            self.categorie,
            "import_source":        self.import_source,
            "external_id":          self.external_id,
            "import_status":        "pending_approval",
            "import_proposal":      self.to_proposal(),
            "raw_payload":          raw_payload,
        }


# ── Main entry point ───────────────────────────────────────────────────────────

def map_hubspot_workflow(payload: dict) -> MappedAutomation:
    raw_actions: list[dict] = payload.get("actions", [])
    actions = _flatten_actions(raw_actions)

    stappen      = _extract_stappen(actions)
    stappen_raw  = _extract_stappen_raw(actions)
    systemen     = _extract_systemen(actions)
    branches     = _extract_branches(actions)
    trigger, trigger_raw = _extract_trigger(payload)
    categorie    = _infer_categorie(actions)
    enrollment   = _extract_enrollment(payload)
    naam         = payload.get("name", "Naamloze workflow")
    beschrijving = payload.get("description", "")

    simpele_taal = _generate_simpele_taal(
        naam=naam,
        payload=payload,
        actions=actions,
        trigger=trigger,
        enrollment=enrollment,
        branches=branches,
    )

    confidence = {
        "naam":                       "high",
        "status":                     "high",
        "beschrijving":               "high" if beschrijving else "low",
        "trigger":                    "high" if trigger != "Onbekend" else "low",
        "systemen":                   "high" if systemen else "low",
        "stappen":                    "high" if stappen else "low",
        "branches":                   "medium" if branches else "low",
        "categorie":                  "medium",
        "doel":                       "low",
        "beschrijving_in_simpele_taal": "high" if simpele_taal else "low",
    }

    return MappedAutomation(
        external_id              = str(payload["id"]),
        naam                     = naam,
        status                   = STATUS_MAP.get(payload.get("enabled", False), "Uitgeschakeld"),
        beschrijving             = beschrijving,
        doel                     = _infer_doel(naam),
        trigger                  = trigger,
        trigger_raw              = trigger_raw,
        systemen                 = systemen,
        stappen                  = stappen,
        stappen_raw              = stappen_raw,
        branches                 = branches,
        categorie                = categorie,
        enrollment               = enrollment,
        beschrijving_in_simpele_taal = simpele_taal,
        confidence               = confidence,
    )


# ── Plain-language story generator ────────────────────────────────────────────

def _generate_simpele_taal(
    naam: str,
    payload: dict,
    actions: list[dict],
    trigger: str,
    enrollment: dict,
    branches: list[dict],
) -> list[str]:
    """
    Generates a numbered list of plain Dutch sentences describing the workflow.
    Rule-based only — no AI/tokens. Injects actual values from the JSON.
    """
    sentences: list[str] = []
    step = 1

    wf_type: str = payload.get("type", "")
    enabled: bool = payload.get("enabled", False)
    meta: dict = payload.get("metaData") or {}
    contact_lists: dict = meta.get("contactListIds") or {}

    # ── 0. Intro (één zin, geen aparte stap) ─────────────────────────────────
    status_zin = "actief" if enabled else "momenteel uitgeschakeld"
    sentences.append(f"Deze automatisering heet '{naam}' en is {status_zin}.")

    # ── 1. Startconditie: haal echte waarden op ───────────────────────────────
    trigger_detail = _extract_trigger_detail(payload)

    if trigger_detail:
        # We have specific condition details — use them directly
        sentences.append(f"Stap {step}: De automatisering start zodra {trigger_detail}.")
        step += 1
    elif enrollment.get("isSegmentBased"):
        # Segment-based but no parseable conditions found
        sentences.append(
            f"Stap {step}: De automatisering start voor contacten die in een "
            f"specifieke lijst zijn opgenomen (lijst-ID's: actief={contact_lists.get('active', '?')}, "
            f"ingeschreven={contact_lists.get('enrolled', '?')})."
        )
        step += 1
    elif trigger != "Onbekend":
        sentences.append(
            f"Stap {step}: De automatisering start zodra het volgende gebeurt — {trigger.lower()}."
        )
        step += 1

    # ── 2. Workflow type — alleen als het iets toevoegt aan het verhaal ───────
    if wf_type == "DRIP_DELAY":
        sentences.append(
            "Tussen de stappen zitten wachttijden: het systeem wacht steeds tot "
            "het juiste moment voordat het doorgaat naar de volgende actie."
        )
    elif wf_type == "PROPERTY_ANCHOR_EVENT_BASED":
        sentences.append(
            "De automatisering is gekoppeld aan een specifieke eigenschap van een "
            "contact en reageert zodra die eigenschap verandert."
        )
    elif wf_type == "CONTACT_DATE_PROPERTY":
        sentences.append(
            "De automatisering is gekoppeld aan een datum in het contactprofiel "
            "(zoals een verjaardag of contractvervaldatum) en start automatisch "
            "op of rond die datum."
        )

    # ── 3. Per actie een gedetailleerde zin ───────────────────────────────────
    for a in actions:
        t = a.get("type") or a.get("actionType") or ""
        zin = _action_to_simpele_zin(t, a, step)
        if zin:
            sentences.append(zin)
            step += 1

    # ── 4. Vertakkingen met echte paden ───────────────────────────────────────
    if branches:
        paden = ", ".join(f"'{b['label']}'" for b in branches[:5])
        meer = f" (en {len(branches) - 5} meer)" if len(branches) > 5 else ""
        sentences.append(
            f"Stap {step}: Het systeem kiest op dit punt automatisch een richting "
            f"op basis van de situatie van de klant. Mogelijke paden: {paden}{meer}."
        )
        step += 1

    # ── 5. Afronding & lijsten ────────────────────────────────────────────────
    completed_id = contact_lists.get("completed")
    succeeded_id = contact_lists.get("succeeded")
    if completed_id or succeeded_id:
        lijst_info = []
        if completed_id:
            lijst_info.append(f"'afgerond' (lijst {completed_id})")
        if succeeded_id:
            lijst_info.append(f"'geslaagd' (lijst {succeeded_id})")
        sentences.append(
            f"Stap {step}: Na afloop wordt de klant automatisch gemarkeerd als "
            f"{' en '.join(lijst_info)}, zodat dezelfde automatisering niet opnieuw "
            f"onnodig wordt gestart."
        )
        step += 1

    # ── 6. Herhalingswaarschuwing ─────────────────────────────────────────────
    if enrollment.get("allowContactToTriggerMultipleTimes"):
        sentences.append(
            "Let op: Deze automatisering kan meerdere keren worden doorlopen "
            "door dezelfde klant — elke keer dat de startvoorwaarde opnieuw "
            "van toepassing is."
        )

    # ── 7. Merge-inschrijving ─────────────────────────────────────────────────
    if enrollment.get("allowEnrollmentFromMerge"):
        sentences.append(
            "Als twee contacten worden samengevoegd in HubSpot, start het "
            "samengevoegde contact automatisch opnieuw in deze automatisering."
        )

    # ── 8. Triggered by andere workflow ──────────────────────────────────────
    triggered_by: list = enrollment.get("triggeredByWorkflowIds") or []
    if triggered_by:
        ids = ", ".join(str(x) for x in triggered_by[:3])
        meer = f" (en {len(triggered_by) - 3} meer)" if len(triggered_by) > 3 else ""
        sentences.append(
            f"Deze automatisering wordt geactiveerd door een andere automatisering "
            f"(workflow-ID: {ids}{meer})."
        )

    # ── 9. Fallback ───────────────────────────────────────────────────────────
    if len(sentences) <= 1:
        sentences.append(
            "Er zijn geen specifieke acties gevonden in deze automatisering. "
            "Controleer in HubSpot of de workflow stappen bevat."
        )

    return sentences


def _extract_trigger_detail(payload: dict) -> str:
    """
    Tries to extract a human-readable trigger description with actual values.
    Returns empty string if no parseable details found.
    """
    # ── triggerSets ───────────────────────────────────────────────────────────
    for ts in payload.get("triggerSets") or []:
        for f in ts.get("filters") or []:
            result = _filter_to_nl(f)
            if result:
                return result

    # ── segmentCriteria ───────────────────────────────────────────────────────
    for group in payload.get("segmentCriteria") or []:
        filters = group if isinstance(group, list) else [group]
        for f in filters:
            result = _filter_to_nl(f)
            if result:
                return result

    # ── reEnrollmentTriggerSets ───────────────────────────────────────────────
    for ts in payload.get("reEnrollmentTriggerSets") or []:
        for f in ts.get("filters") or []:
            result = _filter_to_nl(f)
            if result:
                return result

    return ""


def _filter_to_nl(f: dict) -> str:
    """Converts a single HubSpot filter object to a Dutch description."""
    family = f.get("filterFamily") or f.get("type") or ""
    prop   = f.get("property") or f.get("propertyName") or ""
    val    = f.get("value") or f.get("propertyValue") or ""
    op     = f.get("operator") or ""
    op_nl  = _operator_label(op)

    # Contact property filter
    if family in ("ContactProperty", "CONTACT_PROPERTY_CHANGE", "CONTACT_PROPERTY"):
        if prop and val:
            return f"de contacteigenschap '{prop}' {op_nl} '{val}'"
        if prop:
            return f"de contacteigenschap '{prop}' verandert"

    # List membership
    if family in ("ContactList", "STATIC_LIST", "ACTIVE_LIST", "CONTACT_LIST_MEMBERSHIP"):
        list_id = f.get("listId") or val or ""
        if list_id:
            return f"een contact wordt toegevoegd aan lijst {list_id}"
        return "een contact wordt toegevoegd aan een specifieke lijst"

    # Form submission
    if family in ("FormSubmission", "FORM_SUBMISSION"):
        form_id = f.get("formId") or val or ""
        if form_id:
            return f"formulier {form_id} wordt ingediend"
        return "een formulier wordt ingediend"

    # Deal property
    if family in ("DealProperty", "DEAL_PROPERTY_CHANGE"):
        if prop and val:
            return f"de dealeigenschap '{prop}' {op_nl} '{val}'"
        if prop:
            return f"de dealeigenschap '{prop}' verandert"

    # Company property
    if family in ("CompanyProperty", "COMPANY_PROPERTY_CHANGE"):
        if prop and val:
            return f"de bedrijfseigenschap '{prop}' {op_nl} '{val}'"
        if prop:
            return f"de bedrijfseigenschap '{prop}' verandert"

    # Page view
    if family == "PAGE_VIEW":
        page = f.get("url") or val or ""
        if page:
            return f"een contact de pagina '{page}' bezoekt"
        return "een contact een specifieke pagina bezoekt"

    # Email interaction
    if family == "EMAIL_OPENED":
        return "een contact een e-mail opent"
    if family == "EMAIL_CLICKED":
        return "een contact op een link in een e-mail klikt"

    # Generic property with value
    if prop and val:
        return f"'{prop}' {op_nl} '{val}'"
    if prop:
        return f"'{prop}' verandert"

    return ""


def _operator_label(op: str) -> str:
    """Converts HubSpot operator code to Dutch."""
    return {
        "EQ":                     "gelijk is aan",
        "NEQ":                    "niet gelijk is aan",
        "CONTAINS":               "de waarde bevat",
        "NOT_CONTAINS":           "de waarde niet bevat",
        "GT":                     "groter is dan",
        "GTE":                    "groter of gelijk is aan",
        "LT":                     "kleiner is dan",
        "LTE":                    "kleiner of gelijk is aan",
        "IS_KNOWN":               "is ingevuld",
        "IS_NOT_KNOWN":           "leeg is",
        "SET_ANY":                "een waarde heeft",
        "BETWEEN":                "ligt tussen",
        "HAS_EVER_BEEN_EQUAL_TO": "ooit gelijk is geweest aan",
    }.get(op, "is")


def _action_to_simpele_zin(t: str, a: dict, step: int) -> str | None:
    """Converts a single action dict to a detailed plain Dutch sentence."""

    if t == "DELAY":
        ms = a.get("delayMillis") or a.get("delayTime") or 0
        duration = _ms_to_human(ms)
        anchor = a.get("anchorSetting") or {}
        anchor_prop = anchor.get("anchorProperty") or ""
        if anchor_prop:
            offset_dir = "voor" if (anchor.get("offsetDirection") or "") == "BEFORE" else "na"
            return (
                f"Stap {step}: Het systeem wacht {duration} {offset_dir} "
                f"de datum van '{anchor_prop}'."
            )
        return (
            f"Stap {step}: Het systeem wacht {duration} voordat het "
            f"verdergaat met de volgende stap."
        )

    if t in ("SEND_EMAIL", "EMAIL"):
        # Try to find email name/subject from various possible fields
        body = a.get("body") or {}
        email_name = (
            a.get("emailName") or body.get("emailName")
            or a.get("name") or body.get("name") or ""
        )
        subject = (
            a.get("emailSubject") or body.get("emailSubject")
            or a.get("subject") or body.get("subject") or ""
        )
        cid = a.get("contentId") or a.get("emailId") or body.get("contentId") or ""

        if subject:
            return f"Stap {step}: De klant ontvangt automatisch de e-mail met onderwerp: '{subject}'."
        if email_name:
            return f"Stap {step}: De klant ontvangt automatisch de e-mail '{email_name}'."
        if cid:
            return f"Stap {step}: De klant ontvangt automatisch een e-mail (e-mail ID: {cid})."
        return f"Stap {step}: De klant ontvangt automatisch een e-mail."

    if t == "SET_CONTACT_PROPERTY":
        prop = a.get("propertyName") or "een eigenschap"
        val  = a.get("propertyValue") or a.get("newValue") or ""
        if val:
            return (
                f"Stap {step}: Het veld '{prop}' in het contactprofiel "
                f"wordt automatisch ingesteld op '{val}'."
            )
        return (
            f"Stap {step}: Het veld '{prop}' in het contactprofiel "
            f"wordt automatisch bijgewerkt."
        )

    if t == "SET_COMPANY_PROPERTY":
        prop = a.get("propertyName") or "een eigenschap"
        val  = a.get("propertyValue") or a.get("newValue") or ""
        if val:
            return (
                f"Stap {step}: Het veld '{prop}' in het bedrijfsprofiel "
                f"wordt automatisch ingesteld op '{val}'."
            )
        return (
            f"Stap {step}: Het veld '{prop}' in het bedrijfsprofiel "
            f"wordt automatisch bijgewerkt."
        )

    if t == "SET_DEAL_PROPERTY":
        prop = a.get("propertyName") or "een eigenschap"
        val  = a.get("propertyValue") or a.get("newValue") or ""
        if val:
            return (
                f"Stap {step}: Op de bijbehorende deal wordt het veld '{prop}' "
                f"automatisch ingesteld op '{val}'."
            )
        return (
            f"Stap {step}: Op de bijbehorende deal wordt het veld '{prop}' "
            f"automatisch bijgewerkt."
        )

    if t == "CREATE_TASK":
        body = a.get("body") or {}
        title    = a.get("taskTitle") or a.get("taskName") or body.get("taskTitle") or ""
        owner    = a.get("taskOwnerId") or body.get("taskOwnerId") or ""
        due_days = a.get("taskDueDateOffsetDays") or body.get("taskDueDateOffsetDays") or ""
        parts: list[str] = []
        if title:
            parts.append(f"'{title}'")
        if due_days:
            parts.append(f"met een deadline over {due_days} dag(en)")
        if owner:
            parts.append(f"toegewezen aan gebruiker {owner}")
        detail = " ".join(parts) if parts else "zonder titel"
        return f"Stap {step}: Er wordt automatisch een taak aangemaakt: {detail}."

    if t == "WEBHOOK":
        url    = a.get("url") or a.get("webhookUrl") or ""
        method = (a.get("method") or "POST").upper()
        if url:
            return (
                f"Stap {step}: Er wordt een {method}-verzoek gestuurd naar "
                f"'{url}' om een extern systeem te informeren."
            )
        return (
            f"Stap {step}: Er wordt een automatisch signaal (webhook) "
            f"gestuurd naar een extern systeem."
        )

    if t == "EXTENSION":
        def_id   = a.get("extensionDefinitionId") or a.get("extensionId") or ""
        ext_name = _known_extension_name(def_id)
        if ext_name:
            return (
                f"Stap {step}: Er wordt automatisch een actie uitgevoerd "
                f"via {ext_name}."
            )
        if def_id:
            return (
                f"Stap {step}: Er wordt automatisch een externe integratie "
                f"aangestuurd (koppeling-ID: {def_id}). Nakijken welke software "
                f"dit is en wat er precies gebeurt."
            )
        return (
            f"Stap {step}: Er wordt automatisch een externe koppeling "
            f"aangestuurd. Nakijken welke software dit is en wat er precies gebeurt."
        )

    if t in ("BRANCH", "IF_THEN"):
        arms = a.get("branches") or a.get("options") or a.get("branchActions") or []
        n = len(arms)
        if n > 0:
            pad_labels = ", ".join(
                f"'{arm.get('label') or arm.get('name') or f'Pad {i+1}'}'"
                for i, arm in enumerate(arms[:4])
            )
            meer = f" (en {n - 4} meer)" if n > 4 else ""
            return (
                f"Stap {step}: Het systeem maakt een keuze op basis van de "
                f"situatie van de klant en kiest een van {n} paden: "
                f"{pad_labels}{meer}."
            )
        return (
            f"Stap {step}: Het systeem maakt een keuze op basis van de "
            f"situatie van de klant."
        )

    if t == "SLACK_NOTIFICATION":
        channel = a.get("channel") or ""
        message = a.get("message") or a.get("body", {}).get("message") or ""
        if channel and message:
            short_msg = message[:60] + "..." if len(message) > 60 else message
            return (
                f"Stap {step}: Er wordt automatisch een Slack-bericht gestuurd "
                f"naar #{channel} met de tekst: '{short_msg}'."
            )
        if channel:
            return (
                f"Stap {step}: Er wordt automatisch een bericht gestuurd "
                f"naar het Slack-kanaal #{channel}."
            )
        return f"Stap {step}: Er wordt automatisch een Slack-bericht verstuurd."

    if t == "SALESFORCE_CREATE":
        sf_object = a.get("objectType") or a.get("sfObjectType") or ""
        if sf_object:
            return (
                f"Stap {step}: Er wordt automatisch een nieuw {sf_object}-record "
                f"aangemaakt in Salesforce."
            )
        return f"Stap {step}: Er wordt automatisch een nieuw record aangemaakt in Salesforce."

    if t == "SALESFORCE_UPDATE":
        sf_object = a.get("objectType") or a.get("sfObjectType") or ""
        if sf_object:
            return (
                f"Stap {step}: Een bestaand {sf_object}-record in Salesforce "
                f"wordt automatisch bijgewerkt."
            )
        return f"Stap {step}: Een bestaand Salesforce-record wordt automatisch bijgewerkt."

    if t == "GOOGLE_SHEETS_ADD_ROW":
        sheet = a.get("spreadsheetName") or a.get("spreadsheetId") or ""
        if sheet:
            return (
                f"Stap {step}: Er wordt automatisch een nieuwe rij toegevoegd "
                f"aan het Google Sheets-bestand '{sheet}'."
            )
        return (
            f"Stap {step}: Er wordt automatisch een nieuwe rij toegevoegd "
            f"aan een Google Sheets-bestand."
        )

    if t:
        return (
            f"Stap {step}: Het systeem voert een automatische actie uit "
            f"(type: {t}). Nakijken wat dit precies inhoudt."
        )

    return None


def _known_extension_name(def_id: Any) -> str:
    """Maps known HubSpot extensionDefinitionId values to readable names."""
    # Add more as you discover them from your own portal's raw_payload data
    KNOWN: dict[str, str] = {
        "18224765": "een externe dienst (Operations Hub / Data Sync)",
        "15573739": "de HubSpot Operations Hub data formatter",
        "15573740": "de HubSpot Operations Hub code-actie",
        "11798": "een HubSpot Payments-actie",
    }
    return KNOWN.get(str(def_id), "")


# ── Supporting helpers ─────────────────────────────────────────────────────────

def _flatten_actions(actions: list[dict]) -> list[dict]:
    result: list[dict] = []
    for a in actions:
        result.append(a)
        for arm in a.get("branches") or a.get("options") or []:
            if isinstance(arm, dict) and isinstance(arm.get("actions"), list):
                result.extend(_flatten_actions(arm["actions"]))
    return result


def _extract_stappen(actions: list[dict]) -> list[str]:
    labels: list[str] = []
    for a in actions:
        t = a.get("type") or a.get("actionType") or ""
        label = _action_to_label(t, a)
        if label:
            labels.append(label)
    return labels


def _extract_stappen_raw(actions: list[dict]) -> list[dict]:
    result: list[dict] = []
    for a in actions:
        t = a.get("type") or a.get("actionType") or ""
        result.append({
            "type":          t,
            "label":         _action_to_label(t, a) or t or "Onbekende actie",
            "actionId":      a.get("actionId") or a.get("id"),
            "propertyName":  a.get("propertyName"),
            "propertyValue": a.get("propertyValue") or a.get("newValue"),
            "contentId":     a.get("contentId") or a.get("emailId"),
            "url":           a.get("url") or a.get("webhookUrl"),
            "delayMillis":   a.get("delayMillis") or a.get("delayTime"),
            "extensionId":   a.get("extensionId"),
        })
    return result


def _action_to_label(t: str, a: dict) -> str | None:
    if t == "DELAY":
        ms = a.get("delayMillis") or a.get("delayTime") or 0
        return f"Wacht {_ms_to_human(ms)}"
    if t in ("SET_CONTACT_PROPERTY", "SET_COMPANY_PROPERTY"):
        val = a.get("propertyValue") or a.get("newValue") or "?"
        return f"Stel '{a.get('propertyName', '?')}' in op '{val}'"
    if t == "SET_DEAL_PROPERTY":
        val = a.get("propertyValue") or a.get("newValue") or "?"
        return f"Deal: stel '{a.get('propertyName', '?')}' in op '{val}'"
    if t in ("SEND_EMAIL", "EMAIL"):
        cid = a.get("contentId") or a.get("emailId") or (a.get("body") or {}).get("contentId") or "?"
        return f"Stuur e-mail (ID: {cid})"
    if t == "WEBHOOK":
        return f"Webhook → {a.get('url') or a.get('webhookUrl') or '?'}"
    if t == "CREATE_TASK":
        title = a.get("taskTitle") or a.get("taskName") or (a.get("body") or {}).get("taskTitle") or "Zonder titel"
        return f"Maak taak aan: '{title}'"
    if t == "SLACK_NOTIFICATION":
        return f"Slack bericht naar #{a.get('channel', '?')}"
    if t in ("BRANCH", "IF_THEN"):
        arms = a.get("branches") or a.get("options") or a.get("branchActions") or []
        return f"Vertakking: {len(arms)} paden"
    if t == "EXTENSION":
        ext_id = a.get("extensionDefinitionId") or a.get("extensionId") or "?"
        return f"Externe integratie (definitie {ext_id})"
    if not t:
        return None
    return ACTION_LABEL_MAP.get(t, t)


def _extract_systemen(actions: list[dict]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for a in actions:
        t = a.get("type") or a.get("actionType") or ""
        sys = ACTION_SYSTEM_MAP.get(t)
        if sys and sys not in seen:
            seen.add(sys)
            result.append(sys)
    return result


def _extract_branches(actions: list[dict]) -> list[dict]:
    branches: list[dict] = []
    for a in actions:
        t = a.get("type") or a.get("actionType") or ""
        if t not in ("BRANCH", "IF_THEN"):
            continue
        arms = a.get("branches") or a.get("options") or a.get("branchActions") or []
        for i, arm in enumerate(arms):
            label = arm.get("label") or arm.get("name") or f"Pad {i + 1}"
            branches.append({
                "id":       f"b-{a.get('actionId') or a.get('id') or 0}-{i}",
                "label":    label,
                "toStepId": "",
            })
    return branches


def _extract_trigger(payload: dict) -> tuple[str, list[dict]]:
    trigger_sets: list[dict] = payload.get("triggerSets") or []
    raw: list[dict] = trigger_sets
    if trigger_sets:
        for ts in trigger_sets:
            for f in ts.get("filters") or []:
                kind = f.get("filterFamily") or f.get("type") or f.get("filterType") or ""
                if kind:
                    return TRIGGER_LABEL_MAP.get(kind, kind), raw

    segment_criteria: list[dict] = payload.get("segmentCriteria") or []
    if segment_criteria:
        raw = segment_criteria
        for group in segment_criteria:
            for f in (group if isinstance(group, list) else [group]):
                kind = f.get("filterFamily") or f.get("type") or ""
                if kind:
                    return TRIGGER_LABEL_MAP.get(kind, kind), raw

    re_enroll: list[dict] = payload.get("reEnrollmentTriggerSets") or []
    if re_enroll:
        raw = re_enroll
        for ts in re_enroll:
            for f in ts.get("filters") or []:
                kind = f.get("filterFamily") or f.get("type") or ""
                if kind:
                    return TRIGGER_LABEL_MAP.get(kind, kind), raw

    wf_type: str = payload.get("type") or ""
    fallback = WORKFLOW_TYPE_TRIGGER_MAP.get(wf_type)
    if fallback:
        return fallback, []

    return "Onbekend", []


def _extract_enrollment(payload: dict) -> dict:
    meta = payload.get("metaData") or {}
    return {
        "isSegmentBased":                     payload.get("isSegmentBased", False),
        "allowContactToTriggerMultipleTimes":  payload.get("allowContactToTriggerMultipleTimes", False),
        "allowEnrollmentFromMerge":            payload.get("allowEnrollmentFromMerge", False),
        "listening":                           payload.get("listening", False),
        "workflowType":                        payload.get("type", ""),
        "contactListIds":                      meta.get("contactListIds") or {},
        "triggeredByWorkflowIds":              meta.get("triggeredByWorkflowIds") or [],
    }


def _infer_categorie(actions: list[dict]) -> str:
    types = {a.get("type") or a.get("actionType") or "" for a in actions}
    for rule_types, label in CATEGORIE_RULES:
        if types & rule_types:
            return label
    return "Algemeen"


def _infer_doel(naam: str) -> str:
    if not naam:
        return ""
    cleaned = naam.replace("_", " ").replace("-", " ").strip()
    return f"Automatisch gegenereerd op basis van naam: '{cleaned}'"


def _ms_to_human(ms: int) -> str:
    s = ms // 1000
    if s < 60:    return f"{s} seconden"
    if s < 3600:  return f"{s // 60} minuten"
    if s < 86400: return f"{s // 3600} uur"
    return f"{s // 86400} dagen"
