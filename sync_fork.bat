@echo off
REM سحب تحديثات من الريبو الرئيسي (ALAAWF2) ودمجها في fork عندك — بدون إرسال أي شيء للرئيسي
REM يشغّل من داخل مجلد المشروع (أو عدّل REPO تحت)

set "REPO=%~dp0"
if "%REPO:~-1%"=="\" set "REPO=%REPO:~0,-1%"
set "LOG=%REPO%\sync_fork_log.txt"

cd /d "%REPO%"
echo [%date% %time%] بدء السحب من upstream... >> "%LOG%"

git fetch upstream 2>> "%LOG%"
if errorlevel 1 (
  echo [%date% %time%] فشل fetch >> "%LOG%"
  exit /b 1
)

git merge upstream/main --no-edit 2>> "%LOG%"
if errorlevel 1 (
  echo [%date% %time%] يوجد تعارضات - حلّها يدوياً ثم: git add . ^&^& git commit -m "Merge upstream" ^&^& git push origin main >> "%LOG%"
  exit /b 1
)

git push origin main 2>> "%LOG%"
if errorlevel 1 (
  echo [%date% %time%] فشل push >> "%LOG%"
  exit /b 1
)

echo [%date% %time%] تم التحديث بنجاح >> "%LOG%"
exit /b 0
