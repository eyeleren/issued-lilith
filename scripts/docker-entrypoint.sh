#!/bin/sh
set -e

# Bind-mounted folders created from the QNAP web UI belong to root: fix them, then drop to "node".
if [ "$(id -u)" = "0" ]; then
	mkdir -p "$DATA_DIR"
	chown -R node:node "$DATA_DIR"
	exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
