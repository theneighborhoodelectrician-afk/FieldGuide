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
      const endpoint = url.searchParams.get("endpoint");
      if (!endpoint) {
        res.status(400).json({ error: "Missing endpoint" });
        return;
      }

      try {
        const r = await makeRequest(
          `https://api.housecallpro.com${endpoint}`,
          {
            method: "GET",
            headers: {
              "Authorization": `Token ${hcpKey}`,
              "Content-Type": "application/json"
            }
          }
        );
        res.status(r.status).json(r.body);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
      return;
    }

    if (req.method === "GET" && action === "unsplash") {
      const query = url.searchParams.get("q") || "electrical work finished";
      try {
        const r = await makeRequest(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=12&orientation=landscape`,
          {
            method: "GET",
            headers: { "Authorization": `Client-ID ${unsplashKey}` }
          }
        );
        res.status(200).json(r.body);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
      return;
    }

    if (req.method === "POST" && action === "attach_photo") {
      const { imageUrl, estimateOptionId, caption } = req.body || {};

      try {
        const { buffer, contentType } = await followRedirects(imageUrl);

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const folder = "fieldguide/estimates";
        const sigStr = `folder=${folder}&timestamp=${timestamp}${cloudSecret}`;
        const signature = crypto.createHash("sha1").update(sigStr).digest("hex");
        const boundary = "FGboundary" + Date.now();

        const parts = [];
        const addField = (name, value) => {
          parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
        };

        addField("api_key", cloudKey);
        addField("timestamp", timestamp);
        addField("folder", folder);
        addField("signature", signature);
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.jpg"\r\nContent-Type: ${contentType}\r\n\r\n`));
        parts.push(buffer);
        parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
        const formData = Buffer.concat(parts);

        const uploadRes = await new Promise((resolve, reject) => {
          const urlObj = new URL(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);
          const reqOpts = {
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            method: "POST",
            headers: {
              "Content-Type": `multipart/form-data; boundary=${boundary}`,
              "Content-Length": formData.length,
            }
          };

          const req2 = https.request(reqOpts, (r2) => {
            const chunks = [];
            r2.on("data", (c) => chunks.push(c));
            r2.on("end", () => {
              try {
                resolve(JSON.parse(Buffer.concat(chunks).toString()));
              } catch {
                resolve({});
              }
            });
          });

          req2.on("error", reject);
          req2.write(formData);
          req2.end();
        });

        if (!uploadRes.secure_url) {
          res.status(500).json({ error: "Cloudinary upload failed", detail: uploadRes });
          return;
        }

        const hcpRes = await makeRequest(
  `https://api.housecallpro.com/estimate_options/${estimateOptionId}/attachments`,
  {
    method: "POST",
    headers: {
      "Authorization": `Token ${hcpKey}`,
      "Content-Type": "application/json"
    }
  },
  { url: uploadRes.secure_url, description: caption || "" }
);

if (hcpRes.status < 200 || hcpRes.status >= 300) {
  res.status(hcpRes.status).json({
    error: "HCP attachment failed",
    cloudinaryUrl: uploadRes.secure_url,
    hcp: hcpRes.body
  });
  return;
}

res.status(200).json({
  cloudinaryUrl: uploadRes.secure_url,
  hcp: hcpRes.body
});

      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    if (!claudeKey) {
      res.status(500).json({ error: "Missing API key" });
      return;
    }

    try {
      const r = await makeRequest(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": claudeKey,
            "anthropic-version": "2023-06-01"
          }
        },
        req.body
      );
      res.status(200).json(r.body);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
};
