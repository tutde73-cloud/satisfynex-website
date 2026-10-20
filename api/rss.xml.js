export default async function handler(req, res) {
  const SUPABASE_URL = "https://ngysrsypmieuvucqupgd.supabase.co";
  const SUPABASE_KEY = "sb_publishable_U05M_WQFKioCZ1LNSfyNbQ_jUoJTQvd";
  const SITE_URL = "https://www.satisfynex.com";

  try {
    // Ambil 20 artikel terbaru dari Supabase REST API
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/articles?select=title,slug,excerpt,created_at,status&order=created_at.desc&limit=20`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Supabase error: ${response.statusText}`);
    }

    const allArticles = await response.json();
    
    // Filter artikel yang published (toleransi huruf besar/kecil)
    const articles = (allArticles || []).filter(a => !a.status || a.status.toLowerCase() === 'published');

    const itemsXml = articles.map(article => `
    <item>
      <title><![CDATA[${article.title || ''}]]></title>
      <link>${SITE_URL}/articles/${article.slug}</link>
      <guid isPermaLink="true">${SITE_URL}/articles/${article.slug}</guid>
      <pubDate>${new Date(article.created_at).toUTCString()}</pubDate>
      <description><![CDATA[${article.excerpt || ''}]]></description>
    </item>`).join('');

    const rssXml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Satisfynex Global Stock Research</title>
    <link>${SITE_URL}</link>
    <description>US Stock Market Technical Analysis and Market Insights</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    ${itemsXml}
  </channel>
</rss>`;

    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    // UBAH: Matikan Cache Vercel agar RSS selalu menyajikan data paling gres dari Supabase
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(200).send(rssXml);
  } catch (err) {
    console.error("RSS Error:", err);
    return res.status(500).send("Error generating RSS feed: " + err.message);
  }
}
