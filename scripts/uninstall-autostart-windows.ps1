# OwlHunt otomatik baslat/durdur kaldir
$ErrorActionPreference = 'Continue'

foreach ($n in @('OwlHunt-Bot-Start', 'OwlHunt-Bot-Stop')) {
  Unregister-ScheduledTask -TaskName $n -Confirm:$false -ErrorAction SilentlyContinue
  schtasks /Delete /TN $n /F 2>$null | Out-Null
  Write-Host "Gorev kaldirildi: $n"
}

$startupDir = [Environment]::GetFolderPath('Startup')
foreach ($f in @('OwlHuntBot-Startup.vbs', 'OwlHuntBot-Stop-Hint.txt')) {
  $p = Join-Path $startupDir $f
  if (Test-Path $p) {
    Remove-Item $p -Force
    Write-Host "Silindi: $p"
  }
}

Write-Host 'Tamam. (Not: C:\Users\maste\owlhunt-startup.ps1 elle kontrol edilebilir)'
