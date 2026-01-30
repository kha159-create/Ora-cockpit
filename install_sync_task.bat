@echo off
REM تثبيت مهمة ويندوز لتشغيل sync_fork.bat كل 15 دقيقة
REM شغّل هذا الملف مرة واحدة (كليك يمين — تشغيل كمسؤول إذا طلب منك)

set "BAT=%~dp0sync_fork.bat"
set "TASKNAME=SyncOraCockpitFromUpstream"

schtasks /query /tn "%TASKNAME%" >nul 2>&1
if %errorlevel% equ 0 (
  echo المهمة موجودة. جاري التحديث...
  schtasks /delete /tn "%TASKNAME%" /f >nul 2>&1
)

schtasks /create /tn "%TASKNAME%" /tr "\"%BAT%\"" /sc minute /mo 15 /f
if %errorlevel% neq 0 (
  echo فشل إنشاء المهمة. جرّب: كليك يمين على الملف — تشغيل كمسؤول
  pause
  exit /b 1
)

echo تم تثبيت المهمة: تشغيل كل 15 دقيقة.
echo لإلغائها لاحقاً: taskschd.msc ثم احذف "%TASKNAME%"
pause
