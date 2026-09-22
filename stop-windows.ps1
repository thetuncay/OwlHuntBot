# OwlHunt — Windows arka plan durdur
Set-Location $PSScriptRoot
pm2 stop owlhunt-bot owlhunt-worker
pm2 save
pm2 status
Write-Host 'Bot durduruldu.'
