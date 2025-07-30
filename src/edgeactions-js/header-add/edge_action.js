// @ts-check

/**
 * @param {import("./edge_actions").EdgeActionEvent} event - The event object containing request and response
 * @returns {import("./edge_actions").EdgeActionEvent} - The modified event object
 */
function handler(event) {
    const response = event.response;
    
    // Manually set response code to 200, as part of adding new header
    response.response_code = 200;

    // Add a custom header to the response
    response.headers['x-customheader'] = "processedByEdgeactions";

    console.log("Added custom header: x-customheader = processedByEdgeactions");

    return event;
}
