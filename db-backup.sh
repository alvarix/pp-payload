#!/bin/bash
set -e

source ".$(dirname "$0")/../.env"

OUTFILE="backup_$(date +%Y%m%d_%H%M%S).sql"

echo "Backing up to $OUTFILE..."
pg_dump "$DATABASE_URL" > "$OUTFILE"
echo "Done: $OUTFILE ($(du -h "$OUTFILE" | cut -f1))"
