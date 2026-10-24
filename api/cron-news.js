import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';

const supabaseUrl = 'https://ngysrsypmieuvucqupgd.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const parser = new Parser();

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    const feed = await parser.parseURL('https://search.cnbc.com/rs/search/combined/rss/cnbcnews?id=15839069');
    const latestItems = feed.items.slice(0, 3);
    let insertedCount = 0;

    for (const item of latestItems) {
      try {
        const itemLink = item.link || '';
        if (!itemLink) continue;

        const { data: existing } = await supabase
          .from('news')
          .select('id')
          .eq('source_url', itemLink)
          .maybeSingle();

        if (existing) continue;

        const geminiPrompt = `Rewrite this financial news into short Indonesian JSON. 
Title: ${item.title || ''}
Content: ${item.contentSnippet || item.content || ''}

Output ONLY valid JSON keys: title, summary, analysis, category, search_query. No markdown.`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API}`,
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

        // Parsing JSON tanpa Regex sama sekali (Aman dari error pattern)
        let aiContent = {
          title: item.title,
          summary: item.contentSnippet || "Market update summary.",
          analysis: "Financial market impact analysis.",
          category: "Market Insights",
          search_query: "stock market trading"
        };

        if (rawText) {
          try {
            let cleanText = rawText.trim();
            // Bersihkan pembungkus markdown menggunakan indeks string standar
            const firstBrace = cleanText.indexOf('{');
            const lastBrace = cleanText.lastIndexOf('}');
            
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              cleanText = cleanText.substring(firstBrace, lastBrace + 1);
            }
            
            aiContent = JSON.parse(cleanText);
          } catch (jsonErr) {
            // Jika gagal parse, gunakan fallback default di atas
          }
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
            title: aiContent.title || item.title,
            summary: aiContent.summary || item.contentSnippet,
            analysis: aiContent.analysis || '',
            category: aiContent.category || 'Market Insights',
            image_url: imageUrl,
            source_url: itemLink,
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
