import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';

// Inisialisasi Supabase Client dengan Service Role Key Anda
const supabaseUrl = 'https://ngysrsypmieuvucqupgd.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE; // Menggunakan nama variabel Anda
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const parser = new Parser();

export default async function handler(req, res) {
  try {
    // 1. Ambil Feed RSS Pasar Keuangan (Contoh: CNBC Market RSS)
    const feed = await parser.parseURL('https://search.cnbc.com/rs/search/combined/rss/cnbcnews?id=15839069');
    
    // Ambil 3 berita terbaru
    const latestItems = feed.items.slice(0, 3);
    let insertedCount = 0;

    for (const item of latestItems) {
      // Cek apakah berita sudah ada berdasarkan link asli
      const { data: existing } = await supabase
        .from('news')
        .select('id')
        .eq('source_url', item.link)
        .single();

      if (existing) continue; // Skip jika berita sudah tersimpan sebelumnya

      // 2. Olah konten dengan Gemini API
      const geminiPrompt = `
        Rewrite the following financial news item into a high-engaging, SEO-optimized summary in Indonesian.
        Title: ${item.title}
        Content: ${item.contentSnippet || item.content}
        
        Provide JSON output with keys:
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
      const aiContent = JSON.parse(geminiData.candidates[0].content.parts[0].text);

      // 3. Cari Gambar di Unsplash
      let imageUrl = 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=800&q=80'; // Fallback
      if (process.env.UNSPLASH_ACCESS) {
        const unsplashRes = await fetch(
          `https://api.unsplash.com/search/photos?page=1&query=${encodeURIComponent(aiContent.search_query)}&client_id=${process.env.UNSPLASH_ACCESS}`
        );
        const unsplashData = await unsplashRes.json();
        if (unsplashData.results && unsplashData.results.length > 0) {
          imageUrl = unsplashData.results[0].urls.regular;
        }
      }

      // 4. Simpan ke Database Supabase
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
