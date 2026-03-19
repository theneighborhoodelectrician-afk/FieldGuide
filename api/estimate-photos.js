const { v2: cloudinary } = require("cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

function buildLabel(asset) {
  const source = asset.filename || asset.public_id || "";
  const withoutPrefix = source.replace(/^\d+[-_ ]*/, "");
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

  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    return res.status(500).json({ error: "Missing Cloudinary environment variables" });
  }

  try {
    const result = await cloudinary.search
      .expression(`asset_folder="${folder}" AND resource_type:image`)
      .sort_by("filename", "asc")
      .max_results(100)
      .execute();

    const photos = (result.resources || []).map((asset) => ({
      id: asset.asset_id || asset.public_id,
      public_id: asset.public_id,
      label: buildLabel(asset),
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
    return res.status(500).json({
      error: "Failed to load Cloudinary photos",
      details: error.message
    });
  }
};
