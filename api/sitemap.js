const SITE_URL = "https://satisfynex.com"; // Disamakan dengan robots.txt (tanpa www)
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

    // Tentukan tanggal update terbaru untuk Homepage dari artikel paling baru
    const latestArticleDate = articles.length > 0 ? (articles[0].updated_at || articles[0].created_at) : new Date().toISOString();
    const homepageLastMod = latestArticleDate && !Number.isNaN(Date.parse(latestArticleDate))
      ? `\n    <lastmod>${new Date(latestArticleDate).toISOString()}</lastmod>`
      : "";

    // 1. Homepage dengan lastmod dinamis
    urls.push(`
  <url>
    <loc>${SITE_URL}/</loc>${homepageLastMod}
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`);

    // 2. Daftar Artikel
    for (const article of articles) {
      if (!article.slug) continue;

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
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
    }

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.join("\n") +
      "\n</urlset>";

    // Mencegah simpanan cache di Vercel/Browser agar selalu realtime
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/xml; charset=UTF-8");
    res.setHeader("Cache-Control", "s-maxage=0, max-age=0, must-revalidate, no-cache, no-store");

    return res.end(xml);
  } catch (error) {
    console.error("Sitemap generation failed:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=UTF-8");
    return res.end("Sitemap generation failed.");
  }
}
