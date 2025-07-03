// @ts-check

/**
 * @param {import("./edge_actions").EdgeActionEvent} event - The event object containing request and response
 * @returns {import("./edge_actions").EdgeActionEvent} - The modified event object
 */
function handler(event) {
    var response = event.response;
    var request = event.request;
    var context = event.context || {};

    // Extract country code from context
    const country = context.country_code || 'default';

    // Reject requests from UK
    if (country.toUpperCase() === 'GB') {
        console.log("Request rejected from UK with code 403");
        response.response_code = 403;
        response.headers['X-Request-Rejected'] = "true";
    }

    return event;
}