module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const hcpKey = process.env.HCP_API_KEY;
  const claudeKey = process.env.ANTHROPIC_API_KEY;

  // Test: search customers
  if (req.method === "GET" && req.query.action === "search") {
    const q = req.query.q || "";
    const r = await fetch(`https://api.housecallpro.com/customers?q=${encodeURIComponent(q)}&page_size=10`, {
      headers: { "Authorization": `Token ${hcpKey}`, "Content-Type": "application/json" }
    });
    const d = await r.json();
    res.status(r.status).json(d);
    return;
  }

  // Test: create estimate
  if (req.method === "GET" && req.query.action === "test_estimate") {
    const body = {
      customer_id: "cus_cfacd2dadced4393b04205554d6615cc",
      address_id: "adr_256461b40d2244a9a4a3f5b655dab7cf",
      options: [{
        name: "Test Option from FieldGuide",
        line_items: [{
          name: "Install recessed lights in kitchen",
          description: "6 recessed lights with new dimmer switch",
          unit_price: 0,
          quantity: 1
        }]
      }]
    };
    const r = await fetch("https://api.housecallpro.com/estimates", {
      method: "POST",
      headers: { "Authorization": `Token ${hcpKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const d = await r.json();
    res.status(r.status).json(d);
    return;
  }

  // HCP proxy
  if (req.method === "POST" && req.query.action === "hcp") {
    const { endpoint, method, body } = req.body;
    const r = await fetch(`https://api.housecallpro.com${endpoint}`, {
      method: method || "POST",
      headers: { "Authorization": `Token ${hcpKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const d = await r.json();
    res.status(r.status).json(d);
    return;
  }

  // Claude API
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!claudeKey) { res.status(500).json({ error: "Missing API key" }); return; }
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": claudeKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(req.body)
    });
    const d = await r.json();
    res.status(200).json(d);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
```

Commit it, wait 30 seconds, then visit this URL — it'll try to create a real test estimate in HCP attached to Lisa Doroh:
```
https://field-guide-nu.vercel.app/api/claude?action=test_estimate
