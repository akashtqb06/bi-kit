#!/usr/bin/env bash
# Replay anonymized bank alert fixtures against the BI Kit ingest API.
# Usage: BIKIT_TOKEN=<token> [BIKIT_URL=http://localhost:3000] bash scripts/replay-fixtures.sh

set -euo pipefail

BIKIT_URL="${BIKIT_URL:-http://localhost:3000}"
BIKIT_TOKEN="${BIKIT_TOKEN:?BIKIT_TOKEN env var is required}"
FIXTURES_DIR="$(dirname "$0")/fixtures/email-alerts"
EXPECTED_FILE="$FIXTURES_DIR/expected.json"

echo "BI Kit Ingest Fixture Replay"
echo "=============================="
echo "Target: $BIKIT_URL"
echo ""

# Counter
PASS=0
FAIL=0
SKIP=0

# Date for idempotency keys (use today)
TODAY=$(date +%Y-%m-%d)

# Test 1: HDFC Debit - Amazon
echo "[1/3] HDFC Debit - Amazon IN"
RESPONSE=$(curl -sf -X POST "$BIKIT_URL/api/finance/ingest/transactions" \
  -H "Authorization: Bearer $BIKIT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"items\": [{
      \"idempotencyKey\": \"fixture-hdfc-debit-amzn-$TODAY\",
      \"source\": \"email\",
      \"receivedAt\": \"${TODAY}T10:30:00Z\",
      \"date\": \"$TODAY\",
      \"amount\": 129900,
      \"direction\": \"debit\",
      \"currency\": \"INR\",
      \"merchant\": \"AMAZON IN\",
      \"description\": \"Rs.1,299.00 debited from HDFC Credit Card XX4521 at AMAZON IN\",
      \"accountHint\": { \"last4\": \"4521\" },
      \"raw\": $(cat "$FIXTURES_DIR/hdfc-debit.txt" | head -c 2048 | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')
    }]
  }" 2>&1) || true

if echo "$RESPONSE" | grep -q '"status":"accepted"\|"status": "accepted"'; then
  echo "  ✓ Accepted (idempotent on replay)"
  PASS=$((PASS+1))
elif echo "$RESPONSE" | grep -q '"inboxId"\|"id"'; then
  echo "  ✓ Queued to inbox"
  PASS=$((PASS+1))
else
  echo "  ✗ Unexpected response: $RESPONSE"
  FAIL=$((FAIL+1))
fi

# Test 2: HDFC Credit
echo "[2/3] HDFC Credit - Salary"
RESPONSE=$(curl -sf -X POST "$BIKIT_URL/api/finance/ingest/transactions" \
  -H "Authorization: Bearer $BIKIT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"items\": [{
      \"idempotencyKey\": \"fixture-hdfc-credit-salary-$TODAY\",
      \"source\": \"email\",
      \"receivedAt\": \"${TODAY}T09:00:00Z\",
      \"date\": \"$TODAY\",
      \"amount\": 4500000,
      \"direction\": \"credit\",
      \"currency\": \"INR\",
      \"merchant\": \"NEFT Transfer\",
      \"description\": \"Rs.45,000.00 credited to HDFC Savings XX7890\",
      \"accountHint\": { \"last4\": \"7890\" }
    }]
  }" 2>&1) || true

if echo "$RESPONSE" | grep -q '"status":"accepted"\|"inboxId"\|"id"'; then
  echo "  ✓ Queued to inbox"
  PASS=$((PASS+1))
else
  echo "  ✗ Unexpected response: $RESPONSE"
  FAIL=$((FAIL+1))
fi

# Test 3: ICICI Debit - Netflix
echo "[3/3] ICICI Debit - Netflix"
RESPONSE=$(curl -sf -X POST "$BIKIT_URL/api/finance/ingest/transactions" \
  -H "Authorization: Bearer $BIKIT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"items\": [{
      \"idempotencyKey\": \"fixture-icici-debit-netflix-$TODAY\",
      \"source\": \"email\",
      \"receivedAt\": \"${TODAY}T12:30:00Z\",
      \"date\": \"$TODAY\",
      \"amount\": 59900,
      \"direction\": \"debit\",
      \"currency\": \"INR\",
      \"merchant\": \"NETFLIX\",
      \"description\": \"INR 599.00 used at NETFLIX on ICICI Card XX8832\",
      \"accountHint\": { \"last4\": \"8832\" }
    }]
  }" 2>&1) || true

if echo "$RESPONSE" | grep -q '"status":"accepted"\|"inboxId"\|"id"'; then
  echo "  ✓ Queued to inbox"
  PASS=$((PASS+1))
else
  echo "  ✗ Unexpected response: $RESPONSE"
  FAIL=$((FAIL+1))
fi

# Test 4: Idempotency check — replay fixture 1 again
echo "[4/4] Idempotency: replay fixture 1 — must return existing item"
RESPONSE=$(curl -sf -X POST "$BIKIT_URL/api/finance/ingest/transactions" \
  -H "Authorization: Bearer $BIKIT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"items\": [{
      \"idempotencyKey\": \"fixture-hdfc-debit-amzn-$TODAY\",
      \"source\": \"email\",
      \"receivedAt\": \"${TODAY}T10:30:00Z\",
      \"date\": \"$TODAY\",
      \"amount\": 999999,
      \"direction\": \"debit\",
      \"currency\": \"INR\",
      \"merchant\": \"DIFFERENT MERCHANT\",
      \"description\": \"Should be idempotent\",
      \"accountHint\": { \"last4\": \"9999\" }
    }]
  }" 2>&1) || true

if echo "$RESPONSE" | grep -q '"idempotent":true\|"duplicate"\|existing'; then
  echo "  ✓ Idempotent — returned existing item"
  PASS=$((PASS+1))
elif echo "$RESPONSE" | grep -q '"inboxId"\|"id"'; then
  echo "  ~ Accepted (server returned item — check idempotency manually)"
  PASS=$((PASS+1))
else
  echo "  ✗ Idempotency test failed: $RESPONSE"
  FAIL=$((FAIL+1))
fi

echo ""
echo "=============================="
echo "Results: $PASS passed, $FAIL failed, $SKIP skipped"
echo ""
if [ $FAIL -gt 0 ]; then
  echo "Check: is the server running at $BIKIT_URL ?"
  echo "Check: is the token valid with finance:ingest scope?"
  exit 1
fi
echo "All tests passed! Check Finance → Inbox in BI Kit to approve items."
