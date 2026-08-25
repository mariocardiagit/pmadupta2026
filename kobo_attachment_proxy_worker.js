/**
 * Cloudflare Worker - Proxy sécurisé KoboToolbox (données + pièces jointes)
 *
 * Secrets / variables côté Cloudflare :
 *   KOBO_API_TOKEN            : token API KoboToolbox (SECRET)
 *   KOBO_ALLOWED_ASSET_UIDS   : liste CSV des assets autorisés
 *                               ex. ath6cv2NrXEUijffeKJqSf,a3FyptGkdkj5YDhjVNaQ8R,aBroLM7FPWRquuoQQAexW3
 *   ALLOWED_ORIGIN            : ex. https://mariocardigit.github.io
 *
 * Compatibilité : KOBO_ASSET_UID reste accepté pour une configuration historique à un seul asset.
 *
 * Appels :
 *   Santé : https://<worker>.workers.dev/?health=1
 *   Données / pièce jointe : https://<worker>.workers.dev/?url=<URL_KOBO_ENCODEE>
 *
 * Le token n'est JAMAIS renvoyé au navigateur.
 */

function corsHeaders(origin, allowedOrigin) {
  const allow = allowedOrigin || origin || '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'Content-Type, Content-Length, ETag, Last-Modified, Content-Disposition',
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

function allowedAssets(env) {
  const csv = String(env.KOBO_ALLOWED_ASSET_UIDS || '').trim();
  const legacy = String(env.KOBO_ASSET_UID || '').trim();
  const list = csv ? csv.split(',') : (legacy ? [legacy] : []);
  return [...new Set(list.map(v => v.trim()).filter(Boolean))];
}

function parseAllowedKoboTarget(rawUrl, assetUids) {
  let target;
  try { target = new URL(rawUrl); } catch (_) { return null; }
  if (target.protocol !== 'https:' || target.hostname !== 'kf.kobotoolbox.org') return null;

  // Autorise uniquement les endpoints de données v2 des assets explicitement déclarés.
  // Exemples :
  // /api/v2/assets/<uid>/data/
  // /api/v2/assets/<uid>/data.json
  // /api/v2/assets/<uid>/data/<submission>/attachments/<uid>/
  const match = target.pathname.match(/^\/api\/v2\/assets\/([^/]+)\/(data(?:\.json)?)(?:\/.*)?$/i);
  if (!match) return null;
  const uid = decodeURIComponent(match[1]);
  if (!assetUids.includes(uid)) return null;
  return { target, uid };
}

export default {
  async fetch(request, env) {
    const requestOrigin = request.headers.get('Origin') || '';
    const allowedOrigin = String(env.ALLOWED_ORIGIN || '').trim();
    const headers = corsHeaders(requestOrigin, allowedOrigin);

    if (allowedOrigin && requestOrigin && requestOrigin !== allowedOrigin) {
      return jsonResponse({ error: 'Origin non autorisée.' }, 403, headers);
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return jsonResponse({ error: 'Méthode non autorisée.' }, 405, headers);

    const token = String(env.KOBO_API_TOKEN || '').trim();
    const assets = allowedAssets(env);
    const incomingUrl = new URL(request.url);

    if (incomingUrl.searchParams.get('health') === '1') {
      return jsonResponse({
        ok: Boolean(token && assets.length),
        service: 'PMA/PTA Kobo Secure API Proxy',
        provider: 'Cloudflare Workers',
        plan_hint: 'Compatible Workers Free',
        token_configured: Boolean(token),
        allowed_assets_count: assets.length,
        allowed_asset_uids: assets,
        allowed_origin_configured: Boolean(allowedOrigin),
        capabilities: ['survey-data', 'attachments']
      }, token && assets.length ? 200 : 503, headers);
    }

    if (!token) return jsonResponse({ error: 'KOBO_API_TOKEN non configuré côté serveur.' }, 500, headers);
    if (!assets.length) return jsonResponse({ error: 'KOBO_ALLOWED_ASSET_UIDS / KOBO_ASSET_UID non configuré.' }, 500, headers);

    const targetUrl = String(incomingUrl.searchParams.get('url') || '').trim();
    if (!targetUrl) return jsonResponse({ error: 'Paramètre url manquant.' }, 400, headers);

    const parsed = parseAllowedKoboTarget(targetUrl, assets);
    if (!parsed) {
      return jsonResponse({ error: 'URL Kobo non autorisée. Seuls les endpoints data des assets explicitement autorisés sont acceptés.' }, 400, headers);
    }

    let upstream;
    try {
      upstream = await fetch(parsed.target.href, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${token}`,
          'Accept': request.headers.get('Accept') || '*/*'
        },
        redirect: 'follow',
        cf: { cacheTtl: 0, cacheEverything: false }
      });
    } catch (error) {
      return jsonResponse({ error: 'Connexion KoboToolbox impossible.', detail: String(error?.message || error) }, 502, headers);
    }

    if (!upstream.ok) {
      let detail = '';
      try { detail = (await upstream.text()).slice(0, 800); } catch (_) {}
      return jsonResponse({
        error: `KoboToolbox a répondu HTTP ${upstream.status}.`,
        asset_uid: parsed.uid,
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
