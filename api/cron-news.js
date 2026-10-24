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

    // Mengambil RSS Yahoo Finance melalui AllOrigins Proxy
    const targetRssUrl = 'https://finance.yahoo.com/news/rssindex';
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetRssUrl)}`;

    const proxyRes = await fetch(proxyUrl);
    if (!proxyRes.ok) {
      return res.status(500).json({ success: false, error: `Gagal mengakses Proxy RSS: HTTP ${proxyRes.status}` });
    }
    
    const proxyData = await proxyRes.json();
    // AllOrigins menyimpan teks RSS di dalam properti .contents
    let rssText = proxyData.contents;
    
    if (!rssText) {
      return res.status(500).json({ success: false, error: "Konten RSS dari proxy kosong." });
    }

    // Jika contents berupa string JSON yang terenkripsi/ter-escape, parsing dulu jika perlu
    if (typeof rssText === 'string' && rssText.startsWith('"') && rssText.endsWith('"')) {
      try { rssText = JSON.parse(rssText); } catch(e) {}
    }

    const itemMatches = rssText.match(/<item>([\s\S]*?)<\/item>/g) || [];
    
    if (itemMatches.length === 0) {
      return res.status(500).json({ success: false, error: "Format item RSS tidak ditemukan dalam teks proxy." });
    }

    const latestItems = itemMatches.slice(0, 3); // Ambil 3 berita teratas
    let insertedCount = 0;

    for (const rawItem of latestItems) {
      const getTag = (xml, tag) => {
        const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'));
        return match ? match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
      };

      const title = getTag(rawItem, 'title');
      const link = getTag(rawItem, 'link');
      const description = getTag(rawItem, 'description');

      if (!link || !title) continue;

      // Cek duplikasi di Supabase
      const { data: existing } = await supabase
        .from('news')
        .select('id')
        .eq('source_url', link)
        .maybeSingle();

      if (existing) continue;

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
      if (geminiData.error) continue;

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

      // Ambil gambar Unsplash jika ada tokennya
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

      // Simpan ke Supabase tabel 'news'
      const { error: insertErr } = await supabase.from('news').insert([
        {
          title: aiContent.title || title,
          summary: aiContent.summary || description,
          analysis: aiContent.analysis || '',
          category: aiContent.category || 'Market Insights',
          image_url: imageUrl,
          source_url: link,
          source_name: 'Yahoo Finance',
          created_at: new Date().toISOString()
        }
      ]);

      if (!insertErr) {
        insertedCount++;
      }
    }

    return res.status(200).json({ success: true, message: `Berhasil menambahkan ${insertedCount} berita baru.` });

  } catch (err) {
    return res.status(500).json({ success: false, error: "Runtime Crash: " + (err.message || String(err)) });
  }
}
