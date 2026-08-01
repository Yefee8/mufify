@echo off
REM One command to get Mufify running on Windows: check the toolchain, find a
REM device, start the dev server.
REM
REM This script *checks* and *reports*. It never sets JAVA_HOME, ANDROID_HOME or
REM PATH for you, and that is deliberate — silently rewriting a developer's
REM toolchain environment for the duration of one command produces a build that
REM works here and nowhere else, and the failure surfaces hours later somewhere
REM unrelated. When something is missing it says exactly what, and stops.

setlocal enabledelayedexpansion
set PROBLEMS=0

echo Checking the toolchain

REM --- Node ---------------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo   [X] Node is not installed.
  echo       Mufify needs Node 22 or newer: https://nodejs.org
  set /a PROBLEMS+=1
) else (
  for /f "tokens=*" %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
  if !NODE_MAJOR! LSS 22 (
    for /f "tokens=*" %%v in ('node -v') do echo   [X] Node %%v is too old. Mufify needs 22 or newer.
    set /a PROBLEMS+=1
  ) else (
    for /f "tokens=*" %%v in ('node -v') do echo   [ok] Node %%v
  )
)

REM --- Java ---------------------------------------------------------------
REM Checked through JAVA_HOME rather than whatever java is on PATH: Gradle uses
REM JAVA_HOME, so that is the one that decides whether a build works.
if "%JAVA_HOME%"=="" (
  echo   [X] JAVA_HOME is not set.
  echo       Gradle reads JAVA_HOME, not the java on your PATH.
  echo       Android Studio's bundled JDK is fine. Set it to something like:
  echo         C:\Program Files\Android\Android Studio\jbr
  set /a PROBLEMS+=1
) else (
  if not exist "%JAVA_HOME%\bin\java.exe" (
    echo   [X] JAVA_HOME points somewhere without a JDK: %JAVA_HOME%
    echo       There is no bin\java.exe under it.
    set /a PROBLEMS+=1
  ) else (
    echo   [ok] Java at %JAVA_HOME%
  )
)

REM --- Android SDK --------------------------------------------------------
if "%ANDROID_HOME%"=="" (
  echo   [X] ANDROID_HOME is not set.
  echo       Set it to something like: %%LOCALAPPDATA%%\Android\Sdk
  echo       and add %%ANDROID_HOME%%\platform-tools to your PATH.
  set /a PROBLEMS+=1
) else (
  if not exist "%ANDROID_HOME%" (
    echo   [X] ANDROID_HOME points at a directory that does not exist: %ANDROID_HOME%
    set /a PROBLEMS+=1
  ) else (
    echo   [ok] Android SDK at %ANDROID_HOME%
    REM Point releases exist (android-36.1), so accept any android-36* too.
    set SDK_OK=0
    if exist "%ANDROID_HOME%\platforms\android-36" set SDK_OK=1
    for /d %%d in ("%ANDROID_HOME%\platforms\android-3[6-9]*") do set SDK_OK=1
    if !SDK_OK!==0 (
      echo   [X] SDK Platform 36 or newer is not installed.
      echo       Android Studio, Settings, Languages ^& Frameworks, Android SDK:
      echo       tick "Android API 36" and apply.
      set /a PROBLEMS+=1
    ) else (
      echo   [ok] SDK Platform 36 or newer
    )
  )
)

where adb >nul 2>&1
if errorlevel 1 (
  echo   [X] adb is not on your PATH.
  echo       Add %%ANDROID_HOME%%\platform-tools to it.
  set /a PROBLEMS+=1
) else (
  echo   [ok] adb found
)

if %PROBLEMS% GTR 0 (
  echo.
  echo %PROBLEMS% problem^(s^) above. Fix them and run this again.
  exit /b 1
)

REM --- Dependencies -------------------------------------------------------
if not exist node_modules (
  echo.
  echo Installing dependencies
  call npm install
  if errorlevel 1 exit /b 1
) else (
  echo   [ok] Dependencies present
)

REM --- Device -------------------------------------------------------------
echo.
echo Looking for a device
set DEVICE_COUNT=0
for /f "skip=1 tokens=1,2" %%a in ('adb devices') do (
  if "%%b"=="device" (
    set /a DEVICE_COUNT+=1
    REM Metro is reached over a reverse tunnel, re-established per connection.
    adb -s %%a reverse tcp:8081 tcp:8081 >nul 2>&1
  )
)

if %DEVICE_COUNT%==0 (
  echo   [!] No device or emulator connected.
  echo       Plug in a phone with USB debugging on, or start an emulator from
  echo       Android Studio's Device Manager.
  echo       Metro will start anyway; connect a device and it will pick it up.
) else (
  echo   [ok] %DEVICE_COUNT% device^(s^) connected
)

REM --- Go -----------------------------------------------------------------
echo.
echo Starting Metro
echo   If the app is not installed yet, run: npx expo run:android
echo   That is a ten-minute native build and is only needed once, or after a
echo   native dependency or app.json change.
echo.

call npx expo start --dev-client
