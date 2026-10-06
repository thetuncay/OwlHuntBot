# OwlHunt — Windows acilisinda baslat / kapanista durdur
# Calistir: powershell -ExecutionPolicy Bypass -File scripts\install-autostart-windows.ps1
$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$StartPs1 = Join-Path $Root 'start-windows.ps1'
$StopPs1 = Join-Path $Root 'stop-windows.ps1'
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$startupDir = [Environment]::GetFolderPath('Startup')
$startupVbs = Join-Path $startupDir 'OwlHuntBot-Startup.vbs'

if (-not (Test-Path $StartPs1)) { throw "start-windows.ps1 yok: $StartPs1" }
if (-not (Test-Path $StopPs1)) { throw "stop-windows.ps1 yok: $StopPs1" }

$startName = 'OwlHunt-Bot-Start'
$stopName = 'OwlHunt-Bot-Stop'

foreach ($n in @($startName, $stopName)) {
  Unregister-ScheduledTask -TaskName $n -Confirm:$false -ErrorAction SilentlyContinue
}

# 1) Startup VBS
$vbs = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File ""$StartPs1""", 0, False
"@
Set-Content -Path $startupVbs -Value $vbs -Encoding ASCII
Write-Host "Startup VBS yazildi: $startupVbs"

# Eski WSL startup -> yeni start
$legacy = 'C:\Users\maste\owlhunt-startup.ps1'
if (Test-Path $legacy) {
  Set-Content -Path $legacy -Value "& '$StartPs1'" -Encoding UTF8
  Write-Host "Eski owlhunt-startup.ps1 yeni start-windows.ps1'e yonlendirildi"
}

# 2) AtLogOn +45s
$startArg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartPs1`""
$startAction = New-ScheduledTaskAction -Execute $psExe -Argument $startArg -WorkingDirectory $Root
$startTrigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$startTrigger.Delay = 'PT45S'
$startSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew
$startPrincipal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $startName `
  -Action $startAction `
  -Trigger $startTrigger `
  -Settings $startSettings `
  -Principal $startPrincipal `
  -Description 'OwlHunt bot: oturum acilinca Docker + PM2 baslat' `
  -Force | Out-Null
Write-Host "Gorev kaydedildi: $startName"

# 3) Stop XML
$stopXmlPath = Join-Path $PSScriptRoot 'OwlHunt-Bot-Stop.xml'
$stopXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>OwlHunt bot: oturum/kapanista PM2 durdur</Description>
  </RegistrationInfo>
  <Triggers>
    <EventTrigger>
      <Enabled>true</Enabled>
      <Subscription>&lt;QueryList&gt;&lt;Query Id="0" Path="System"&gt;&lt;Select Path="System"&gt;*[System[Provider[@Name='User32'] and (EventID=1074)]]&lt;/Select&gt;&lt;/Query&gt;&lt;/QueryList&gt;</Subscription>
    </EventTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$userId</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <ExecutionTimeLimit>PT2M</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$psExe</Command>
      <Arguments>-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$StopPs1"</Arguments>
      <WorkingDirectory>$Root</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@
[System.IO.File]::WriteAllText($stopXmlPath, $stopXml, [System.Text.Encoding]::Unicode)

$stopOk = $false
try {
  Register-ScheduledTask -TaskName $stopName -Xml (Get-Content -Path $stopXmlPath -Raw -Encoding Unicode) -Force | Out-Null
  $stopOk = $true
  Write-Host "Gorev kaydedildi: $stopName (logoff + shutdown)"
} catch {
  Write-Host ("Stop gorevi Register-ScheduledTask ile kurulamadi: " + $_.Exception.Message) -ForegroundColor Yellow
  & schtasks.exe /Create /TN $stopName /XML $stopXmlPath /F
  if ($LASTEXITCODE -eq 0) {
    $stopOk = $true
    Write-Host "Gorev kaydedildi (schtasks): $stopName"
  } else {
    Write-Host 'Stop gorevi kurulamadi (admin gerekebilir). PC kapaninca process zaten biter.' -ForegroundColor Yellow
  }
}

Write-Host ''
Write-Host '=== Kurulum ozeti ===' -ForegroundColor Green
Write-Host "Start: Startup VBS + gorev $startName (logon +45sn)"
if ($stopOk) {
  Write-Host "Stop:  gorev $stopName (logoff / kapatma)"
} else {
  Write-Host 'Stop:  gorev kurulamadi - PC kapaninca bot zaten kapanir'
}
Write-Host "Log:   $Root\logs\autostart.log"
Write-Host 'Kaldir: powershell -ExecutionPolicy Bypass -File scripts\uninstall-autostart-windows.ps1'
Write-Host ''
Get-ScheduledTask -TaskName $startName, $stopName -ErrorAction SilentlyContinue | Format-Table TaskName, State -AutoSize
Write-Host "Startup: $startupVbs"
Write-Host ''
Write-Host 'Docker Desktop: Settings > General > "Start Docker Desktop when you sign in" acik olsun.'
