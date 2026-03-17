const https = require("https");
const http  = require("http");

function makeRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const urlObj  = new URL(url);
    const lib     = urlObj.protocol === "https:" ? https : http;
    const reqOpts = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   options.method || "GET",
      headers:  options.headers || {},
    };
    const req = lib.request(reqOpts, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        try   { resolve({ status: res.statusCode, body: JSON.parse(buf.toString()), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, body: buf.toString(), headers: res.headers }); }
      });
    });
    req.on("error", reject);
    if (body) {
      if (Buffer.isBuffer(body)) req.write(body);
      else req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// Fetch a remote URL and return as buffer
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const lib    = urlObj.protocol === "https:" ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchBuffer(res.headers.location).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers["content-type"] || "image/jpeg" }));
    }).on("error", reject);
  });
}

// Build multipart form data
function buildMultipart(fields, boundary) {
  const parts = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value && value.buffer) {
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"; filename="photo.jpg"\r\nContent-Type: ${value.contentType || "image/jpeg"}\r\n\r\n`
      );
      parts.push(value.buffer);
      parts.push("\r\n");
    } else {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`);
    }
  }
  parts.push(`--${boundary}--\r\n`);
  return Buffer.concat(parts.map(p => Buffer.isBuffer(p) ? p : Buffer.from(p)));
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const hcpKey      = process.env.HCP_API_KEY;
  const claudeKey   = process.env.ANTHROPIC_API_KEY;
  const cloudName   = process.env.CLOUDINARY_CLOUD_NAME;
  const cloudKey    = process.env.CLOUDINARY_API_KEY;
  const cloudSecret = process.env.CLOUDINARY_API_SECRET;

  // ── HCP proxy ─────────────────────────────────────────────────
  if (req.method === "POST" && req.query.action === "hcp") {
    const { endpoint, method, body } = req.body;
    try {
      const r = await makeRequest(
        `https://api.housecallpro.com${endpoint}`,
        { method: method||"GET", headers: { "Authorization": `Token ${hcpKey}`, "Content-Type": "application/json" } },
        body || null
      );
      res.status(r.status).json(r.body);
    } catch(e) { res.status(500).json({ error: e.message }); }
    return;
  }

  // ── Upload image URL to Cloudinary, then attach to HCP estimate option ──
  if (req.method === "POST" && req.query.action === "attach_photo") {
    const { imageUrl, estimateOptionId, caption } = req.body;
    try {
      // 1. Fetch the image
      const { buffer, contentType } = await fetchBuffer(imageUrl);

      // 2. Upload to Cloudinary
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const folder    = "fieldguide";
      const crypto    = require("crypto");
      const sigString = `folder=${folder}&timestamp=${timestamp}${cloudSecret}`;
      const signature = crypto.createHash("sha1").update(sigString).digest("hex");

      const boundary  = "----FormBoundary" + Math.random().toString(36).slice(2);
      const formData  = buildMultipart({
        file:      { buffer, contentType },
        api_key:   cloudKey,
        timestamp,
        folder,
        signature,
      }, boundary);

      const uploadRes = await makeRequest(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: "POST", headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": formData.length } },
        formData
      );

      if (uploadRes.status !== 200) {
        res.status(500).json({ error: "Cloudinary upload failed", detail: uploadRes.body });
        return;
      }

      const cloudinaryUrl = uploadRes.body.secure_url;

      // 3. Attach to HCP estimate option
      const hcpRes = await makeRequest(
        `https://api.housecallpro.com/estimate_options/${estimateOptionId}/attachments`,
        { method: "POST", headers: { "Authorization": `Token ${hcpKey}`, "Content-Type": "application/json" } },
        { url: cloudinaryUrl, description: caption || "" }
      );

      res.status(200).json({ cloudinaryUrl, hcp: hcpRes.body });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  // ── Unsplash search proxy ─────────────────────────────────────
  if (req.method === "GET" && req.query.action === "unsplash") {
    const query = req.query.q || "electrical work";
    try {
      const r = await makeRequest(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=12&orientation=landscape`,
        { method: "GET", headers: { "Authorization": "Authorization": `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`
      );
      res.status(200).json(r.body);
    } catch(e) { res.status(500).json({ error: e.message }); }
    return;
  }

  // ── Claude API ────────────────────────────────────────────────
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!claudeKey) { res.status(500).json({ error: "Missing API key" }); return; }
  try {
    const r = await makeRequest(
      "https://api.anthropic.com/v1/messages",
      { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": claudeKey, "anthropic-version": "2023-06-01" } },
      req.body
    );
    res.status(200).json(r.body);
  } catch(e) { res.status(500).json({ error: e.message }); }
};
