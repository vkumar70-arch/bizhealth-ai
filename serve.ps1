param([int]$Port = 3000)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

$Mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.ico'  = 'image/x-icon'
    '.png'  = 'image/png'
    '.svg'  = 'image/svg+xml'
}

$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add("http://localhost:$Port/")
$Listener.Start()

Write-Host ""
Write-Host "  BizHealth AI is running at:" -ForegroundColor Cyan
Write-Host "  http://localhost:$Port" -ForegroundColor Green
Write-Host ""
Write-Host "  Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

try {
    while ($Listener.IsListening) {
        $Context  = $Listener.GetContext()
        $Request  = $Context.Request
        $Response = $Context.Response

        $RawPath = $Request.Url.LocalPath
        if ($RawPath -eq '/') { $RawPath = '/index.html' }

        $FilePath = Join-Path $Root ($RawPath.TrimStart('/').Replace('/', '\'))

        if (Test-Path $FilePath -PathType Leaf) {
            $Ext     = [System.IO.Path]::GetExtension($FilePath).ToLower()
            $CType   = if ($Mime[$Ext]) { $Mime[$Ext] } else { 'application/octet-stream' }
            $Bytes   = [System.IO.File]::ReadAllBytes($FilePath)

            $Response.ContentType   = $CType
            $Response.ContentLength64 = $Bytes.Length
            $Response.StatusCode    = 200
            $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
        } else {
            $Body  = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $RawPath")
            $Response.StatusCode    = 404
            $Response.ContentType   = 'text/plain'
            $Response.ContentLength64 = $Body.Length
            $Response.OutputStream.Write($Body, 0, $Body.Length)
        }

        $Response.OutputStream.Close()
    }
} finally {
    $Listener.Stop()
}
