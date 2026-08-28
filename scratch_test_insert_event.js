const SUPABASE_URL = "https://rridxhzbkitgcodzyctu.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyaWR4aHpia2l0Z2NvZHp5Y3R1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzcxNTUzMCwiZXhwIjoyMTAzMjkxNTMwfQ.gGxjPtKXABAYM4r6RsHcebVwwHsdpMD-RyRnxJn3QxE";

async function testInsert() {
  const testEvent = {
    store_id: "dckb5g-7d",
    event_name: "PageView",
    event_id: "test_" + Date.now(),
    source: "browser",
    status: "accepted",
    user_data_keys: ["fbp", "fbc", "client_ip_address", "client_user_agent"],
    health_score: 95,
    meta_response: {
      fbtrace_id: "test_trace_123",
      events_received: 1
    }
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/events`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(testEvent)
  });

  console.log("Status:", res.status);
  const json = await res.json();
  console.log("Result:", json);

  // Delete test event
  if (json[0]?.id) {
    await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${json[0].id}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    console.log("Cleaned up test event.");
  }
}

testInsert().catch(console.error);
