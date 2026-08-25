/**
 * Cloudflare Worker - Proxy sécurisé pour pièces jointes KoboToolbox
 *
 * Secrets / variables à configurer côté Cloudflare :
 *   KOBO_API_TOKEN   : token API KoboToolbox (SECRET, ne jamais l'écrire dans GitHub Pages)
 *   KOBO_ASSET_UID   : ex. ath6cv2NrXEUijffeKJqSf
 *   ALLOWED_ORIGIN   : ex. https://mariocardigit.github.io
 *
 * URL appelée par le tableau de bord :
 *   https://<worker>.workers.dev/?url=<URL_ENCODEE_DE_LA_PIECE_JOINTE_KOBO>
 */

function corsHeaders(origin, allowedOrigin) {
  const allow = allowedOrigin || origin || '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'Content-Type, Content-Length, ETag, Last-Modified',
    'Vary': 'Origin',
    'Cache-Control': 'no-store'
  };
}

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function isAllowedKoboAttachmentUrl(rawUrl, assetUid) {
  let target;
  try { target = new URL(rawUrl); } catch (_) { return false; }
  if (target.protocol !== 'https:' || target.hostname !== 'kf.kobotoolbox.org') return false;
  const prefix = `/api/v2/assets/${assetUid}/data/`;
  return target.pathname.startsWith(prefix) && target.pathname.includes('/attachments/');
}

export default {
  async fetch(request, env) {
    const requestOrigin = request.headers.get('Origin') || '';
    const allowedOrigin = String(env.ALLOWED_ORIGIN || '').trim();
    const headers = corsHeaders(requestOrigin, allowedOrigin);

    if (allowedOrigin && requestOrigin && requestOrigin !== allowedOrigin) {
      return jsonResponse({ error: 'Origin non autorisée.' }, 403, headers);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Méthode non autorisée.' }, 405, headers);
    }

    const token = String(env.KOBO_API_TOKEN || '').trim();
    const assetUid = String(env.KOBO_ASSET_UID || 'ath6cv2NrXEUijffeKJqSf').trim();
    const incomingUrl = new URL(request.url);

    // Endpoint de santé utilisé par le bouton « Tester » du tableau de bord.
    // Il n’expose jamais la valeur du token ; il indique seulement s’il est configuré.
    if (incomingUrl.searchParams.get('health') === '1') {
      if (!assetUid) return jsonResponse({ ok: false, error: 'KOBO_ASSET_UID non configuré.' }, 500, headers);
      return jsonResponse({
        ok: Boolean(token),
        service: 'PMA/PTA Kobo Secure Attachment Proxy',
        provider: 'Cloudflare Workers',
        plan_hint: 'Compatible Workers Free',
        asset_uid: assetUid,
        token_configured: Boolean(token),
        allowed_origin_configured: Boolean(allowedOrigin)
      }, token ? 200 : 503, headers);
    }

    if (!token) return jsonResponse({ error: 'KOBO_API_TOKEN non configuré côté serveur.' }, 500, headers);
    if (!assetUid) return jsonResponse({ error: 'KOBO_ASSET_UID non configuré.' }, 500, headers);

    const targetUrl = String(incomingUrl.searchParams.get('url') || '').trim();
    if (!targetUrl) return jsonResponse({ error: 'Paramètre url manquant.' }, 400, headers);
    if (!isAllowedKoboAttachmentUrl(targetUrl, assetUid)) {
      return jsonResponse({ error: 'URL de pièce jointe Kobo non autorisée.' }, 400, headers);
    }

    let upstream;
    try {
      upstream = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${token}`,
          'Accept': '*/*'
        },
        redirect: 'follow',
        cf: { cacheTtl: 0, cacheEverything: false }
      });
    } catch (error) {
      return jsonResponse({ error: 'Connexion KoboToolbox impossible.', detail: String(error?.message || error) }, 502, headers);
    }

    if (!upstream.ok) {
      let detail = '';
      try { detail = (await upstream.text()).slice(0, 500); } catch (_) {}
      return jsonResponse({
        error: `KoboToolbox a répondu HTTP ${upstream.status}.`,
        detail
      }, upstream.status, headers);
    }

    const outHeaders = new Headers(headers);
    for (const name of ['content-type', 'content-length', 'etag', 'last-modified', 'content-disposition']) {
      const value = upstream.headers.get(name);
      if (value) outHeaders.set(name, value);
    }
    return new Response(upstream.body, { status: 200, headers: outHeaders });
  }
};
