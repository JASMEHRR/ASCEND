@echo off
cd /d E:\imp\projects\ASCEND
rd /s /q .git 2>nul

echo === Initializing git ===
"E:\imp\_Apps_For_C_Drive\Git\cmd\git.exe" init -b main
"E:\imp\_Apps_For_C_Drive\Git\cmd\git.exe" config user.email "jasmehr2005@gmail.com"
"E:\imp\_Apps_For_C_Drive\Git\cmd\git.exe" config user.name "JASMEHRR"

echo === Staging files ===
"E:\imp\_Apps_For_C_Drive\Git\cmd\git.exe" add .

echo === Committing ===
"E:\imp\_Apps_For_C_Drive\Git\cmd\git.exe" commit -m "Initial commit"

echo === Adding remote ===
"E:\imp\_Apps_For_C_Drive\Git\cmd\git.exe" remote add origin https://github.com/JASMEHRR/ASCEND.git

echo === Pushing to GitHub (a login window may appear) ===
"E:\imp\_Apps_For_C_Drive\Git\cmd\git.exe" push -u origin main

echo.
echo === Done! https://github.com/JASMEHRR/ASCEND ===
pause
