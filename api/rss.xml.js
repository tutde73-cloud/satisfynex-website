import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ngysrsypmieuvucqupgd.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_U05M_WQFKioCZ1LNSfyNbQ_jUoJTQvd";
const SITE_URL = "https://www.satisfynex.com";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {
  try {
    const { data: articles, error } = await supabase
      .from('articles')
      .select('title, slug, excerpt, created_at')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    const itemsXml = (articles || []).map(article => `
    <item>
      <title><![CDATA[${article.title}]]></title>
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
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).send(rssXml);
  } catch (err) {
    console.error("RSS generation error:", err);
    return res.status(500).send("Error generating RSS feed");
  }
}
