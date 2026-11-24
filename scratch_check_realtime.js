const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function checkRealtime() {
  // Check active sessions in last 3 minutes
  const threeMinsAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  
  const sessRes = await fetch(`${SUPABASE_URL}/rest/v1/sessions?updated_at=gte.${threeMinsAgo}&select=id,track_id,client_ip,updated_at`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  const sessions = await sessRes.json();
  console.log(`Active sessions in last 3 mins: ${sessions.length}`);
  console.log(sessions);

  // Check pending/failed events
  const queueRes = await fetch(`${SUPABASE_URL}/rest/v1/events?status=in.(pending,failed,processing)&select=id,event_name,status`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  const queue = await queueRes.json();
  console.log(`Events in queue: ${queue.length}`);
}

checkRealtime().catch(console.error);
