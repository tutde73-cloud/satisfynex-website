
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

function cleanSlug(value) {
  let slug = String(value ?? "").trim();

  // Jika kolom slug berisi URL lengkap, ambil bagian path saja.
  if (/^https?:\/\//i.test(slug)) {
    try {
      slug = new URL(slug).pathname;
    } catch {
      return "";
    }
  }

  slug = slug.split(/[?#]/)[0];
  slug = slug.replace(/^\/+|\/+$/g, "");
  slug = slug.replace(/^articles\//i, "");

  // Tolak nilai yang masih mengandung URL/domain.
  if (/https?:|www\.|satisfynex\.com/i.test(slug)) {
    return "";
  }

  return slug;
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
      throw new Error(`Supabase returned HTTP ${response.status}`);
    }

    const articles = await response.json();
    const seen = new Set();

    const entries = articles
      .map(article => {
        const slug = cleanSlug(article.slug);

        if (!slug || seen.has(slug)) return "";
        seen.add(slug);

        const lastmod = article.updated_at || article.created_at;
        const safeDate = lastmod && !Number.isNaN(Date.parse(lastmod))
          ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>`
          : "";

        return `
  <url>
    <loc>${escapeXml(`${SITE_URL}/articles/${encodeURIComponent(slug)}`)}</loc>
    ${safeDate}
  </url>`;
      })
      .filter(Boolean)
      .join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
  </url>${entries}
</urlset>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).send(xml);
  } catch (error) {
    console.error("Sitemap generation failed:", error);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(500).send("Sitemap generation failed. Check Vercel function logs.");
  }
}
