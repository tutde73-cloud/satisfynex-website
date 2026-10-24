import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';

const supabaseUrl = '[https://ngysrsypmieuvucqupgd.supabase.co](https://ngysrsypmieuvucqupgd.supabase.co)';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const parser = new Parser();

export default async function handler(req, res) {
  try {
    // 1. Ambil Feed RSS CNBC
    const feed = await parser.parseURL('[https://search.cnbc.com/rs/search/combined/rss/cnbcnews?id=15839069](https://search.cnbc.com/rs/search/combined/rss/cnbcnews?id=15839069)');
    const latestItems = feed.items.slice(0, 3);
    let insertedCount = 0;

    for (const item of latestItems) {
      // Cek apakah berita sudah ada di database
      const { data: existing } = await supabase
        .from('news')
        .select('id')
        .eq('source_url', item.link)
        .single();

      if (existing) continue;

      // 2. Olah Konten via Gemini API
      const geminiPrompt = `
You are a financial news translator.
Rewrite this financial news item into a high-engaging, SEO-optimized summary in Indonesian.

Title: ${item.title}
Content: ${item.contentSnippet || item.content}

Return strictly a single JSON object. Do not include markdown formatting or extra text.
JSON Structure:
{
  "title": "catchy title in Indonesian",
  "summary": "concise summary paragraph in Indonesian",
  "analysis": "key financial takeaway or market impact analysis in Indonesian",
  "category": "Market Insights",
  "search_query": "stock market chart"
}
      `;

      const geminiRes = await fetch(
        `[https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=$](https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=$){process.env.GEMINI_API}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: geminiPrompt }] }]
          })
        }
      );

      const geminiData = await geminiRes.json();
      
      if (!geminiData.candidates || !geminiData.candidates[0]?.content?.parts[0]?.text) {
        console.error("Gemini API return structure invalid:", geminiData);
        continue;
      }

      let rawText = geminiData.candidates[0].content.parts[0].text;

      // EKSTRAKSI AMAN: Ambil hanya string di dalam kurung kurawal pertama { ... }
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("Could not find JSON object in Gemini response:", rawText);
        continue;
      }

      let aiContent;
      try {
        aiContent = JSON.parse(jsonMatch[0]);
      } catch (parseErr) {
        console.error("JSON Parsing failed:", parseErr.message, "Raw Text:", jsonMatch[0]);
        continue;
      }

      // 3. Cari Gambar di Unsplash (Fallback Gambar Staf jika Unsplash gagal/kosong)
      let imageUrl = '[https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=800&q=80](https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=800&q=80)';
      if (process.env.UNSPLASH_ACCESS && aiContent.search_query) {
        try {
          const unsplashRes = await fetch(
            `[https://api.unsplash.com/search/photos?page=1&query=$](https://api.unsplash.com/search/photos?page=1&query=$){encodeURIComponent(aiContent.search_query)}&client_id=${process.env.UNSPLASH_ACCESS}`
          );
          const unsplashData = await unsplashRes.json();
          if (unsplashData.results && unsplashData.results.length > 0) {
            imageUrl = unsplashData.results[0].urls.regular;
          }
        } catch (uErr) {
          console.warn("Unsplash fetch skipped or failed:", uErr.message);
        }
      }

      // 4. Simpan Hasil ke Database Supabase
      const { error: insertError } = await supabase.from('news').insert([
        {
          title: aiContent.title || item.title,
          summary: aiContent.summary || item.contentSnippet,
          analysis: aiContent.analysis || '',
          category: aiContent.category || 'Market Insights',
          image_url: imageUrl,
          source_url: item.link,
          source_name: 'CNBC Financial',
          created_at: new Date().toISOString()
        }
      ]);

      if (!insertError) {
        insertedCount++;
      } else {
        console.error("Supabase Insert Error:", insertError);
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: `Berhasil menambahkan ${insertedCount} berita baru.` 
    });

  } catch (error) {
    console.error('Error in cron handler:', error);
    return res.status(500).json({ error: error.message });
  }
}
