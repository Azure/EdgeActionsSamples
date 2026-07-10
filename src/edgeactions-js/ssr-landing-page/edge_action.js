// @ts-check

/**
 * Edge personalization router
 *
 * A common "SSR-adjacent" pattern that stays within the publicly supported
 * Edge Actions capabilities (URL redirect + header manipulation): instead of
 * rendering HTML at the edge, the edge inspects each visitor's geo, device and
 * language and routes them to the right pre-rendered / localized variant.
 *
 * On the landing page ("/" or "/index.html") it:
 *   1. Detects country (context.country_code), device (context.is_mobile) and
 *      language (accept-language header).
 *   2. Issues a 302 redirect to a localized, device-specific path
 *      (e.g. "/fr/mobile") using response_code + a Location header.
 *   3. Stamps personalization signals as response headers for observability
 *      and for any downstream/origin logic.
 *
 * Everything else flows through to the origin unchanged.
 *
 * Uses only supported primitives:
 *   - URL redirect  (response.response_code + response.headers['location'])
 *   - Header manipulation (response.headers[...])
 * No response body is generated (writing response.body is not supported).
 *
 * @param {import("./edge_actions").EdgeActionEvent} event
 * @returns {import("./edge_actions").EdgeActionEvent}
 */
function handler(event) {
    const request = event.request;
    const response = event.response;
    const context = event.context || {};

    // Only personalize the landing page; let localized pages flow to origin.
    if (request.uri !== '/' && request.uri !== '/index.html') {
        return event;
    }

    const country = (context.country_code || 'US').toUpperCase();
    const device = context.is_mobile === '1' ? 'mobile' : 'desktop';
    const lang = pickLanguage(request.headers['accept-language'] || '');
    const region = regionFor(country);

    const target = '/' + lang + '/' + device;

    // URL redirect (supported): short-circuit with a 302 + Location header.
    response.response_code = 302;
    response.headers['location'] = target;
    response.headers['cache-control'] = 'no-store';

    // Header manipulation (supported): personalization signals.
    response.headers['x-edge-locale'] = lang;
    response.headers['x-device-class'] = device;
    response.headers['x-geo-country'] = country;
    response.headers['x-geo-region'] = region;
    response.headers['x-rendered-at'] = 'edge';

    console.log('Edge personalization: ' + country + '/' + device + '/' + lang + ' -> ' + target);

    return event;
}

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
