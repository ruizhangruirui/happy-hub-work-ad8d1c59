$ErrorActionPreference = "Stop"
$exe = Join-Path $PSScriptRoot "publish\TeamWorkbench.OutlookHelper.exe"
if (-not (Test-Path $exe)) { throw "Run publish.ps1 first." }
$startup = [Environment]::GetFolderPath("Startup")
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $startup "Team Workbench Outlook Helper.lnk"))
$shortcut.TargetPath = $exe
$shortcut.WorkingDirectory = Split-Path $exe
$shortcut.Save()
Start-Process $exe
