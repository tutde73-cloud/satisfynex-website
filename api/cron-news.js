import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ngysrsypmieuvucqupgd.supabase.co';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE;
    const geminiKey = process.env.GEMINI_API;

    if (!supabaseServiceKey || !geminiKey) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE or GEMINI_API environment variables in Vercel.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Ambil RSS CNBC secara langsung menggunakan fetch standar (Tanpa parser eksternal)
    const rssRes = await fetch('https://search.cnbc.com/rs/search/combined/rss/cnbcnews?id=15839069');
    const rssText = await rssRes.text();

    // Ekstraksi sederhana item XML menggunakan string splitting/regex aman
    const itemMatches = rssText.match(/<item>([\s\S]*?)<\/item>/g) || [];
    const latestItems = itemMatches.slice(0, 3);
    let insertedCount = 0;

    for (const rawItem of latestItems) {
      try {
        const getTagContent = (xml, tag) => {
          const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'));
          if (!match) return '';
          return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
        };

        const title = getTagContent(rawItem, 'title');
        const link = getTagContent(rawItem, 'link');
        const description = getTagContent(rawItem, 'description');

        if (!link || !title) continue;

        // Cek duplikasi di Supabase
        const { data: existing } = await supabase
          .from('news')
          .select('id')
          .eq('source_url', link)
          .maybeSingle();

        if (existing) continue;

        const geminiPrompt = `Rewrite this financial news into short Indonesian JSON. 
Title: ${title}
Content: ${description.slice(0, 400)}

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

        const { error: insertError } = await supabase.from('news').insert([
          {
            title: aiContent.title || title,
            summary: aiContent.summary || description,
            analysis: aiContent.analysis || '',
            category: aiContent.category || 'Market Insights',
            image_url: imageUrl,
            source_url: link,
            source_name: 'CNBC Financial',
            created_at: new Date().toISOString()
          }
        ]);

        if (!insertError) insertedCount++;

      } catch (innerErr) {
        console.error("Item loop error:", innerErr);
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: `Berhasil menambahkan ${insertedCount} berita baru.` 
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "Server error" });
  }
}
