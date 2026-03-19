const { v2: cloudinary } = require("cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

function buildLabel(publicId) {
  const fileName = publicId.split("/").pop() || publicId;
  const withoutPrefix = fileName.replace(/^\d+[-_ ]*/, "");
  return withoutPrefix
    .replace(/[-_]+/g, " ")
    .replace(/\.[^.]+$/, "")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const folder = "Estimate Pics";

  try {
    const result = await cloudinary.api.resources({
      type: "upload",
      resource_type: "image",
      prefix: `${folder}/`,
      max_results: 100
    });

    const photos = (result.resources || [])
      .slice()
      .sort((a, b) => a.public_id.localeCompare(b.public_id, undefined, { numeric: true }))
      .map((asset) => ({
        id: asset.asset_id || asset.public_id,
        public_id: asset.public_id,
        label: buildLabel(asset.public_id),
        url: asset.secure_url,
        thumb: cloudinary.url(asset.public_id, {
          secure: true,
          resource_type: "image",
          type: "upload",
          transformation: [
            { width: 800, height: 600, crop: "fill", gravity: "auto" },
            { quality: "auto", fetch_format: "auto" }
          ]
        })
      }));

    return res.status(200).json({ photos });
  } catch (error) {
    console.error("estimate-photos error", error);
    return res.status(500).json({ error: "Failed to load Cloudinary photos" });
  }
};
