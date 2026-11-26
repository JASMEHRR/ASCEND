# Starts the laptop bridge at Windows login, hidden (pythonw), as a Task Scheduler task.
#   powershell -ExecutionPolicy Bypass -File install-autostart.ps1          # install
#   powershell -ExecutionPolicy Bypass -File install-autostart.ps1 -Remove  # remove
param([switch]$Remove)

$TaskName = 'Laptop Bridge'
if ($Remove) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed '$TaskName'."
    return
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
if (-not $pythonw) { throw 'pythonw.exe was not found on PATH. Install Python 3.11+ first.' }

$action = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$here\bridge.py`" run" -WorkingDirectory $here
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Days 0) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Installed '$TaskName': starts at login. Logs: $here\logs\bridge.log"
