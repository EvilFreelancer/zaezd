#!/usr/bin/env bash
# usage: ./mcp.sh <method> <params-json>
curl -sS -X POST https://mcp.tutu.ru/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}" --max-time 90
