// @ts-check

/**
 * @param {import("./edge_actions").EdgeActionEvent} event - The event object containing request and response
 * @returns {import("./edge_actions").EdgeActionEvent} - The modified event object
 */
function handler(event) {
    const response = event.response;
    const request = event.request;
    const context = event.context || {};
    const country = context.country_code || 'default';

    console.log(`Incoming request from country: ${country}`);

    // Check if origin_data is available
    if (!event.origin_data || event.origin_data.length === 0) {
        console.log("No origins found in origin_data");
        response.headers['X-Origin-Error'] = "No origins available";
        return event;
    }

    let selectedOrigin = null;

    // Route to a specific origin if the request is from the US
    if (country.toUpperCase() === 'US') {
        selectedOrigin = event.origin_data.find(origin =>
            origin.name && origin.name.toLowerCase().includes('us')
        );
        if (selectedOrigin) {
            console.log("Routing to US-specific origin");
        }
    }

    // Fallback to the first available origin
    if (!selectedOrigin) {
        selectedOrigin = event.origin_data[0];
        console.log("Using default origin as fallback");
    }

    event.origin.id = selectedOrigin.id;
    response.headers['X-Selected-Origin'] = selectedOrigin.name;
    response.headers['X-Country'] = country;

    return event;
}