param(
    [int]$Port = 8080,
    [string]$Root = "C:\Users\hjs56\Downloads\vacation-project-main\vacation-project-main"
)

if (-not (Test-Path -LiteralPath $Root)) {
    Write-Host "[오류] 프로젝트 폴더를 찾을 수 없습니다: $Root"
    exit 1
}

$Root = (Resolve-Path -LiteralPath $Root).Path
$url = "http://localhost:$Port/"

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "text/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".woff" = "font/woff"
    ".woff2" = "font/woff2"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
$listener.Start()

Write-Host ""
Write-Host "  Memento server running"
Write-Host "  Folder: $Root"
Write-Host "  URL:    $url"
Write-Host ""
Write-Host "  Close this window to stop the server."
Write-Host ""

Start-Process $url

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $localPath = $request.Url.LocalPath
        if ($localPath -eq "/") {
            $localPath = "/index.html"
        }

        $relative = $localPath.TrimStart("/").Replace("/", [IO.Path]::DirectorySeparatorChar)
        $filePath = Join-Path $Root $relative

        if (Test-Path -LiteralPath $filePath -PathType Leaf) {
            $bytes = [IO.File]::ReadAllBytes($filePath)
            $ext = [IO.Path]::GetExtension($filePath).ToLower()
            $response.ContentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
            $response.StatusCode = 200
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $msg = [Text.Encoding]::UTF8.GetBytes("404 Not Found: $localPath")
            $response.ContentLength64 = $msg.Length
            $response.OutputStream.Write($msg, 0, $msg.Length)
        }

        $response.Close()
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
