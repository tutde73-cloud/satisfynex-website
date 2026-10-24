import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ngysrsypmieuvucqupgd.supabase.co';

export default async function handler(req, res) {
  // Paksa header selalu mengembalikan JSON agar frontend tidak pernah gagal baca
  res.setHeader('Content-Type', 'application/json');

  try {
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE;
    const geminiKey = process.env.GEMINI_API;

    // Periksa apakah Environment Variables tersedia
    if (!supabaseServiceKey) {
      throw new Error("Environment variable SUPABASE_SERVICE_ROLE kosong atau belum disetel di Vercel!");
    }
    if (!geminiKey) {
      throw new Error("Environment variable GEMINI_API kosong atau belum disetel di Vercel!");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Test koneksi fetch RSS
    const rssRes = await fetch('https://search.cnbc.com/rs/search/combined/rss/cnbcnews?id=15839069');
    if (!rssRes.ok) {
      throw new Error(`Gagal mengambil RSS CNBC dengan status HTTP: ${rssRes.status}`);
    }
    const rssText = await rssRes.text();

    const itemMatches = rssText.match(/<item>([\s\S]*?)<\/item>/g) || [];
    if (itemMatches.length === 0) {
      throw new Error("Format RSS CNBC berubah atau tidak ada item ditemukan.");
    }

    const latestItems = itemMatches.slice(0, 1); // Coba 1 item dulu untuk uji coba
    let insertedCount = 0;

    for (const rawItem of latestItems) {
      const getTagContent = (xml, tag) => {
        const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'));
        if (!match) return '';
        return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
      };

      const title = getTagContent(rawItem, 'title');
      const link = getTagContent(rawItem, 'link');
      const description = getTagContent(rawItem, 'description');

      if (!link || !title) continue;

      // Kirim request ke Gemini API
      const geminiPrompt = `Rewrite this financial news into short Indonesian JSON. 
Title: ${title}
Content: ${description.slice(0, 300)}

Output ONLY valid JSON keys: title, summary, analysis, category, search_query. No markdown.`;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: geminiPrompt }] }]
          })
        }
      );

      const geminiData = await geminiRes.json();
      if (geminiData.error) {
        throw new Error(`Gemini API Error: ${geminiData.error.message || JSON.stringify(geminiData.error)}`);
      }

      const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      let aiContent = {
        title: title,
        summary: description || "Market update summary.",
        analysis: "Financial market impact analysis.",
        category: "Market Insights",
        search_query: "stock market trading"
      };

      if (rawText) {
        try {
          let cleanText = rawText.trim();
          const firstBrace = cleanText.indexOf('{');
          const lastBrace = cleanText.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanText = cleanText.substring(firstBrace, lastBrace + 1);
          }
          aiContent = JSON.parse(cleanText);
        } catch (e) {}
      }

      // Simpan ke Supabase tabel 'news'
      const { error: insertError } = await supabase.from('news').insert([
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

      if (insertError) {
        throw new Error(`Supabase Insert Error: ${insertError.message} (Pastikan tabel 'news' sudah dibuat di Supabase dengan kolom yang sesuai!)`);
      }

      insertedCount++;
    }

    return res.status(200).json({ 
      success: true, 
      message: `Berhasil menambahkan ${insertedCount} berita baru.` 
    });

  } catch (error) {
    // Tangkap error secara persis dan kirim balik ke frontend agar tampil di tombol admin
    console.error("CRON ERROR TRACE:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || "Unknown server error occurred" 
    });
  }
}
