// @ts-check

/**
 * URL Rewrite Edge Action using Regular Expressions
 * 
 * This function demonstrates various URL rewriting patterns using regex:
 * 1. Redirecting old paths to new paths
 * 2. Removing trailing slashes
 * 3. Converting old product URLs to new format
 * 4. Query parameter manipulation
 * 
 * @param {import("./edge_actions").EdgeActionEvent} event - The event object containing request and response
 * @returns {import("./edge_actions").EdgeActionEvent} - The modified event object
 */
function handler(event) {
    const request = event.request;
    let uri = request.uri;
    let queryString = request.query_string;
    
    console.log(`Original URI: ${uri}, Query: ${queryString}`);
    
    // Example 1: Rewrite /old-blog/* to /blog/*
    // Pattern: /old-blog/article-name -> /blog/article-name
    const oldBlogPattern = /^\/old-blog\/(.*)$/;
    if (oldBlogPattern.test(uri)) {
        uri = uri.replace(oldBlogPattern, '/blog/$1');
        console.log(`Rewrote old-blog path to: ${uri}`);
    }
    
    // Example 2: Remove trailing slashes (except for root /)
    // Pattern: /path/to/page/ -> /path/to/page
    const trailingSlashPattern = /^(.+)\/$/;
    if (trailingSlashPattern.test(uri)) {
        uri = uri.replace(trailingSlashPattern, '$1');
        console.log(`Removed trailing slash: ${uri}`);
    }
    
    // Example 3: Rewrite product URLs from old format to new format
    // Pattern: /products/item/123 -> /shop/product-123
    const oldProductPattern = /^\/products\/item\/(\d+)$/;
    if (oldProductPattern.test(uri)) {
        uri = uri.replace(oldProductPattern, '/shop/product-$1');
        console.log(`Rewrote product URL to: ${uri}`);
    }
    
    // Example 4: Convert category pages
    // Pattern: /category/electronics/subcategory/phones -> /c/electronics/phones
    const categoryPattern = /^\/category\/([^\/]+)\/subcategory\/([^\/]+)$/;
    if (categoryPattern.test(uri)) {
        uri = uri.replace(categoryPattern, '/c/$1/$2');
        console.log(`Rewrote category URL to: ${uri}`);
    }
    
    // Example 5: Normalize file extensions
    // Pattern: /page.html -> /page
    const htmlExtPattern = /^(.*)\.html?$/;
    if (htmlExtPattern.test(uri)) {
        uri = uri.replace(htmlExtPattern, '$1');
        console.log(`Removed HTML extension: ${uri}`);
    }
    
    // Example 6: Query string manipulation
    // Remove tracking parameters (utm_* parameters)
    if (queryString) {
        const pairs = queryString.split('&');
        const filteredPairs = [];
        
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i];
            const key = pair.split('=')[0];
            // Keep only non-utm parameters
            if (!/^utm_/.test(key)) {
                filteredPairs.push(pair);
            }
        }
        
        queryString = filteredPairs.join('&');
        console.log(`Cleaned query string: ${queryString}`);
    }
    
    // Apply the rewritten URI and query string
    request.uri = uri;
    request.query_string = queryString;
    
    console.log(`Final URI: ${uri}, Final Query: ${queryString}`);
    
    return event;
}