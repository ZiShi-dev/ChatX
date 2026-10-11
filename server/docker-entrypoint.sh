#!/bin/sh
set -e
if [ -d /media ]; then
  mkdir -p /media/images /media/files
  chown -R node:node /media
fi
exec su-exec node "$@"
