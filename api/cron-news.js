import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';

const supabaseUrl = 'https://ngysrsypmieuvucqupgd.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const parser = new Parser();

export default async function handler(req, res) {
  try {
    const feed = await parser.parseURL('https://search.cnbc.com/rs/search/combined/rss/cnbcnews?id=15839069');
    const latestItems = feed.items.slice(0, 3);
    let insertedCount = 0;

    for (const item of latestItems) {
      const { data: existing } = await supabase
        .from('news')
        .select('id')
        .eq('source_url', item.link)
        .single();

      if (existing) continue;

      const geminiPrompt = `
        Rewrite the following financial news item into a high-engaging, SEO-optimized summary in Indonesian.
        Title: ${item.title}
        Content: ${item.contentSnippet || item.content}
        
        Provide valid JSON output ONLY with these exact keys:
        - "title": catchy title in Indonesian
        - "summary": concise summary paragraph in Indonesian
        - "analysis": key financial takeaway or market impact analysis
        - "category": market category (e.g. Saham US, Global Economy, Energy, Technology)
        - "search_query": 2-3 English keywords to search a matching thumbnail image on Unsplash
      `;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: geminiPrompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        }
      );

      const geminiData = await geminiRes.json();
      
      if (!geminiData.candidates || !geminiData.candidates[0].content) {
        throw new Error("Invalid response from Gemini API");
      }

      let rawText = geminiData.candidates[0].content.parts[0].text;
      
      // Membersihkan markdown code blocks jika AI masih menyertakannya
      rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

      let aiContent;
      try {
        aiContent = JSON.parse(rawText);
      } catch (parseErr) {
        console.error("Failed to parse Gemini JSON:", rawText);
        continue; // Lewati item ini jika gagal parsing, lanjut ke berita berikutnya
      }

      let imageUrl = 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=800&q=80';
      if (process.env.UNSPLASH_ACCESS && aiContent.search_query) {
        const unsplashRes = await fetch(
          `https://api.unsplash.com/search/photos?page=1&query=${encodeURIComponent(aiContent.search_query)}&client_id=${process.env.UNSPLASH_ACCESS}`
        );
        const unsplashData = await unsplashRes.json();
        if (unsplashData.results && unsplashData.results.length > 0) {
          imageUrl = unsplashData.results[0].urls.regular;
        }
      }

      const { error: insertError } = await supabase.from('news').insert([
        {
          title: aiContent.title,
          summary: aiContent.summary,
          analysis: aiContent.analysis,
          category: aiContent.category || 'Global Market',
          image_url: imageUrl,
          source_url: item.link,
          source_name: 'CNBC Financial',
          created_at: new Date().toISOString()
        }
      ]);

      if (!insertError) insertedCount++;
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
