const https = require('https');

const HOST = 'satisfynex.com';
const API_KEY = 'c5d41b9f688d41708faaa4572a5b3616';
const SITEMAP_URL = `https://${HOST}/sitemap.xml`;

async function runIndexNow() {
  try {
    console.log('Mengambil sitemap.xml...');
    const response = await fetch(SITEMAP_URL);
    const xmlText = await response.text();

    const urlMatches = xmlText.match(/<loc>(.*?)<\/loc>/g) || [];
    const urls = urlMatches.map(tag => tag.replace(/<\/?loc>/g, ''));

    if (urls.length === 0) {
      console.log('Tiada URL ditemui di sitemap.');
      return;
    }

    console.log(`Jumpa ${urls.length} URL. Menghantar PUSH ke IndexNow...`);

    const payload = {
      host: HOST,
      key: API_KEY,
      keyLocation: `https://${HOST}/${API_KEY}.txt`,
      urlList: urls
    };

    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    });

    if (res.ok || res.status === 202) {
      console.log(`✅ BERJAYA! Sebanyak ${urls.length} URL telah dihantar ke IndexNow.`);
    } else {
      console.error(`❌ GAGAL! Respons pelayan: ${res.status}`);
    }
  } catch (error) {
    console.error('Ralat berlaku:', error);
  }
}

runIndexNow();
