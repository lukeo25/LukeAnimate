param([int]$Port = 8765)

$ErrorActionPreference = 'Stop'
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")

function Send-Json($Context, $Value, [int]$Status = 200) {
  $json = $Value | ConvertTo-Json -Depth 8 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $Context.Response.StatusCode = $Status
  $Context.Response.ContentType = 'application/json; charset=utf-8'
  $Context.Response.Headers['Access-Control-Allow-Origin'] = '*'
  $Context.Response.Headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
  $Context.Response.Headers['Access-Control-Allow-Headers'] = 'Content-Type'
  $Context.Response.ContentLength64 = $bytes.Length
  $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Context.Response.Close()
}

function Get-Scanners {
  $manager = New-Object -ComObject WIA.DeviceManager
  $items = @()
  foreach ($info in $manager.DeviceInfos) {
    if ([int]$info.Type -ne 1) { continue }
    $name = $info.Properties.Item('Name').Value
    $items += [pscustomobject]@{ id = [string]$info.DeviceID; name = [string]$name }
  }
  return $items
}

function Set-WiaProperty($Properties, [int]$Id, $Value) {
  try { $Properties.Item($Id).Value = $Value } catch { }
}

function Scan-Page([string]$DeviceId, [int]$Dpi, [string]$Colour) {
  $manager = New-Object -ComObject WIA.DeviceManager
  $info = $null
  foreach ($candidate in $manager.DeviceInfos) {
    if ([string]$candidate.DeviceID -eq $DeviceId) { $info = $candidate; break }
  }
  if ($null -eq $info) { throw 'The selected scanner is no longer available.' }
  $device = $info.Connect()
  if ($device.Items.Count -lt 1) { throw 'The scanner did not expose a scan source.' }
  $item = $device.Items.Item(1)
  Set-WiaProperty $item.Properties 6147 $Dpi
  Set-WiaProperty $item.Properties 6148 $Dpi
  $intent = switch ($Colour) { 'grayscale' { 2 } 'text' { 4 } default { 1 } }
  Set-WiaProperty $item.Properties 6146 $intent
  $pngFormat = '{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}'
  $dialog = New-Object -ComObject WIA.CommonDialog
  $image = $dialog.ShowTransfer($item, $pngFormat, $false)
  if ($null -eq $image) { throw 'Scanning was cancelled.' }
  $temporary = Join-Path ([IO.Path]::GetTempPath()) ('LukeAnimate-Scan-' + [guid]::NewGuid().ToString('N') + '.png')
  $image.SaveFile($temporary)
  try {
    $bytes = [IO.File]::ReadAllBytes($temporary)
    return [pscustomobject]@{
      name = 'Scan-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.png'
      mimeType = 'image/png'
      dataUrl = 'data:image/png;base64,' + [Convert]::ToBase64String($bytes)
    }
  } finally {
    Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
  }
}

try {
  $listener.Start()
  Write-Host "Luke Animate Scanner Bridge is running on http://127.0.0.1:$Port/"
  Write-Host 'Leave this window open while scanning. Press Ctrl+C to stop.'
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      if ($context.Request.HttpMethod -eq 'OPTIONS') { Send-Json $context @{ ok = $true }; continue }
      switch ($context.Request.Url.AbsolutePath) {
        '/scanners' { Send-Json $context @{ scanners = @(Get-Scanners) } }
        '/scan' {
          $id = [Uri]::UnescapeDataString([string]$context.Request.QueryString['id'])
          $dpi = [Math]::Max(75, [Math]::Min(2400, [int]$context.Request.QueryString['dpi']))
          $colour = [string]$context.Request.QueryString['colour']
          Send-Json $context (Scan-Page $id $dpi $colour)
        }
        '/health' { Send-Json $context @{ ok = $true; service = 'Luke Animate Scanner Bridge' } }
        default { Send-Json $context @{ error = 'Not found.' } 404 }
      }
    } catch {
      try { Send-Json $context @{ error = $_.Exception.Message } 500 } catch { }
    }
  }
} finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
}
