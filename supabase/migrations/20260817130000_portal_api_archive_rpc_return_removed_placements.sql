CREATE OR REPLACE FUNCTION public.portal_api_archive_automation(
  p_id text,
  p_expected_version integer,
  p_actor text,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_automation public.automatiseringen%ROWTYPE;
  updated_automation public.automatiseringen%ROWTYPE;
  placement_count integer := 0;
  removed_placement_count integer := 0;
  placement_payload jsonb := '[]'::jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('portal_api_automation:' || p_id));

  SELECT *
  INTO current_automation
  FROM public.automatiseringen
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('code', 'NOT_FOUND');
  END IF;

  IF current_automation.api_version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object(
      'code', 'VERSION_CONFLICT',
      'automation', to_jsonb(current_automation)
    );
  END IF;

  SELECT count(*), COALESCE(jsonb_agg(to_jsonb(automation_placements)), '[]'::jsonb)
  INTO placement_count, placement_payload
  FROM public.automation_placements
  WHERE automation_id = p_id;

  IF placement_count > 0 AND NOT p_force THEN
    RETURN jsonb_build_object(
      'code', 'ACTIVE_PLACEMENTS',
      'automation', to_jsonb(current_automation),
      'placements', placement_payload
    );
  END IF;

  IF p_force THEN
    DELETE FROM public.automation_placements
    WHERE automation_id = p_id;
    GET DIAGNOSTICS removed_placement_count = ROW_COUNT;
  END IF;

  UPDATE public.automatiseringen
  SET
    status = 'archived',
    archived_at = now(),
    archived_by = p_actor,
    api_version = p_expected_version + 1
  WHERE id = p_id
  RETURNING * INTO updated_automation;

  RETURN jsonb_build_object(
    'code', 'OK',
    'automation', to_jsonb(updated_automation),
    'removedPlacements', removed_placement_count,
    'removedPlacementRecords', CASE WHEN p_force THEN placement_payload ELSE '[]'::jsonb END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.portal_api_archive_automation(text, integer, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_api_archive_automation(text, integer, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.portal_api_archive_automation(text, integer, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.portal_api_archive_automation(text, integer, text, boolean) TO service_role;
