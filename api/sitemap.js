const SITE_URL = "https://www.satisfynex.com";
const SUPABASE_URL = "https://ngysrsypmieuvucqupgd.supabase.co";
const SUPABASE_KEY = "sb_publishable_U05M_WQFKioCZ1LNSfyNbQ_jUoJTQvd";

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default async function handler(req, res) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/articles?select=slug,updated_at,created_at&status=eq.published&order=created_at.desc`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Supabase HTTP ${response.status}`);
    }

    const articles = await response.json();
    const seen = new Set();
    const urls = [];

    // Homepage
    urls.push(`
  <url>
    <loc>${SITE_URL}/</loc>
  </url>`);

    for (const article of articles) {
      if (!article.slug) continue;

      // Bersihkan slug dari karakter tak terduga
      let cleanSlug = String(article.slug)
        .trim()
        .replace(/^\/+|\/+$/g, "")
        .replace(/^articles\//i, "");

      if (!cleanSlug || seen.has(cleanSlug)) continue;
      seen.add(cleanSlug);

      const loc = `${SITE_URL}/articles/${encodeURIComponent(cleanSlug)}`;
      const date = article.updated_at || article.created_at;

      let lastmod = "";
      if (date && !Number.isNaN(Date.parse(date))) {
        lastmod = `\n    <lastmod>${new Date(date).toISOString()}</lastmod>`;
      }

      urls.push(`
  <url>
    <loc>${escapeXml(loc)}</loc>${lastmod}
  </url>`);
    }

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.join("\n") +
      "\n</urlset>";

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/xml; charset=UTF-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");

    return res.end(xml);
  } catch (error) {
    console.error("Sitemap generation failed:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=UTF-8");
    return res.end("Sitemap generation failed.");
  }
}
