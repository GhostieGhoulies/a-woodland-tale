#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# This static game has no dependencies to install or database to migrate.
# Check the entry point and the standard-library server used by the workflow.
test -s index.html
python3 -c 'import http.server'
printf '%s\n' 'Static game is ready; no dependency installation or migration required.'
