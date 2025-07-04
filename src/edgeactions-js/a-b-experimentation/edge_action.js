// @ts-check

/**
 * @param {import("./edge_actions").EdgeActionEvent} event - The event object containing request and response
 * @returns {import("./edge_actions").EdgeActionEvent} - The modified event object
 */
function handler(event) {
    var response = event.response;
    var request = event.request;
    var context = event.context || {};

    // check if there are any origins available.
    if (!event.origin_data || event.origin_data.length === 0) {
        console.log("No origin data found, skipping origin selection.\n");
        return event;
    }

    if(context['is_mobile'] !== '1' || request.headers['x-allow-experiment'] !== 'true') {
        // if the request is non mobile or not opted in with header, let AFD choose origin.
        console.log("Request is not from an opted in mobile device, bypassing origin selection.\n");
        return event;
    }
    
    var experimentalOrigin = findExperimentalOrigin(event.origin_data);
    if (!experimentalOrigin) {
        console.log("No experimental origin found, skipping origin selection.\n");
        return event;
    }

    event.origin.id = experimentalOrigin.id;

    return event;
}

/**
 * Finds an experimental origin by name patterns
 * @param {Array} origins - Array of origin objects
 * @returns {import("./edge_actions").CdnOrigin|null} - Found experimental origin or null
 */
function findExperimentalOrigin(origins) {
    const found = origins.find(origin => {
        if (!origin.name) return false;
        const name = origin.name.toLowerCase();
        const includes = name.includes('experimental');
        console.log(`Checking origin ${origin.id}: ${name} - Includes 'experimental'? ${includes}\n`);
        return includes;
    });
    
    console.log(`Selected experimental origin: ${found ? found.id : 'none'}\n`);
    return found;
}