import { NextResponse } from 'next/server';

const BOT_AGENTS = /googlebot|bingbot|yandex|baiduspider|facebookexternalhit|twitterbot|rogerbot|linkedinbot|embedly|quora link preview|showyoubot|outbrain|pinterest|slackbot|vkShare|W3C_Validator|whatsapp/i;

export function middleware(req) {
  const userAgent = req.headers.get('user-agent') || '';
  const url = req.nextUrl;

  // Jika yang akses adalah bot search engine
  if (BOT_AGENTS.test(userAgent)) {
    const prerenderUrl = `https://service.prerender.io/${url.toString()}`;
    
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('X-Prerender-Token', 'TDwY53Kund3RykymPfsy');

    return NextResponse.rewrite(prerenderUrl, {
      headers: requestHeaders,
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
