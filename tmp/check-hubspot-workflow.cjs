const { createClient } = require('@supabase/supabase-js');

const url = 'https://icvrrpxtycwgaxcajwdf.supabase.co';
const key = 'sb_publishable_grjNwFDrbHt4KFp9b6sTnQ_8nTv6YZP';
const supabase = createClient(url, key);

(async () => {
  const { data, error } = await supabase
    .from('automatiseringen')
    .select('id,naam,source,external_id,trigger_beschrijving,import_proposal,last_synced_at')
    .ilike('naam', "%BTW 2 maanden geboekt%")
    .limit(5);
  if (error) throw error;
  for (const row of data || []) {
    const proposal = row.import_proposal || {};
    console.log(JSON.stringify({
      id: row.id,
      naam: row.naam,
      source: row.source,
      external_id: row.external_id,
      trigger_beschrijving: row.trigger_beschrijving,
      last_synced_at: row.last_synced_at,
      hasHubspotWorkflow: Boolean(proposal.hubspot_workflow),
      hubspotWorkflowKeys: proposal.hubspot_workflow ? Object.keys(proposal.hubspot_workflow) : [],
      triggers: proposal.hubspot_workflow?.triggers?.slice?.(0, 3),
      actions: proposal.hubspot_workflow?.actions?.filter?.(a => a.webhookUrl || a.webhookPath)?.slice?.(0, 3),
    }, null, 2));
  }
})();
