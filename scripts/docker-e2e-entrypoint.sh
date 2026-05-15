#!/usr/bin/env bash
# Entrypoint for Dockerfile.e2e. Starts PulseAudio null-sink, ensures
# dependencies + release binary exist, then runs `pnpm e2e` under xvfb.
set -euo pipefail

# Hermetic per-container Pulse state (avoids host socket reuse).
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/xdg}"
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

pulseaudio --start --exit-idle-time=-1 --log-target=stderr
pactl load-module module-null-sink sink_name=dummy sink_properties=device.description=Dummy
pactl set-default-sink dummy

# Install deps if needed (cache-friendly: skipped when node_modules present).
if [ ! -d node_modules ]; then
  pnpm install --frozen-lockfile
fi

# Build release binary if missing. Skipped if already present from host.
if [ ! -f src-tauri/target/release/diodedj ]; then
  E2E_BINARY="${E2E_BINARY:-release}" pnpm tauri build --no-bundle
fi

exec xvfb-run -a pnpm e2e
