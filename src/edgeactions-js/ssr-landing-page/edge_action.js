// @ts-check

/**
 * SSR at the edge
 *
 * Renders a personalized HTML document at the Azure Front Door POP and returns
 * it directly in the response body — no origin round trip for the landing page.
 *
 * On the landing page ("/" or "/index.html") it:
 *   1. Detects country (context.country_code), device (context.is_mobile) and
 *      language (accept-language header).
 *   2. Server-renders a localized, device-aware HTML page as a string.
 *   3. Returns it with response_code = 200 and content-type text/html, so the
 *      visitor gets fully-rendered markup straight from the edge.
 *
 * Every other path flows through to the origin unchanged.
 *
 * Uses supported primitives:
 *   - Response synthesis (response.response_code + response.body)
 *   - Header manipulation (response.headers[...])
 *
 * @param {import("./edge_actions").EdgeActionEvent} event
 * @returns {import("./edge_actions").EdgeActionEvent}
 */
function handler(event) {
    const request = event.request;
    const response = event.response;
    const context = event.context || {};

    // Only server-render the landing page; everything else hits the origin.
    if (request.uri !== '/' && request.uri !== '/index.html') {
        return event;
    }

    const country = (context.country_code || 'US').toUpperCase();
    const device = context.is_mobile === '1' ? 'mobile' : 'desktop';
    const lang = pickLanguage(request.headers['accept-language'] || '');
    const region = regionFor(country);

    const html = renderPage(lang, country, region, device);

    // Response synthesis (SSR): return the rendered document from the edge.
    response.response_code = 200;
    response.body = html;
    response.headers['content-type'] = 'text/html; charset=utf-8';
    response.headers['cache-control'] = 'no-store';

    // Personalization signals for observability / downstream logic.
    response.headers['x-edge-locale'] = lang;
    response.headers['x-device-class'] = device;
    response.headers['x-geo-country'] = country;
    response.headers['x-geo-region'] = region;
    response.headers['x-rendered-at'] = 'edge';

    console.log('Edge SSR: ' + country + '/' + device + '/' + lang);

    return event;
}

/**
 * Server-render the localized landing page as an HTML string.
 * @param {"en" | "fr" | "es" | "de"} lang
 * @param {string} country
 * @param {string} region
 * @param {"mobile" | "desktop"} device
 * @returns {string}
 */
function renderPage(lang, country, region, device) {
    const t = STRINGS[lang];
    const maxWidth = device === 'mobile' ? '100%' : '720px';

    return '<!DOCTYPE html>' +
        '<html lang="' + lang + '">' +
        '<head>' +
        '<meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<title>' + t.title + '</title>' +
        '<style>' +
        'body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:0;background:#0b1120;color:#e2e8f0}' +
        '.wrap{max-width:' + maxWidth + ';margin:0 auto;padding:48px 24px}' +
        'h1{font-size:2rem;margin:0 0 12px}' +
        '.lede{color:#94a3b8;font-size:1.1rem;margin:0 0 32px}' +
        '.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}' +
        '.card{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:16px}' +
        '.k{color:#64748b;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em}' +
        '.v{font-size:1.25rem;margin-top:4px}' +
        '.foot{margin-top:32px;color:#475569;font-size:.85rem}' +
        '</style>' +
        '</head>' +
        '<body>' +
        '<div class="wrap">' +
        '<h1>' + t.greeting + '</h1>' +
        '<p class="lede">' + t.lede + '</p>' +
        '<div class="grid">' +
        card(t.country, country) +
        card(t.region, region) +
        card(t.device, t[device]) +
        card(t.language, lang.toUpperCase()) +
        '</div>' +
        '<p class="foot">' + t.foot + '</p>' +
        '</div>' +
        '</body>' +
        '</html>';
}

/**
 * @param {string} label
 * @param {string} value
 * @returns {string}
 */
function card(label, value) {
    return '<div class="card"><div class="k">' + label + '</div><div class="v">' + value + '</div></div>';
}

/** Localized copy for the rendered page. */
var STRINGS = {
    en: {
        title: 'Rendered at the edge',
        greeting: 'Welcome',
        lede: 'This page was server-rendered at the Azure Front Door edge, personalized to you.',
        country: 'Country', region: 'Region', device: 'Device', language: 'Language',
        mobile: 'Mobile', desktop: 'Desktop',
        foot: 'No origin round trip. Rendered close to you for low latency.'
    },
    fr: {
        title: 'Rendu a la peripherie',
        greeting: 'Bienvenue',
        lede: 'Cette page a ete rendue cote serveur a la peripherie Azure Front Door, personnalisee pour vous.',
        country: 'Pays', region: 'Region', device: 'Appareil', language: 'Langue',
        mobile: 'Mobile', desktop: 'Ordinateur',
        foot: 'Aucun aller-retour vers l\'origine. Rendu au plus pres de vous.'
    },
    es: {
        title: 'Renderizado en el borde',
        greeting: 'Bienvenido',
        lede: 'Esta pagina se renderizo en el servidor en el borde de Azure Front Door, personalizada para ti.',
        country: 'Pais', region: 'Region', device: 'Dispositivo', language: 'Idioma',
        mobile: 'Movil', desktop: 'Escritorio',
        foot: 'Sin ida y vuelta al origen. Renderizado cerca de ti.'
    },
    de: {
        title: 'Am Edge gerendert',
        greeting: 'Willkommen',
        lede: 'Diese Seite wurde serverseitig am Azure Front Door Edge gerendert, fur Sie personalisiert.',
        country: 'Land', region: 'Region', device: 'Gerat', language: 'Sprache',
        mobile: 'Mobil', desktop: 'Desktop',
        foot: 'Kein Umweg zum Ursprung. Nah bei Ihnen gerendert.'
    }
};

/**
 * @param {string} acceptLanguage
 * @returns {"en" | "fr" | "es" | "de"}
 */
function pickLanguage(acceptLanguage) {
    const header = acceptLanguage.toLowerCase();
    if (header.indexOf('fr') === 0 || header.indexOf(',fr') !== -1) return 'fr';
    if (header.indexOf('es') === 0 || header.indexOf(',es') !== -1) return 'es';
    if (header.indexOf('de') === 0 || header.indexOf(',de') !== -1) return 'de';
    return 'en';
}

/**
 * @param {string} country
 * @returns {string}
 */
function regionFor(country) {
    if (country === 'US' || country === 'CA' || country === 'MX') return 'Americas';
    if (country === 'GB' || country === 'FR' || country === 'DE' || country === 'ES' || country === 'IT') return 'Europe';
    if (country === 'JP' || country === 'CN' || country === 'IN' || country === 'SG') return 'Asia Pacific';
    return 'Global';
}
