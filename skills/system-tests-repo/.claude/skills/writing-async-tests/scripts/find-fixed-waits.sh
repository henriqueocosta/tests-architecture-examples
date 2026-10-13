#!/usr/bin/env bash
# Lists fixed waits in test files: sleeps and timeouts that wait for time
# instead of a condition. Usage: find-fixed-waits.sh <tests-dir> [more dirs...]
# Exit code 1 when something is found, so it can run in CI.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <tests-dir> [more dirs...]" >&2
  exit 2
fi

# Patterns that wait for time. The pause between polls inside a helper like
# waitFor is legitimate: mark that line with "allow-fixed-wait: <reason>".
PATTERN='(\bsleep\(|waitForTimeout\(|new Promise\(\(?resolve\)? *=> *setTimeout)'
ALLOW_MARKER='allow-fixed-wait:'

if grep -rnE --include='*.ts' --include='*.js' "$PATTERN" "$@" | grep -v "$ALLOW_MARKER"; then
  echo
  echo "Fixed waits found above. Replace each with a wait for a condition (waitFor, expect.poll, toHaveText)." >&2
  exit 1
fi

echo "No fixed waits found."
