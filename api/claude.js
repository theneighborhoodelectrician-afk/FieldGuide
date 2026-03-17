const https = require("https");

function makeRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || "GET",
      headers: options.headers || {},
    };
    const req = https.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const hcpKey = process.env.HCP_API_KEY;
  const claudeKey = process.env.ANTHROPIC_API_KEY;

  // Test: search HCP customers
  if (req.method === "GET" && req.query.action === "search") {
    const q = req.query.q || "";
    const r = await makeRequest(
      `https://api.housecallpro.com/customers?q=${encodeURIComponent(q)}&page_size=10`,
      { method: "GET", headers: { "Authorization": `Token ${hcpKey}`, "Content-Type": "application/json" } }
    );
    res.status(r.status).json(r.body);
    return;
  }

  // Test: create estimate in HCP
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
    const r = await makeRequest(
      "https://api.housecallpro.com/estimates",
      { method: "POST", headers: { "Authorization": `Token ${hcpKey}`, "Content-Type": "application/json" } },
      body
    );
    res.status(r.status).json(r.body);
    return;
  }

  // HCP proxy for FieldGuide
  if (req.method === "POST" && req.query.action === "hcp") {
    const { endpoint, method, body } = req.body;
    const r = await makeRequest(
      `https://api.housecallpro.com${endpoint}`,
      { method: method || "POST", headers: { "Authorization": `Token ${hcpKey}`, "Content-Type": "application/json" } },
      body
    );
    res.status(r.status).json(r.body);
    return;
  }

  // Claude API
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!claudeKey) { res.status(500).json({ error: "Missing API key" }); return; }
  try {
    const r = await makeRequest(
      "https://api.anthropic.com/v1/messages",
      { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": claudeKey, "anthropic-version": "2023-06-01" } },
      req.body
    );
    res.status(200).json(r.body);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};

