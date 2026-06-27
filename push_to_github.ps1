# Find git.exe
$git = (Get-Command git -ErrorAction SilentlyContinue)?.Source
if (-not $git) {
    $searchPaths = @(
        "C:\Program Files\Git\cmd\git.exe",
        "C:\Program Files\Git\bin\git.exe",
        "C:\Program Files (x86)\Git\cmd\git.exe",
        "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe"
    )
    foreach ($p in $searchPaths) {
        if (Test-Path $p) { $git = $p; break }
    }
}
if (-not $git) {
    # Last resort: search drives
    $git = Get-ChildItem C:\, E:\ -Recurse -Filter git.exe -ErrorAction SilentlyContinue |
           Where-Object { $_.FullName -match "cmd.git.exe$" } |
           Select-Object -First 1 -ExpandProperty FullName
}
if (-not $git) {
    Write-Host "ERROR: git.exe not found. Please install Git for Windows." -ForegroundColor Red
    pause; exit 1
}

Write-Host "Using git: $git" -ForegroundColor Cyan
Set-Location "E:\imp\projects\ASCEND"

# Clean old broken .git
if (Test-Path ".git") { Remove-Item ".git" -Recurse -Force }

& $git init -b main
& $git config user.email "jasmehr2005@gmail.com"
& $git config user.name "JASMEHRR"
& $git add .
& $git commit -m "Initial commit"
& $git remote add origin "https://github.com/JASMEHRR/ASCEND.git"

Write-Host ""
Write-Host "Pushing to GitHub... (a browser login window may appear)" -ForegroundColor Yellow
& $git push -u origin main

Write-Host ""
Write-Host "Done! https://github.com/JASMEHRR/ASCEND" -ForegroundColor Green
Read-Host "Press Enter to close"
