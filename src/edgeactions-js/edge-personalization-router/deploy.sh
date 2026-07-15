#!/usr/bin/env bash
#
# Provision and wire up the edge personalization router on Azure Front Door.
#
# This script does the whole thing end to end:
#   1. Creates the edge action + a default version and deploys the JS.
#   2. Provisions an AFD Standard profile, endpoint, origin, rule set and route.
#   3. Binds the edge action to the route's rule set with an `EdgeAction`
#      delivery-rule action. THIS is the step that makes the action fire on
#      live traffic. There is no separate "attach"/"addAttachment" call.
#
# Verified working against api-version 2025-09-01-preview with:
#   - az CLI 2.87+  (edge-action extension for the action, cdn extension for AFD)
#
# No preview feature flag and no execution filter are required for the action
# to fire.
#
# Prereqs (macOS):
#   brew install azure-cli
#   az login
#   az extension add --name edge-action --upgrade
#   az extension add --name cdn --upgrade
#
set -euo pipefail

# ---- Config (override via env or edit) --------------------------------------
RESOURCE_GROUP="${RESOURCE_GROUP:-myResourceGroup}"
SUBSCRIPTION_ID="${SUBSCRIPTION_ID:-}"          # optional; uses current context if empty

# Edge action names must match [a-zA-Z0-9]+ (no hyphens). AFD names may use hyphens.
EDGE_ACTION_NAME="${EDGE_ACTION_NAME:-edgePersonalizationRouter}"
VERSION="${VERSION:-v1}"
LOCATION="${LOCATION:-global}"
SKU='{name:Standard,tier:Standard}'

# AFD resources
AFD_PROFILE="${AFD_PROFILE:-edgePersonalizationAfd}"
AFD_ENDPOINT="${AFD_ENDPOINT:-edgepersonalization}"
ORIGIN_GROUP="${ORIGIN_GROUP:-edgePersonalizationOriginGroup}"
ORIGIN_NAME="${ORIGIN_NAME:-edgePersonalizationOrigin}"
ORIGIN_HOST="${ORIGIN_HOST:-example.com}"       # placeholder backend
RULE_SET="${RULE_SET:-edgePersonalizationRuleSet}"
ROUTE_NAME="${ROUTE_NAME:-edgePersonalizationRoute}"
EDGE_RULE="${EDGE_RULE:-edgePersonalizationRule}"

# When the edge action runs in the request pipeline: ClientRequest | OriginRequest
INVOCATION_POINT="${INVOCATION_POINT:-ClientRequest}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODE_FILE="${CODE_FILE:-$SCRIPT_DIR/edge_action.js}"
# -----------------------------------------------------------------------------

echo "==> Ensuring CLI extensions are present (edge-action + cdn)"
az extension add --name edge-action --upgrade --only-show-errors 2>/dev/null || true
az extension add --name cdn --upgrade --only-show-errors 2>/dev/null || true

if [[ -n "$SUBSCRIPTION_ID" ]]; then
  echo "==> Setting subscription: $SUBSCRIPTION_ID"
  az account set --subscription "$SUBSCRIPTION_ID"
fi
SUB="$(az account show --query id -o tsv)"
echo "==> Using subscription: $SUB"

# --- 1. Edge action ----------------------------------------------------------
echo "==> 1/9 Creating edge action: $EDGE_ACTION_NAME"
az edge-action create \
  --resource-group "$RESOURCE_GROUP" \
  --edge-action-name "$EDGE_ACTION_NAME" \
  --location "$LOCATION" \
  --sku "$SKU"

echo "==> 2/9 Creating default version: $VERSION"
az edge-action version create \
  --resource-group "$RESOURCE_GROUP" \
  --edge-action-name "$EDGE_ACTION_NAME" \
  --version "$VERSION" \
  --location "$LOCATION" \
  --deployment-type file \
  --is-default-version True

echo "==> 3/9 Deploying code from: $CODE_FILE (long-running, ~10 min)"
az edge-action version deploy-from-file \
  --resource-group "$RESOURCE_GROUP" \
  --edge-action-name "$EDGE_ACTION_NAME" \
  --version "$VERSION" \
  --file-path "$CODE_FILE"

EDGE_ACTION_ID="$(az edge-action show -g "$RESOURCE_GROUP" \
  --edge-action-name "$EDGE_ACTION_NAME" --query id -o tsv)"
echo "    edge action id: $EDGE_ACTION_ID"

# --- 2. AFD front end --------------------------------------------------------
echo "==> 4/9 Creating AFD profile: $AFD_PROFILE"
az afd profile create -g "$RESOURCE_GROUP" --profile-name "$AFD_PROFILE" \
  --sku Standard_AzureFrontDoor

echo "==> 5/9 Creating endpoint: $AFD_ENDPOINT"
az afd endpoint create -g "$RESOURCE_GROUP" --profile-name "$AFD_PROFILE" \
  --endpoint-name "$AFD_ENDPOINT" --enabled-state Enabled

echo "==> 6/9 Creating origin group + origin (placeholder: $ORIGIN_HOST)"
az afd origin-group create -g "$RESOURCE_GROUP" --profile-name "$AFD_PROFILE" \
  --origin-group-name "$ORIGIN_GROUP" \
  --probe-request-type GET --probe-protocol Https --probe-path / \
  --probe-interval-in-seconds 100 \
  --sample-size 4 --successful-samples-required 3 \
  --additional-latency-in-milliseconds 50

az afd origin create -g "$RESOURCE_GROUP" --profile-name "$AFD_PROFILE" \
  --origin-group-name "$ORIGIN_GROUP" --origin-name "$ORIGIN_NAME" \
  --host-name "$ORIGIN_HOST" --origin-host-header "$ORIGIN_HOST" \
  --http-port 80 --https-port 443 --priority 1 --weight 1000 \
  --enabled-state Enabled --enforce-certificate-name-check false

echo "==> 7/9 Creating rule set + route (/* -> origin group)"
az afd rule-set create -g "$RESOURCE_GROUP" --profile-name "$AFD_PROFILE" \
  --rule-set-name "$RULE_SET"

az afd route create -g "$RESOURCE_GROUP" --profile-name "$AFD_PROFILE" \
  --endpoint-name "$AFD_ENDPOINT" --route-name "$ROUTE_NAME" \
  --origin-group "$ORIGIN_GROUP" --rule-sets "$RULE_SET" \
  --supported-protocols Http Https --patterns-to-match '/*' \
  --forwarding-protocol MatchRequest --link-to-default-domain Enabled \
  --https-redirect Disabled

# --- 3. The binding that makes the action fire -------------------------------
echo "==> 8/9 Binding edge action via an EdgeAction delivery-rule action"
az afd rule create -g "$RESOURCE_GROUP" --profile-name "$AFD_PROFILE" \
  --rule-set-name "$RULE_SET" --rule-name "$EDGE_RULE" --order 1 \
  --action-name EdgeAction \
  --edge-action-id "$EDGE_ACTION_ID" \
  --invocation-point "$INVOCATION_POINT"

echo "==> 9/9 Done. Resolving endpoint host"
HOST="$(az afd endpoint show -g "$RESOURCE_GROUP" --profile-name "$AFD_PROFILE" \
  --endpoint-name "$AFD_ENDPOINT" --query hostName -o tsv)"

cat <<EOF

Provisioned and bound. Host: https://$HOST/

AFD edge propagation takes ~10-20 minutes. Then verify the action is firing:

  curl -sD - -o /dev/null -H 'Accept-Language: fr-FR' "https://$HOST/" \\
    | grep -iE 'x-rendered-at|location|x-geo-country|x-device-class'

Expected (HTTP 200 with the edge action's personalization headers):
  location: /fr/desktop
  x-edge-locale: fr
  x-device-class: desktop
  x-geo-country: FR
  x-rendered-at: edge
EOF
