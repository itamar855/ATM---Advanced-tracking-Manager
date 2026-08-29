const start = Date.now();
fetch('https://trackingatm.vercel.app/api/v1/pixel/atacadodasgaiolas.shop/script.js')
  .then(r => r.text())
  .then(t => {
    console.log("Script Length:", t.length);
    // Find where the script posts data to
    const endpoints = t.match(/https:\/\/[^\/]+\/api\/v1\/pixel\/[^\/]+\/track/g);
    console.log("Found endpoints:", endpoints);
    // Find heartbeat endpoint
    const heartbeats = t.match(/https:\/\/[^\/]+\/api\/v1\/pixel\/[^\/]+\/live/g);
    console.log("Found live endpoints:", heartbeats);
  })
  .catch(console.error);
