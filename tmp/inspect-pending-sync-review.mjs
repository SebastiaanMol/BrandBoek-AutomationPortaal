import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).map((line) => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  return match ? [match[1], match[2].replace(/^['"]|['"]$/g, '')] : null;
}).filter(Boolean));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

async function fetchPage(from, to) {
  const { data, error, count } = await supabase
    .from('source_sync_change_items')
    .select('id,source,external_id,automation_id,change_type,status,review_key,title,summary,old_value_sanitized,new_value_sanitized,created_at,sync_run_id', { count: 'exact' })
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;
  return { data: data ?? [], count };
}

const first = await fetchPage(0, 999);
const rows = first.data;
const bySource = {};
const byType = {};
const byReview = {};
const fieldCounts = {};
for (const row of rows) {
  bySource[row.source] = (bySource[row.source] ?? 0) + 1;
  byType[row.change_type] = (byType[row.change_type] ?? 0) + 1;
  byReview[row.review_key ?? 'null'] = (byReview[row.review_key ?? 'null'] ?? 0) + 1;
  const oldMeta = Array.isArray(row.old_value_sanitized?.metadata) ? row.old_value_sanitized.metadata : [];
  const newMeta = Array.isArray(row.new_value_sanitized?.metadata) ? row.new_value_sanitized.metadata : [];
  for (const item of [...oldMeta, ...newMeta]) {
    if (item?.field) fieldCounts[item.field] = (fieldCounts[item.field] ?? 0) + 1;
  }
}
const samples = rows.slice(0, 12).map((row) => ({
  id: row.id,
  source: row.source,
  external_id: row.external_id,
  type: row.change_type,
  review_key: row.review_key,
  title: row.title,
  created_at: row.created_at,
  fields: [...new Set([...(row.old_value_sanitized?.metadata ?? []), ...(row.new_value_sanitized?.metadata ?? [])].map((item) => item?.field).filter(Boolean))],
  old: row.old_value_sanitized,
  next: row.new_value_sanitized,
}));
console.log(JSON.stringify({ total: first.count, fetched: rows.length, bySource, byType, byReview, fieldCounts, samples }, null, 2));
