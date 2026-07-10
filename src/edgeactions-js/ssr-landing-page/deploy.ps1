#Requires -Version 5.1
<#
.SYNOPSIS
    Provision and wire up the edge personalization router on Azure Front Door.

.DESCRIPTION
    Windows/PowerShell port of deploy.sh. Does the whole thing end to end:
      1. Creates the edge action + a default version and deploys the JS.
      2. Provisions an AFD Standard profile, endpoint, origin, rule set and route.
      3. Binds the edge action to the route's rule set with an `EdgeAction`
         delivery-rule action. THIS is the step that makes the action fire on
         live traffic. There is no separate "attach"/"addAttachment" call.

    Verified against api-version 2025-09-01-preview with az CLI 2.87+
    (edge-action extension for the action, cdn extension for AFD).

    No preview feature flag and no execution filter are required.

.EXAMPLE
    az login
    ./deploy.ps1 -ResourceGroup myResourceGroup

.EXAMPLE
    ./deploy.ps1 -ResourceGroup myRg -SubscriptionId <sub> -EdgeActionName ssrRouter
#>
[CmdletBinding()]
param(
    [string]$ResourceGroup = "myResourceGroup",
    [string]$SubscriptionId = "",          # optional; uses current context if empty

    # Edge action names must match [a-zA-Z0-9]+ (no hyphens). AFD names may use hyphens.
    [string]$EdgeActionName = "ssrRouter",
    [string]$Version        = "v1",
    [string]$Location       = "global",

    # AFD resources
    [string]$AfdProfile   = "ssrDemoAfd",
    [string]$AfdEndpoint  = "ssrdemo",
    [string]$OriginGroup  = "ssrOriginGroup",
    [string]$OriginName   = "ssrOrigin",
    [string]$OriginHost   = "example.com",   # placeholder backend
    [string]$RuleSet      = "ssrRuleSet",
    [string]$RouteName    = "ssrRoute",
    [string]$EdgeRule     = "ssrEdgeRule",

    # When the edge action runs: ClientRequest | OriginRequest
    [ValidateSet("ClientRequest", "OriginRequest")]
    [string]$InvocationPoint = "ClientRequest",

    [string]$CodeFile = ""
)

$ErrorActionPreference = "Stop"

$Sku = "{name:Standard,tier:Standard}"

if (-not $CodeFile) {
    $CodeFile = Join-Path $PSScriptRoot "edge_action.js"
}

Write-Host "==> Ensuring CLI extensions are present (edge-action + cdn)"
az extension add --name edge-action --upgrade --only-show-errors 2>$null
az extension add --name cdn --upgrade --only-show-errors 2>$null

if ($SubscriptionId) {
    Write-Host "==> Setting subscription: $SubscriptionId"
    az account set --subscription $SubscriptionId
}
$Sub = az account show --query id -o tsv
Write-Host "==> Using subscription: $Sub"

# --- 1. Edge action ----------------------------------------------------------
Write-Host "==> 1/9 Creating edge action: $EdgeActionName"
az edge-action create `
    --resource-group $ResourceGroup `
    --edge-action-name $EdgeActionName `
    --location $Location `
    --sku $Sku

Write-Host "==> 2/9 Creating default version: $Version"
az edge-action version create `
    --resource-group $ResourceGroup `
    --edge-action-name $EdgeActionName `
    --version $Version `
    --location $Location `
    --deployment-type file `
    --is-default-version True

Write-Host "==> 3/9 Deploying code from: $CodeFile (long-running, ~10 min)"
az edge-action version deploy-from-file `
    --resource-group $ResourceGroup `
    --edge-action-name $EdgeActionName `
    --version $Version `
    --file-path $CodeFile

$EdgeActionId = az edge-action show -g $ResourceGroup `
    --edge-action-name $EdgeActionName --query id -o tsv
Write-Host "    edge action id: $EdgeActionId"

# --- 2. AFD front end --------------------------------------------------------
Write-Host "==> 4/9 Creating AFD profile: $AfdProfile"
az afd profile create -g $ResourceGroup --profile-name $AfdProfile `
    --sku Standard_AzureFrontDoor

Write-Host "==> 5/9 Creating endpoint: $AfdEndpoint"
az afd endpoint create -g $ResourceGroup --profile-name $AfdProfile `
    --endpoint-name $AfdEndpoint --enabled-state Enabled

Write-Host "==> 6/9 Creating origin group + origin (placeholder: $OriginHost)"
az afd origin-group create -g $ResourceGroup --profile-name $AfdProfile `
    --origin-group-name $OriginGroup `
    --probe-request-type GET --probe-protocol Https --probe-path / `
    --probe-interval-in-seconds 100 `
    --sample-size 4 --successful-samples-required 3 `
    --additional-latency-in-milliseconds 50

az afd origin create -g $ResourceGroup --profile-name $AfdProfile `
    --origin-group-name $OriginGroup --origin-name $OriginName `
    --host-name $OriginHost --origin-host-header $OriginHost `
    --http-port 80 --https-port 443 --priority 1 --weight 1000 `
    --enabled-state Enabled --enforce-certificate-name-check false

Write-Host "==> 7/9 Creating rule set + route (/* -> origin group)"
az afd rule-set create -g $ResourceGroup --profile-name $AfdProfile `
    --rule-set-name $RuleSet

az afd route create -g $ResourceGroup --profile-name $AfdProfile `
    --endpoint-name $AfdEndpoint --route-name $RouteName `
    --origin-group $OriginGroup --rule-sets $RuleSet `
    --supported-protocols Http Https --patterns-to-match '/*' `
    --forwarding-protocol MatchRequest --link-to-default-domain Enabled `
    --https-redirect Disabled

# --- 3. The binding that makes the action fire -------------------------------
Write-Host "==> 8/9 Binding edge action via an EdgeAction delivery-rule action"
az afd rule create -g $ResourceGroup --profile-name $AfdProfile `
    --rule-set-name $RuleSet --rule-name $EdgeRule --order 1 `
    --action-name EdgeAction `
    --edge-action-id $EdgeActionId `
    --invocation-point $InvocationPoint

Write-Host "==> 9/9 Done. Resolving endpoint host"
$AfdHost = az afd endpoint show -g $ResourceGroup --profile-name $AfdProfile `
    --endpoint-name $AfdEndpoint --query hostName -o tsv

Write-Host @"

Provisioned and bound. Host: https://$AfdHost/

AFD edge propagation takes ~10-20 minutes. Then verify the action is firing:

  curl.exe -sD - -o NUL -H "Accept-Language: fr-FR" "https://$AfdHost/" |
    Select-String -Pattern 'x-rendered-at|location|x-geo-country|x-device-class'

Expected (HTTP 200 with the edge action's personalization headers):
  location: /fr/desktop
  x-edge-locale: fr
  x-device-class: desktop
  x-geo-country: FR
  x-rendered-at: edge
"@
