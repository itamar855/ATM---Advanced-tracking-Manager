const SUPABASE_URL = "https://rridxhzbkitgcodzyctu.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyaWR4aHpia2l0Z2NvZHp5Y3R1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzcxNTUzMCwiZXhwIjoyMTAzMjkxNTMwfQ.gGxjPtKXABAYM4r6RsHcebVwwHsdpMD-RyRnxJn3QxE";

async function main() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/events?select=id,event_name,event_id,order_id,created_at,source,status,meta_response&order=created_at.desc&limit=30`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  const data = await res.json();
  console.log("Recent 30 events in database:", data.length);
  console.log(JSON.stringify(data.slice(0, 10), null, 2));

  // Count by event_name
  const counts = {};
  data.forEach(e => { counts[e.event_name] = (counts[e.event_name] || 0) + 1; });
  console.log("Distribution in sample:", counts);
}

main().catch(console.error);
