# EdgeActionEvent Interface

This document describes the `EdgeActionEvent` object passed to your edge action `handler` function. Your handler receives this event, may modify it, and must return it.

```javascript
function handler(event) {
    // Inspect and modify the event
    return event;
}
```

## EdgeActionEvent

| Field | Type | Description |
|-------|------|-------------|
| `request` | `HttpRequest` | The HTTP request being processed. |
| `response` | `HttpResponse` | The HTTP response. Modify this to set response headers or body. |
| `origin_data` | `CdnOrigin[]` | List of available CDN origins for the request's route. |
| `hook_point` | `number` | Indicates where in the request lifecycle the action is executing. See [Hook Points](#hook-points). |
| `context` | `{ [key: string]: string }` | A key-value map storing context such as server variables, client country, and date/time of invocation. |
| `origin` | `OriginSelection` | Controls which origin the request is routed to. See [OriginSelection](#originselection). |

## HttpRequest

| Field | Type | Description |
|-------|------|-------------|
| `uri` | `string` | The request URI path (e.g., `/api/resource`). |
| `method` | `string` | The HTTP method (e.g., `GET`, `POST`, `PUT`, `DELETE`). |
| `query_string` | `string` | The raw query string from the request URL. Does not include the leading '?' |
| `headers` | `{ [key: string]: string }` | Dictionary of HTTP request headers. Add, modify, or remove headers to control what is forwarded to the origin. Key is *lowercase* header name. |

## HttpResponse

| Field | Type | Description |
|-------|------|-------------|
| `response_code` | `number` | The HTTP status code (e.g., `200`, `404`). Set this to control the response returned to the client. |
| `headers` | `{ [key: string]: string }` | Dictionary of HTTP response headers. Add or modify headers to control what is returned to the client. |
| `set_cookie_headers` | `string[]` | Array of `Set-Cookie` header values. Use this instead of the `headers` dictionary for cookies. |

## CdnOrigin

Represents an available origin server for the request's route.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | Unique (per request) identifier for this origin. Use with `OriginSelection` to route to this origin. May change between requests. |
| `name` | `string` | The name of the origin. |
| `weight` | `number` | The configured traffic weight for this origin. |
| `priority` | `number` | The configured priority for this origin. |
| `is_healthy` | `boolean` | Whether the origin is currently considered healthy. Currently always true as only healthy origins are provided. |

## OriginSelection

Controls which origin the request is routed to.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | The ID of the origin to route the request to. Set this to the `id` of a `CdnOrigin` from `origin_data`. A value of `-1` (the default) means no override — the platform uses its standard origin selection logic. |

### Example: Selecting an origin

```javascript
function handler(event) {
    // Route to the first healthy origin
    const healthy = event.origin_data.find(o => o.is_healthy);
    if (healthy) {
        event.origin.id = healthy.id;
    }
    return event;
}
```

## Hook Points

The `hook_point` field indicates when in the request lifecycle your action is invoked. Currenlty on Client Request is supported, but more will be added later.

| Value | Name | Description |
|-------|------|-------------|
| `0` | Client Request | After receiving the request from the client, before origin selection. |

## Context

The `context` field is a string-to-string dictionary that gives access to available AFD server variables (see https://learn.microsoft.com/en-us/azure/frontdoor/rule-set-server-variables), and UTC invocation datetime ("now"). Some server variables will not be available on all requests, in which case their key will not be present.

## Note on Header Modifications
Header modifications applied from input to returend output event will be applied on the AFD request triggering the action. Headers may be added, have value changed, or be deleted. Some restricted headers will not allow modification on the AFD request.

## Note on Response Codes
Currently AFD supports returning 401 or 403 to reject requests. 200 response code indicates that request can continue to be processed with provided modifications on the response object. Any other response code is currently considered invalid.