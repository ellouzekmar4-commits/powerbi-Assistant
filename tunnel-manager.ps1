# Gestionnaire de tunnel : demarre Cloudflare, capture l'URL,
# met a jour docs/url.txt sur GitHub automatiquement, et relance si le tunnel tombe.

$ErrorActionPreference = "SilentlyContinue"
$dir       = "C:\Users\admin\powerbi-chatbot-server"
$cf        = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$git       = "D:\Git\cmd\git.exe"
$logFile   = Join-Path $dir "tunnel-live.log"
$urlFile   = Join-Path $dir "docs\url.txt"
$token     = (Get-Content (Join-Path $dir "github-token.txt") -Raw).Trim()
$pushUrl   = "https://$token@github.com/ellouzekmar4-commits/powerbi-Assistant.git"

Set-Location $dir

while ($true) {
    # tuer d'eventuels tunnels residuels
    Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    if (Test-Path $logFile) { Remove-Item $logFile -Force }

    # demarrer un tunnel
    $proc = Start-Process -FilePath $cf -ArgumentList @('tunnel','--url','http://localhost:3000') `
        -RedirectStandardError $logFile -WindowStyle Hidden -PassThru

    # attendre l'URL (max ~40s)
    $url = $null
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Seconds 1
        $m = [regex]::Match((Get-Content $logFile -Raw), "https://[a-z0-9-]+\.trycloudflare\.com")
        if ($m.Success) { $url = $m.Value; break }
    }

    if ($url) {
        $current = ""
        if (Test-Path $urlFile) { $current = (Get-Content $urlFile -Raw).Trim() }
        if ($current -ne $url) {
            # mettre a jour le pointeur et le pousser sur GitHub
            Set-Content -Path $urlFile -Value $url -NoNewline -Encoding ascii
            & $git add docs/url.txt
            & $git commit -m "Maj URL tunnel: $url"
            & $git push $pushUrl main
        }
    }

    # attendre que le tunnel meure, puis relancer
    if ($proc) { Wait-Process -Id $proc.Id -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 5
}
