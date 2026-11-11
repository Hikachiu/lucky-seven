# 開発用の簡易静的サーバー（Python/Node不要）
# 使い方: powershell -ExecutionPolicy Bypass -File scripts/serve.ps1 [-Port 8777]
param([int]$Port = 8777)

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"

$types = @{ ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"; ".css" = "text/css; charset=utf-8"; ".csv" = "text/csv; charset=utf-8"; ".json" = "application/json" }

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart("/"))
  if ($rel -eq "") { $rel = "index.html" }
  $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
  if ($path.StartsWith($root) -and (Test-Path $path -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($path)
    $ext = [IO.Path]::GetExtension($path).ToLower()
    $ctx.Response.ContentType = if ($types[$ext]) { $types[$ext] } else { "application/octet-stream" }
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.Headers.Add("Cache-Control", "no-store")
    if ($ctx.Request.HttpMethod -ne "HEAD") {
      try { $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) } catch { }
    }
  } else {
    $ctx.Response.StatusCode = 404
  }
  try { $ctx.Response.Close() } catch { }
}
