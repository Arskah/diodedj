#!/usr/bin/env bash
# Entrypoint for Dockerfile.e2e. Starts PulseAudio null-sink, ensures
# dependencies + release binary exist, then runs `pnpm e2e` under xvfb.
set -euxo pipefail

# Hermetic per-container Pulse state (avoids host socket reuse).
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/xdg}"
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

pulseaudio --start --exit-idle-time=-1 --log-target=stderr
pactl load-module module-null-sink sink_name=dummy sink_properties=device.description=Dummy
pactl set-default-sink dummy

# Install deps if needed. Detect empty dir (named volume mount) as missing,
# not just absence — `-d` is true for an empty mounted volume.
if [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
  pnpm install --frozen-lockfile
fi

# Build release binary if missing.
if [ ! -f src-tauri/target/release/diodedj ]; then
  E2E_BINARY="${E2E_BINARY:-release}" pnpm tauri build --no-bundle
fi

mkdir -p e2e-results
# Pre-create + tail tauri-driver.log so its lines surface in `docker logs`
# (and bind-mount stdout) live, without piping into the wdio worker's
# `process.stdout` which causes ERR_STREAM_WRITE_AFTER_END on shutdown.
: > e2e-results/tauri-driver.log
tail -F e2e-results/tauri-driver.log &
exec xvfb-run -a -e e2e-results/xvfb.log pnpm e2e
