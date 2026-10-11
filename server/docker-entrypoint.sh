#!/bin/sh
set -e
if [ "$(id -u)" = "0" ] && [ -d /media ]; then
  mkdir -p /media/images /media/files
  # Do not recursively change Alpine's unrelated /media mount points.
  chown node:node /media
  chown -Rh node:node /media/images /media/files
fi
if [ "$(id -u)" = "0" ]; then
  exec su-exec node "$@"
fi
exec "$@"
