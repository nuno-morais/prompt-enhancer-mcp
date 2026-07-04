#!/bin/bash
# Uso: ./test-manual.sh "o teu rascunho aqui" [generic|claude|gpt4o] [true|false] [true|false]
# O 3º argumento ativa o modo brainstorm (personas). Default: false.
# O 4º argumento ativa explain (resumo de 1 linha do que o critic mudou). Default: false.
# Nota: a pipeline pode fazer 1 (draft trivial), 2, ou 3 (com explain) chamadas
# sequenciais ao Ollama. O script para assim que a resposta chegar, em vez de
# esperar sempre um tempo fixo — por isso um cache hit ou skip-critic devolve
# quase de imediato, e um pedido completo (2-3 chamadas) pode demorar até ~180s.
# Nota: pedidos repetidos com os mesmos 5 parâmetros (draft+mode+brainstorm+explain+model)
# são servidos por um cache in-memory (TTL 1h) — a 2ª execução idêntica deve ser quase instantânea.

DRAFT="${1:-quero um resumo curto}"
MODE="${2:-generic}"
BRAINSTORM="${3:-false}"
EXPLAIN="${4:-false}"

OUTPUT_FILE=$(mktemp)
FIFO=$(mktemp -u)
mkfifo "$FIFO"

cleanup() {
  exec 3>&- 2>/dev/null
  kill "$NODE_PID" 2>/dev/null
  wait "$NODE_PID" 2>/dev/null
  rm -f "$OUTPUT_FILE" "$FIFO"
}
trap cleanup EXIT

node "$(dirname "$0")/dist/index.js" < "$FIFO" > "$OUTPUT_FILE" 2>&1 &
NODE_PID=$!

# Open the FIFO for writing on fd 3 and keep it open until we explicitly close it below —
# this avoids the separate "sleep N" writer subshell that used to keep the pipeline alive
# (and made `kill`/`wait` hang) even after the node process itself had been killed.
exec 3>"$FIFO"

echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.0.1"}}}' >&3
sleep 0.3
echo '{"jsonrpc":"2.0","method":"notifications/initialized"}' >&3
sleep 0.3
echo "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"optimize_prompt\",\"arguments\":{\"draft\":\"$DRAFT\",\"mode\":\"$MODE\",\"brainstorm\":$BRAINSTORM,\"explain\":$EXPLAIN}}}" >&3

# Poll every 0.5s for the tool-call response (id:2), up to 180s max
# (worst case: 3 sequential Ollama calls, each with a 60s timeout).
for _ in $(seq 1 360); do
  if grep -q '"id":2' "$OUTPUT_FILE" 2>/dev/null; then
    break
  fi
  sleep 0.5
done

cat "$OUTPUT_FILE"
# cleanup() runs automatically via the EXIT trap
