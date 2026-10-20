
const SUPABASE_URL = "https://ngysrsypmieuvucqupgd.supabase.co";
const SUPABASE_KEY = "sb_publishable_U05M_WQFKioCZ1LNSfyNbQ_jUoJTQvd";
const SITE_URL = "https://satisfynex.com";

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

module.exports = async function handler(req, res) {
  try {
    const response = await fetch(
      SUPABASE_URL +
      "/rest/v1/articles?select=title,slug,updated_at,created_at&status=eq.published&order=created_at.desc",
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY
        }
      }
    );

    if (!response.ok) {
      throw new Error("Supabase HTTP " + response.status);
    }

    const articles = await response.json();
    const urls = new Map();

    urls.set(SITE_URL + "/", "");

    for (const article of articles) {
      const slug = slugify(article.slug || article.title);
      if (!slug) continue;

      const url = SITE_URL + "/articles/" + encodeURIComponent(slug);
      const date = article.updated_at || article.created_at || "";
      urls.set(url, date);
    }

    const entries = [...urls.entries()].map(([url, date]) => {
      let lastmod = "";

      if (date) {
        const timestamp = new Date(date);
        if (!Number.isNaN(timestamp.getTime())) {
          lastmod =
            "<lastmod>" +
            timestamp.toISOString().slice(0, 10) +
            "</lastmod>";
        }
      }

      return "<url><loc>" + escapeXml(url) + "</loc>" +
        lastmod + "</url>";
    }).join("");

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      entries +
      "</urlset>";

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).send(xml);
  } catch (error) {
    console.error(error);
    return res.status(500).send("Unable to generate sitemap");
  }
};
