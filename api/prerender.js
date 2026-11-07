export default async function handler(req, res) {
  const userAgent = req.headers['user-agent'] || '';
  const isBot = /googlebot|bingbot|yandex|baiduspider|facebookexternalhit|twitterbot|rogerbot|linkedinbot|embedly|quora link preview|showyoubot|outbrain|pinterest|slackbot|vkShare|W3C_Validator|whatsapp/i.test(userAgent);

  const targetUrl = `https://satisfynex.com${req.url}`;

  if (isBot) {
    try {
      const response = await fetch(`https://service.prerender.io/${targetUrl}`, {
        headers: {
          'X-Prerender-Token': process.env.PRERENDER_TOKEN || 'TDwY53Kund3RykymPfsy'
        }
      });
      const html = await response.text();
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(html);
    } catch (err) {
      return res.status(500).send('Prerender proxy error');
    }
  }

  // Jika bukan bot, kembalikan status 200 normal
  return res.status(200).send('OK');
}
