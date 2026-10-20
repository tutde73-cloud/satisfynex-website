
const SUPABASE_URL = "https://ngysrsypmieuvucqupgd.supabase.co";
const SUPABASE_KEY = "sb_publishable_U05M_WQFKioCZ1LNSfyNbQ_jUoJTQvd";
const SITE_URL = "https://www.satisfynex.com";

function cleanSlug(value) {
  if (!value) return "";

  let slug = String(value).trim();

  // Jika slug ternyata URL lengkap, ambil bagian slug artikelnya saja.
  if (/^https?:\/\//i.test(slug)) {
    try {
      slug = new URL(slug).pathname;
    } catch {
      return "";
    }
  }

  // Hilangkan awalan /articles/ jika tersimpan dalam database.
  slug = slug.replace(/^\/+/, "");
  slug = slug.replace(/^articles\//i, "");
  slug = slug.split(/[?#]/)[0];
  slug = slug.replace(/\/+$/, "");

  // Tolak slug yang masih mengandung protokol atau domain.
  if (!slug || /https?:|satisfynex\.com/i.test(slug)) {
    return "";
  }

  return slug;
}

function xmlEscape(value) {
  return String(value).replace(/[<>&'"]/g, char => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;"
  })[char]);
}

module.exports = async (req, res) => {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/articles?select=title,slug,created_at,status&status=eq.published&order=created_at.desc`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Supabase returned ${response.status}`);
    }

    const articles = await response.json();
    const urls = new Map();

    urls.set(
      `${SITE_URL}/`,
      `<url><loc>${xmlEscape(SITE_URL)}/</loc></url>`
    );

    for (const article of articles) {
      const slug = cleanSlug(article.slug || article.title);
      if (!slug) continue;

      const loc = `${SITE_URL}/articles/${slug}`;

      urls.set(
        loc,
        `<url><loc>${xmlEscape(loc)}</loc>${
          article.created_at
            ? `<lastmod>${new Date(article.created_at).toISOString()}</lastmod>`
            : ""
        }</url>`
      );
    }

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      [...urls.values()].join("") +
      "</urlset>";

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(xml);
  } catch (error) {
    console.error("Sitemap error:", error);
    return res.status(500).send("Sitemap generation failed");
  }
};
