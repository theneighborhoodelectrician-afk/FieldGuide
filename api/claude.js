module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  // Test HCP connection
  if (req.method === "GET" && req.query.test === "hcp") {
    const hcpKey = process.env.HCP_API_KEY;
    try {
      const response = await fetch("https://api.housecallpro.com/customers/cus_cfacd2dadced4393b04205554d6615cc", {
        headers: {
          "Authorization": `Token ${hcpKey}`,
          "Content-Type": "application/json",
        },
      });
      const data = await response.json();
      res.status(200).json({ status: response.status, data });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  // Claude API
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ error: "Missing API key" }); return; }
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
