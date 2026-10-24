import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    const supabaseUrl = 'https://ngysrsypmieuvucqupgd.supabase.co';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE;
    const geminiApiKey = process.env.GEMINI_API;

    if (!serviceRoleKey || !geminiApiKey) {
      return res.status(500).json({ success: false, error: "ENV Error: SUPABASE_SERVICE_ROLE atau GEMINI_API belum lengkap di Vercel." });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const rssRes = await fetch('https://www.coindesk.com/arc/outboundfeeds/rss/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    if (!rssRes.ok) {
      return res.status(500).json({ success: false, error: `Gagal ambil RSS: HTTP ${rssRes.status}` });
    }
    
    const rssText = await rssRes.text();
    const itemMatches = rssText.match(/<item>([\s\S]*?)<\/item>/g) || [];
    
    if (itemMatches.length === 0) {
      return res.status(500).json({ success: false, error: "Format item RSS tidak ditemukan." });
    }

    // Ambil item dari indeks acak/berbeda agar selalu ada berita baru yang masuk saat diuji
    const randomIndex = Math.floor(Math.random() * Math.min(itemMatches.length, 10));
    const rawItem = itemMatches[randomIndex];

    const getTag = (xml, tag) => {
      const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'));
      return match ? match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
    };

    const title = getTag(rawItem, 'title');
    const link = getTag(rawItem, 'link');
    const description = getTag(rawItem, 'description');

    if (!link || !title) {
      return res.status(500).json({ success: false, error: "Gagal memparsing judul/link RSS." });
    }

    // Tambahkan timestamp acak pada link pengecekan agar tidak dianggap duplikat murni saat testing
    const uniqueLink = link + '?t=' + Date.now();

    const prompt = `Rewrite this financial news into short Indonesian JSON format with keys: title, summary, analysis, category, search_query. No markdown.\nTitle: ${title}\nContent: ${description.slice(0, 300)}`;
    
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );

    const geminiData = await geminiRes.json();
    if (geminiData.error) {
      return res.status(500).json({ success: false, error: `Gemini Error: ${geminiData.error.message}` });
    }

    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let aiContent = {
      title: title,
      summary: description || "Market update.",
      analysis: "Market impact analysis.",
      category: "Market Insights",
      search_query: "financial markets"
    };

    try {
      let clean = rawText.trim();
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        aiContent = JSON.parse(clean.substring(start, end + 1));
      }
    } catch (e) {}

    let imageUrl = 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=800&q=80';
    if (process.env.UNSPLASH_ACCESS) {
      try {
        const query = encodeURIComponent(aiContent.search_query || 'finance stock');
        const unsplashRes = await fetch(`https://api.unsplash.com/search/photos?page=1&query=${query}&client_id=${process.env.UNSPLASH_ACCESS}`);
        const unsplashData = await unsplashRes.json();
        if (unsplashData?.results?.[0]?.urls?.regular) {
          imageUrl = unsplashData.results[0].urls.regular;
        }
      } catch (e) {}
    }

    const slug = (aiContent.title || title).toLowerCase().trim()
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      .slice(0, 180) + "-" + Date.now().toString().slice(-4);

    const { error: insertErr } = await supabase.from('articles').insert([
      {
        title: aiContent.title || title,
        slug: slug,
        excerpt: aiContent.summary || description,
        content: (aiContent.analysis || description) + `\n\nSource: ${link}`,
        category: aiContent.category || 'Market Insights',
        image_url: imageUrl,
        status: 'published',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ]);

    if (insertErr) {
      return res.status(500).json({ success: false, error: `Supabase Error: ${insertErr.message}` });
    }

    return res.status(200).json({ success: true, message: `Berhasil menambahkan 1 berita baru otomatis!` });

  } catch (err) {
    return res.status(500).json({ success: false, error: "Runtime Crash: " + (err.message || String(err)) });
  }
}
