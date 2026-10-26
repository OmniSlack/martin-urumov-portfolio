#!/bin/bash
# shim: maps docker exec/restart for the test container to a local PostgreSQL 16 on 127.0.0.1:54329
# Used on 2026-10-26 to run test/postgres without Docker: put this file on PATH as "docker".
# Maps: docker exec [-i] <container> CMD...  -> CMD against 127.0.0.1:54329 as postgres
#       docker restart <container>          -> pg_ctl restart of the local cluster
# Adjust PGD to your data directory.
PGD=/var/lib/postgresql/navpg
case "$1" in
  exec) shift; [ "$1" = "-i" ] && shift; shift; exec env PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres "$@";;
  restart) su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGD -o '-p 54329 -c listen_addresses=127.0.0.1' -l $PGD/log restart" >/dev/null 2>&1; sleep 1; exit $?;;
  *) echo "shim: unsupported docker verb $1" >&2; exit 1;;
esac
