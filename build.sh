#!/usr/bin/env bash
set -euo pipefail

echo "==> Building DiscordLight for macOS..."
make build

echo "==> DiscordLight build successful!"
echo "To run locally: open DiscordLight.app"
echo "To install to Applications: make install"
