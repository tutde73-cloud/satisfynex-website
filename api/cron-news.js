import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Paksa agar header selalu merespons JSON murni
  res.setHeader('Content-Type', 'application/json');

  try {
    const supabaseUrl = 'https://ngysrsypmieuvucqupgd.supabase.co';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE;
    const geminiApiKey = process.env.GEMINI_API;

    if (!serviceRoleKey) {
      return res.status(500).json({ success: false, error: "ENV Error: SUPABASE_SERVICE_ROLE belum disetel di Vercel." });
    }
    if (!geminiApiKey) {
      return res.status(500).json({ success: false, error: "ENV Error: GEMINI_API belum disetel di Vercel." });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Ambil data RSS CNBC
    const rssRes = await fetch('https://search.cnbc.com/rs/search/combined/rss/cnbcnews?id=15839069');
    if (!rssRes.ok) {
      return res.status(500).json({ success: false, error: `Gagal ambil RSS: ${rssRes.status}` });
    }
    
    const rssText = await rssRes.text();
    const itemMatches = rssText.match(/<item>([\s\S]*?)<\/item>/g) || [];
    
    if (itemMatches.length === 0) {
      return res.status(500).json({ success: false, error: "Format RSS CNBC kosong atau tidak valid." });
    }

    const rawItem = itemMatches[0]; // Uji coba 1 item dulu
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

    // Panggil Gemini AI
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
      return res.status(500).json({ success: false, error: `Gemini API Error: ${geminiData.error.message}` });
    }

    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let aiContent = {
      title: title,
      summary: description || "Market update.",
      analysis: "Market impact analysis.",
      category: "Market Insights",
      search_query: "stock market"
    };

    try {
      let clean = rawText.trim();
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        aiContent = JSON.parse(clean.substring(start, end + 1));
      }
    } catch (e) {}

    // Simpan ke Supabase tabel 'news'
    const { error: insertErr } = await supabase.from('news').insert([
      {
        title: aiContent.title || title,
        summary: aiContent.summary || description,
        analysis: aiContent.analysis || '',
        category: aiContent.category || 'Market Insights',
        image_url: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=800&q=80',
        source_url: link,
        source_name: 'CNBC Financial',
        created_at: new Date().toISOString()
      }
    ]);

    if (insertErr) {
      return res.status(500).json({ success: false, error: `Supabase Insert Error: ${insertErr.message}` });
    }

    return res.status(200).json({ success: true, message: "Berhasil memproses 1 berita baru via AI." });

  } catch (err) {
    return res.status(500).json({ success: false, error: "Runtime Crash: " + (err.message || String(err)) });
  }
}
