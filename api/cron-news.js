import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';

const supabaseUrl = 'https://ngysrsypmieuvucqupgd.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const parser = new Parser();

export default async function handler(req, res) {
  try {
    // Set header agar respons dipastikan selalu berformat JSON
    res.setHeader('Content-Type', 'application/json');

    // 1. Ambil Feed RSS CNBC
    const feed = await parser.parseURL('https://search.cnbc.com/rs/search/combined/rss/cnbcnews?id=15839069');
    const latestItems = feed.items.slice(0, 3);
    let insertedCount = 0;

    for (const item of latestItems) {
      try {
        // Cek duplikasi berdasarkan URL asli
        const { data: existing } = await supabase
          .from('news')
          .select('id')
          .eq('source_url', item.link)
          .single();

        if (existing) continue;

        // 2. Kirim Prompt ke Gemini API tanpa paksaan ketat MIME type agar tidak memicu error parser Vercel
        const geminiPrompt = `
Rewrite this financial news into a structured JSON object in Indonesian.
Title: ${item.title}
Content: ${item.contentSnippet || item.content}

Return ONLY valid JSON format like this, with no markdown code blocks:
{
  "title": "Judul berita menarik dalam Bahasa Indonesia",
  "summary": "Ringkasan singkat berita dalam Bahasa Indonesia",
  "analysis": "Analisis dampak pasar keuangan",
  "category": "Market Insights",
  "search_query": "stock market chart"
}
        `;

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
        
        if (!geminiData.candidates || !geminiData.candidates[0]?.content?.parts[0]?.text) {
          continue;
        }

        let rawText = geminiData.candidates[0].content.parts[0].text;
        
        // Bersihkan pembungkus markdown jika ada
        rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        
        if (!jsonMatch) continue;

        let aiContent = JSON.parse(jsonMatch[0]);

        // 3. Ambil Gambar dari Unsplash (Gunakan Fallback jika gagal)
        let imageUrl = 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=800&q=80';
        if (process.env.UNSPLASH_ACCESS && aiContent.search_query) {
          try {
            const unsplashRes = await fetch(
              `https://api.unsplash.com/search/photos?page=1&query=${encodeURIComponent(aiContent.search_query)}&client_id=${process.env.UNSPLASH_ACCESS}`
            );
            const unsplashData = await unsplashRes.json();
            if (unsplashData.results && unsplashData.results.length > 0) {
              imageUrl = unsplashData.results[0].urls.regular;
            }
          } catch (e) {
            // Abaikan jika Unsplash gagal, gunakan fallback image
          }
        }

        // 4. Simpan ke Supabase
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

        if (!insertError) insertedCount++;

      } catch (itemErr) {
        console.error("Skipping item due to error:", itemErr.message);
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: `Berhasil menambahkan ${insertedCount} berita baru.` 
    });

  } catch (error) {
    console.error('Fatal error in cron handler:', error);
    return res.status(500).json({ error: error.message });
  }
}
