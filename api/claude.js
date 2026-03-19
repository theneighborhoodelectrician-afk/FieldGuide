const https = require("https");
const http = require("http");
const crypto = require("crypto");

function makeRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const lib = urlObj.protocol === "https:" ? https : http;
    const reqOpts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || "GET",
      headers: options.headers || {},
    };

    const req = lib.request(reqOpts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        try {
          resolve({ status: res.statusCode, body: JSON.parse(buf.toString()) });
        } catch {
          resolve({ status: res.statusCode, body: buf.toString() });
        }
      });
    });

    req.on("error", reject);

    if (body) {
      const data = typeof body === "string" ? body : JSON.stringify(body);
      req.write(data);
    }

    req.end();
  });
}

function followRedirects(url, maxRedirects) {
  return new Promise((resolve, reject) => {
    if (maxRedirects === undefined) maxRedirects = 5;
    const urlObj = new URL(url);
    const lib = urlObj.protocol === "https:" ? https : http;

    lib.get(url, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && maxRedirects > 0) {
        followRedirects(res.headers.location, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }

      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({
        buffer: Buffer.concat(chunks),
        contentType: res.headers["content-type"] || "image/jpeg"
      }));
    }).on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const action = url.searchParams.get("action");

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(200).end();
      return;
    }

    const hcpKey = process.env.HCP_API_KEY;
    const claudeKey = process.env.ANTHROPIC_API_KEY;
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const cloudKey = process.env.CLOUDINARY_API_KEY;
    const cloudSecret = process.env.CLOUDINARY_API_SECRET;
    const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;

    if (req.method === "POST" && action === "hcp") {
      const { endpoint, method, body } = req.body || {};
      try {
        const r = await makeRequest(
          `https://api.housecallpro.com${endpoint}`,
          {
            method: method || "GET",
            headers: {
              "Authorization": `Token ${hcpKey}`,
              "Content-Type": "application/json"
            }
          },
          body || null
        );
        res.status(r.status).json(r.body);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
      return;
    }

    if (req.method === "GET" && action === "hcp_test") {
      const endpoint
