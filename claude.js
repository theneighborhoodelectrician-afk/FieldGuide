const https = require("https");
const http = require("http");
const crypto = require("crypto");

function makeRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const lib = urlObj.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: options.method || "GET",
        headers: options.headers || {}
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString();
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      }
    );

    req.on("error", reject);

    if (body) {
      const data = typeof body === "string" ? body : JSON.stringify(body);
      req.write(data);
    }

    req.end();
  });
}

function followRedirects(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const lib = urlObj.protocol === "https:" ? https : http;

    lib.get(url, (res) => {
      if (
        (res.statusCode === 301 || res.statusCode === 302) &&
        res.headers.location &&
        maxRedirects > 0
      ) {
        followRedirects(res.headers.location, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }

      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: res.headers["content-type"] || "image/jpeg"
        });
      });
    }).on("error", reject);
  });
}

function parseAction(req) {
  try {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get("action");
  } catch {
    return null;
  }
}

function parseEndpoint(req) {
  try {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get("endpoint");
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const action = parseAction(req);

  const hcpKey = process.env.HCP_API_KEY;
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const cloudKey = process.env.CLOUDINARY_API_KEY;
  const cloudSecret = process.env.CLOUDINARY_API_SECRET;
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;

  try {
    if (req.method === "POST" && action === "hcp") {
      const { endpoint, method, body } = req.body || {};

      if (!endpoint) {
        res.status(400).json({ error: "Missing endpoint" });
        return;
      }

      const hcpRes = await makeRequest(
        `https://api.housecallpro.com${endpoint}`,
        {
          method: method || "GET",
          headers: {
            Authorization: `Token ${hcpKey}`,
            "Content-Type": "application/json"
          }
        },
        body || null
      );

      res.status(hcpRes.status || 500).json(hcpRes.body);
      return;
    }

    if (req.method === "GET" && action === "hcp_test") {
      const endpoint = parseEndpoint(req);

      if (!endpoint) {
        res.status(400).json({ error: "Missing endpoint" });
        return;
      }

      const hcpRes = await makeRequest(`https://api.housecallpro.com${endpoint}`, {
        method: "GET",
        headers: {
          Authorization: `Token ${hcpKey}`,
          "Content-Type": "application/json"
        }
      });

      res.status(hcpRes.status || 500).json(hcpRes.body);
      return;
    }

    if (req.method === "GET" && action === "unsplash") {
      if (!unsplashKey) {
        res.status(500).json({ error: "Missing Unsplash API key" });
        return;
      }

      const url = new URL(req.url, "http://localhost");
      const query = url.searchParams.get("q") || "electrical work finished";

      const unsplashRes = await makeRequest(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=12&orientation=landscape`,
        {
          method: "GET",
          headers: {
            Authorization: `Client-ID ${unsplashKey}`
          }
        }
      );

      res.status(unsplashRes.status || 500).json(unsplashRes.body);
      return;
    }

    if (req.method === "POST" && action === "attach_photo") {
      const { imageUrl, estimateOptionId, caption } = req.body || {};

      if (!imageUrl || !estimateOptionId) {
        res.status(400).json({ error: "Missing imageUrl or estimateOptionId" });
        return;
      }

      if (!cloudName || !cloudKey || !cloudSecret) {
        res.status(500).json({ error: "Missing Cloudinary environment variables" });
        return;
      }

      const { buffer, contentType } = await followRedirects(imageUrl);

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const folder = "fieldguide/estimates";
      const signatureBase = `folder=${folder}&timestamp=${timestamp}${cloudSecret}`;
      const signature = crypto.createHash("sha1").update(signatureBase).digest("hex");
      const boundary = `FGboundary${Date.now()}`;

      const parts = [];
      const addField = (name, value) => {
        parts.push(
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
          )
        );
      };

      addField("api_key", cloudKey);
      addField("timestamp", timestamp);
      addField("folder", folder);
      addField("signature", signature);
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.jpg"\r\nContent-Type: ${contentType}\r\n\r\n`
        )
      );
      parts.push(buffer);
      parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
      const formData = Buffer.concat(parts);

      const cloudinaryUpload = await new Promise((resolve, reject) => {
        const uploadUrl = new URL(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);
        const uploadReq = https.request(
          {
            hostname: uploadUrl.hostname,
            path: uploadUrl.pathname,
            method: "POST",
            headers: {
              "Content-Type": `multipart/form-data; boundary=${boundary}`,
              "Content-Length": formData.length
            }
          },
          (uploadRes) => {
            const chunks = [];
            uploadRes.on("data", (chunk) => chunks.push(chunk));
            uploadRes.on("end", () => {
              const raw = Buffer.concat(chunks).toString();
              try {
                resolve(JSON.parse(raw));
              } catch {
                resolve({ raw });
              }
            });
          }
        );

        uploadReq.on("error", reject);
        uploadReq.write(formData);
        uploadReq.end();
      });

      if (!cloudinaryUpload.secure_url) {
        res.status(500).json({
          error: "Cloudinary upload failed",
          detail: cloudinaryUpload
        });
        return;
      }

      const hcpRes = await makeRequest(
        `https://api.housecallpro.com/estimate_options/${estimateOptionId}/attachments`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${hcpKey}`,
            "Content-Type": "application/json"
          }
        },
        {
          url: cloudinaryUpload.secure_url,
          description: caption || ""
        }
      );

      if (hcpRes.status < 200 || hcpRes.status >= 300) {
        res.status(hcpRes.status || 500).json({
          error: "HCP attachment failed",
          cloudinaryUrl: cloudinaryUpload.secure_url,
          hcp: hcpRes.body
        });
        return;
      }

      res.status(200).json({
        cloudinaryUrl: cloudinaryUpload.secure_url,
        hcp: hcpRes.body
      });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    if (!claudeKey) {
      res.status(500).json({ error: "Missing Anthropic API key" });
      return;
    }

    const claudeRes = await makeRequest(
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

    res.status(claudeRes.status || 500).json(claudeRes.body);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
};
