#!/usr/bin/env bash
#
# One command to get Mufify running: check the toolchain, find a device, start
# the dev server.
#
# This script *checks* and *reports*. It never sets JAVA_HOME, ANDROID_HOME or
# PATH for you, and that is deliberate — silently rewriting a developer's
# toolchain environment for the duration of one command produces a build that
# works here and nowhere else, and the failure surfaces hours later somewhere
# unrelated. When something is missing it says exactly what, and stops.

set -euo pipefail

readonly REQUIRED_NODE_MAJOR=22
readonly REQUIRED_SDK_PLATFORM=36

# Only colour when writing to a terminal, so piping to a file stays readable.
if [ -t 1 ]; then
  readonly BOLD=$'\033[1m' RED=$'\033[31m' YELLOW=$'\033[33m' GREEN=$'\033[32m' OFF=$'\033[0m'
else
  readonly BOLD='' RED='' YELLOW='' GREEN='' OFF=''
fi

problems=0

fail() {
  printf '%s✗ %s%s\n' "$RED" "$1" "$OFF" >&2
  shift
  for line in "$@"; do printf '    %s\n' "$line" >&2; done
  problems=$((problems + 1))
}

ok()   { printf '%s✓%s %s\n' "$GREEN" "$OFF" "$1"; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$OFF" "$1"; }

printf '%sChecking the toolchain%s\n' "$BOLD" "$OFF"

# --- Node ---------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  fail "Node is not installed." \
       "Mufify needs Node ${REQUIRED_NODE_MAJOR} or newer." \
       "https://nodejs.org, or: brew install node"
else
  node_major=$(node -p 'process.versions.node.split(".")[0]')
  if [ "$node_major" -lt "$REQUIRED_NODE_MAJOR" ]; then
    fail "Node $(node -v) is too old." \
         "Mufify needs ${REQUIRED_NODE_MAJOR} or newer."
  else
    ok "Node $(node -v)"
  fi
fi

# --- Java ---------------------------------------------------------------
# Checked through JAVA_HOME rather than whatever `java` happens to be on PATH:
# Gradle uses JAVA_HOME, so that is the one that decides whether a build works.
if [ -z "${JAVA_HOME:-}" ]; then
  fail "JAVA_HOME is not set." \
       "Gradle reads JAVA_HOME, not the java on your PATH." \
       "Android Studio's bundled JDK is fine. Add to ~/.zshrc:" \
       '  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"'
elif [ ! -x "$JAVA_HOME/bin/java" ]; then
  fail "JAVA_HOME points somewhere without a JDK: $JAVA_HOME" \
       "There is no bin/java under it."
else
  java_version=$("$JAVA_HOME/bin/java" -version 2>&1 | head -1 | sed 's/.*"\(.*\)".*/\1/')
  java_major=${java_version%%.*}
  if [ "$java_major" != "17" ] && [ "$java_major" != "21" ]; then
    warn "Java $java_version — this project is built and tested against 17 and 21."
  else
    ok "Java $java_version"
  fi
fi

# --- Android SDK --------------------------------------------------------
if [ -z "${ANDROID_HOME:-}" ]; then
  fail "ANDROID_HOME is not set." \
       "Add to ~/.zshrc:" \
       '  export ANDROID_HOME="$HOME/Library/Android/sdk"' \
       '  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"'
elif [ ! -d "$ANDROID_HOME" ]; then
  fail "ANDROID_HOME points at a directory that does not exist: $ANDROID_HOME"
else
  ok "Android SDK at $ANDROID_HOME"

  # Any platform at or above the required one will do, and the installed
  # directories carry point releases (android-36.1), so this compares the major
  # number rather than looking for one exact directory name.
  highest=$(ls "$ANDROID_HOME/platforms" 2>/dev/null \
    | sed -n 's/^android-\([0-9][0-9]*\).*/\1/p' | sort -n | tail -1)

  if [ -z "$highest" ]; then
    fail "No SDK platform is installed." \
         "Android Studio → Settings → Languages & Frameworks → Android SDK," \
         "tick 'Android API $REQUIRED_SDK_PLATFORM' and apply."
  elif [ "$highest" -lt "$REQUIRED_SDK_PLATFORM" ]; then
    fail "SDK Platform $REQUIRED_SDK_PLATFORM or newer is required; highest installed is $highest." \
         "Android Studio → Settings → Languages & Frameworks → Android SDK," \
         "tick 'Android API $REQUIRED_SDK_PLATFORM' and apply."
  else
    ok "SDK Platform $highest"
  fi
fi

if ! command -v adb >/dev/null 2>&1; then
  fail "adb is not on your PATH." \
       'Add: export PATH="$ANDROID_HOME/platform-tools:$PATH"'
else
  ok "adb $(adb version 2>/dev/null | head -1 | awk '{print $NF}')"
fi

if [ "$problems" -gt 0 ]; then
  printf '\n%s%d problem(s) above. Fix them and run this again.%s\n' "$RED" "$problems" "$OFF" >&2
  exit 1
fi

# --- Dependencies -------------------------------------------------------
# node_modules older than the lockfile means someone pulled a dependency change.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  printf '\n%sInstalling dependencies%s\n' "$BOLD" "$OFF"
  npm install
else
  ok "Dependencies up to date"
fi

# --- Device -------------------------------------------------------------
printf '\n%sLooking for a device%s\n' "$BOLD" "$OFF"

devices=$(adb devices | awk 'NR>1 && $2=="device" {print $1}')

if [ -z "$devices" ]; then
  warn "No device or emulator connected."
  echo
  echo "  Plug in a phone with USB debugging on, or start an emulator:"
  if command -v emulator >/dev/null 2>&1; then
    avds=$(emulator -list-avds 2>/dev/null || true)
    if [ -n "$avds" ]; then
      echo "$avds" | sed 's/^/    emulator -avd /'
      echo
      echo "  On a machine short of RAM, headless survives where windowed does not:"
      echo "    emulator -avd <name> -no-snapshot -no-boot-anim -no-window -gpu swiftshader_indirect -memory 2048"
    else
      echo "    (no AVDs found — create one in Android Studio's Device Manager)"
    fi
  fi
  echo
  echo "  Metro will start anyway; connect a device and it will pick it up."
else
  count=$(printf '%s\n' "$devices" | wc -l | tr -d ' ')
  ok "$count device(s): $(printf '%s' "$devices" | tr '\n' ' ')"

  # Metro is reached over a reverse tunnel, which has to be re-established for
  # every device on every connection.
  for device in $devices; do
    adb -s "$device" reverse tcp:8081 tcp:8081 >/dev/null 2>&1 || true
  done
fi

# --- Go -----------------------------------------------------------------
printf '\n%sStarting Metro%s\n' "$BOLD" "$OFF"
echo "  If the app is not installed yet, run: npx expo run:android"
echo "  That is a ten-minute native build and is only needed once, or after a"
echo "  native dependency or app.json change."
echo

exec npx expo start --dev-client
