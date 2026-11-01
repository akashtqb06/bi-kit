# Automation & External Integration Guide

## Overview

BI Kit exposes a token-authenticated ingest API so external tools (n8n, scripts, IFTTT) can push transaction alerts into the **Inbox** for human review. Nothing is committed to your ledger without your approval.

## 1. Creating an API Token

### Via Settings UI
1. Go to **Settings → API Tokens**
2. Click **Create Token**
3. Give it a name (e.g., "n8n Gmail Ingest")
4. Select scopes: `finance:ingest` (required), `finance:read` (optional)
5. Set an expiry date (recommended: 1 year)
6. **Copy the token immediately** — it is shown only once

### Via API
```bash
curl -X POST https://your-instance/api/settings/api-tokens \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie>" \
  -d '{"name":"n8n Gmail Ingest","scopes":["finance:ingest"],"expiresAt":"2027-12-31T00:00:00Z"}'
```

Response (token shown once):
```json
{
  "token": "a1b2c3d4e5f6...",
  "record": { "id": "...", "prefix": "a1b2c3d4", "scopes": ["finance:ingest"] }
}
```

## 2. Ingest Endpoint

### Endpoint
```
POST /api/finance/ingest/transactions
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: <unique-key>  (optional header, can also be in body)
```

### Payload Schema
```json
{
  "items": [
    {
      "idempotencyKey": "gmail-msg-12345-debit-999",
      "source": "email",
      "receivedAt": "2026-11-01T10:30:00Z",
      "date": "2026-11-01",
      "amount": 99900,
      "direction": "debit",
      "currency": "INR",
      "merchant": "Swiggy",
      "description": "Txn of Rs.999.00 on HDFC Card XX1234 at Swiggy on 01-Nov-26",
      "accountHint": { "last4": "1234" },
      "reference": "HDFC-TXN-123456",
      "raw": "Full alert email text (truncated to 2KB)"
    }
  ]
}
```

**Field details:**
- `idempotencyKey`: Unique string per transaction; re-sending the same key returns the existing inbox item (idempotent)
- `source`: `email` | `sms` | `api` | `n8n`
- `amount`: Integer in **paise** (1 INR = 100 paise); e.g., Rs.999 = 99900
- `direction`: `debit` (expense) or `credit` (income)
- `accountHint.last4`: Last 4 digits of card/account number for matching
- `accountHint.name`: Account name for matching (e.g., "HDFC Savings")
- `raw`: Optional full alert text, truncated server-side to 2048 characters

**Limits:** Max 50 items per request.

### Example cURL
```bash
curl -X POST https://your-instance/api/finance/ingest/transactions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{
      "idempotencyKey": "sms-hdfc-20261101-999",
      "source": "sms",
      "receivedAt": "2026-11-01T10:30:00Z",
      "date": "2026-11-01",
      "amount": 99900,
      "direction": "debit",
      "currency": "INR",
      "merchant": "Swiggy",
      "description": "Rs 999 debited from HDFC XX1234",
      "accountHint": { "last4": "1234" }
    }]
  }'
```

### Response
```json
{
  "results": [
    {
      "idempotencyKey": "sms-hdfc-20261101-999",
      "status": "accepted",
      "inboxId": "item_abc123",
      "duplicate": false
    }
  ]
}
```

## 3. n8n Setup

### Starting n8n
```bash
# Start BI Kit with n8n
docker compose --profile automation up -d
```

n8n will be available at http://localhost:5678 (localhost only).

### Required Environment Variables
```bash
# .env or .env.production
N8N_ENCRYPTION_KEY=<generate with: openssl rand -hex 32>
```

### Example n8n Workflow: Gmail Bank Alerts → BI Kit Inbox

Below is a complete workflow JSON you can import into n8n (Workflows → Import from JSON):

```json
{
  "name": "Bank Alert Gmail → BI Kit Inbox",
  "nodes": [
    {
      "name": "Gmail Trigger",
      "type": "n8n-nodes-base.gmailTrigger",
      "position": [240, 300],
      "parameters": {
        "pollTimes": { "item": [{ "mode": "everyMinute" }] },
        "filters": {
          "sender": "alerts@hdfcbank.com,noreply@icicibank.com",
          "readStatus": "unread",
          "labels": ["bank-alerts"]
        }
      }
    },
    {
      "name": "Parse Alert",
      "type": "n8n-nodes-base.code",
      "position": [480, 300],
      "parameters": {
        "mode": "runOnceForEachItem",
        "jsCode": "// Bank alert parser — add your own regex patterns\nconst body = $input.item.json.snippet || $input.item.json.textPlain || '';\nconst subject = $input.item.json.subject || '';\nconst msgId = $input.item.json.id;\nconst receivedAt = new Date($input.item.json.internalDate * 1).toISOString();\n\n// HDFC Debit Alert: 'Rs.999.00 debited from A/C XX1234 at Swiggy'\nconst hdfcDebit = body.match(/Rs\\.(\\d+\\.\\d{2}) debited from A\\/C XX(\\d{4}) at ([\\w\\s]+)/i);\n\n// ICICI Credit Alert: 'INR 5000.00 credited to XX5678'\nconst iciciCredit = body.match(/INR (\\d+\\.\\d{2}) credited to XX(\\d{4})/i);\n\nif (hdfcDebit) {\n  const amountRs = parseFloat(hdfcDebit[1]);\n  return {\n    json: {\n      idempotencyKey: `gmail-${msgId}-debit`,\n      source: 'n8n',\n      receivedAt,\n      date: new Date().toISOString().split('T')[0],\n      amount: Math.round(amountRs * 100),  // convert to paise\n      direction: 'debit',\n      currency: 'INR',\n      merchant: hdfcDebit[3].trim(),\n      description: body.substring(0, 200),\n      accountHint: { last4: hdfcDebit[2] },\n      raw: body.substring(0, 2048),\n    }\n  };\n}\n\nif (iciciCredit) {\n  const amountRs = parseFloat(iciciCredit[1]);\n  return {\n    json: {\n      idempotencyKey: `gmail-${msgId}-credit`,\n      source: 'n8n',\n      receivedAt,\n      date: new Date().toISOString().split('T')[0],\n      amount: Math.round(amountRs * 100),\n      direction: 'credit',\n      currency: 'INR',\n      merchant: 'Unknown',\n      description: body.substring(0, 200),\n      accountHint: { last4: iciciCredit[2] },\n      raw: body.substring(0, 2048),\n    }\n  };\n}\n\n// No match — skip\nreturn null;"
      }
    },
    {
      "name": "Filter Valid",
      "type": "n8n-nodes-base.filter",
      "position": [720, 300],
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true },
          "conditions": [{ "id": "1", "leftValue": "={{ $json.idempotencyKey }}", "rightValue": "", "operator": { "type": "string", "operation": "notEmpty" } }]
        }
      }
    },
    {
      "name": "Send to BI Kit",
      "type": "n8n-nodes-base.httpRequest",
      "position": [960, 300],
      "parameters": {
        "method": "POST",
        "url": "http://app:3000/api/finance/ingest/transactions",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "contentType": "json",
        "body": "={{ JSON.stringify({ items: [$json] }) }}",
        "options": { "timeout": 10000 }
      },
      "credentials": { "httpHeaderAuth": { "id": "1", "name": "BI Kit API Token" } }
    },
    {
      "name": "Error Notify",
      "type": "n8n-nodes-base.emailSend",
      "position": [960, 500],
      "parameters": {
        "toEmail": "you@example.com",
        "subject": "BI Kit ingest failed",
        "text": "={{ $json.error || 'Unknown error' }}"
      }
    }
  ],
  "connections": {
    "Gmail Trigger": { "main": [[{ "node": "Parse Alert", "type": "main", "index": 0 }]] },
    "Parse Alert": { "main": [[{ "node": "Filter Valid", "type": "main", "index": 0 }]] },
    "Filter Valid": { "main": [[{ "node": "Send to BI Kit", "type": "main", "index": 0 }]] },
    "Send to BI Kit": { "error": [[{ "node": "Error Notify", "type": "main", "index": 0 }]] }
  }
}
```

### Setting Up Credentials in n8n
1. Go to **Credentials → New**
2. Select **Header Auth**
3. Name: "BI Kit API Token"
4. Header Name: `Authorization`
5. Header Value: `Bearer YOUR_TOKEN_HERE`
6. Save

## 4. Security Guidance

### Gmail Integration
- Request **read-only** Gmail OAuth scope (`https://www.googleapis.com/auth/gmail.readonly`)
- Add sender allow-list in the Gmail Trigger node (only process alerts from known bank senders)
- Apply a Gmail label filter (`bank-alerts`) so only pre-filtered emails are processed
- Never grant the Gmail trigger full account access

### Token Management
- Store API tokens **only in n8n credentials** — never in workflow JSON or environment files
- Rotate tokens every 3–6 months via Settings → API Tokens → Revoke + Create New
- Use separate tokens for each integration (one per n8n workflow)
- Tokens have `finance:ingest` scope only — they cannot access settings, users, or other data

### n8n Security
- n8n runs on `127.0.0.1:5678` (localhost only — not exposed externally)
- Use a strong `N8N_ENCRYPTION_KEY` (32+ random bytes)
- Regularly update the n8n image version in docker-compose.yml

### Data Minimization
- The `raw` field is limited to 2048 characters server-side
- Do not include PII beyond what's needed for matching (last 4 digits, amount, date)
- Inbox items that are rejected are retained for 30 days then can be purged

## 5. Testing the Integration

### Replay Test Fixtures
```bash
# Set your token
export BIKIT_TOKEN=your_token_here
export BIKIT_URL=http://localhost:3000

# Replay anonymized sample alerts
bash scripts/replay-fixtures.sh
```

### Manual Test
```bash
curl -X POST http://localhost:3000/api/finance/ingest/transactions \
  -H "Authorization: Bearer $BIKIT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{
      "idempotencyKey": "test-001",
      "source": "api",
      "receivedAt": "2026-11-01T10:00:00Z",
      "date": "2026-11-01",
      "amount": 50000,
      "direction": "debit",
      "currency": "INR",
      "merchant": "Test Merchant",
      "description": "Test transaction",
      "accountHint": { "name": "HDFC Savings" }
    }]
  }'
```

Then visit **Finance → Inbox** to see and approve the item.

## 6. Inbox Review Workflow

1. Ingest items arrive in **Finance → Inbox** (badge shows pending count)
2. Review: account matched? Category suggested correctly?
3. Edit inline: account, category, payee, amount
4. **Duplicate warnings** appear for items that look like existing transactions
5. Approve individually or bulk-select → **Approve All Clean Items**
6. On approval: transaction is created in your ledger; balance updates immediately
7. **Rule Learning**: if you change a category during approval, a toast asks "Always use this category for [Merchant]?" — confirming creates a payee rule for future auto-suggestions

## 7. Webhook Events (Outbound)

BI Kit can call your external URL when events occur.

### Setup
Go to **Settings → Webhooks** → Add endpoint URL and select events.

### Event Types
| Event | Payload |
|-------|---------|
| `transaction.created` | `{ transaction: {...} }` |
| `budget.threshold` | `{ budget: {...}, percentUsed: number }` |
| `card.due_soon` | `{ account: {...}, daysUntilDue: number }` |
| `valuation.updated` | `{ account: {...}, valuation: {...} }` |
| `inbox.pending` | `{ count: number }` |

### Signature Verification
Each webhook call includes an `X-Bikit-Signature` header:
```
X-Bikit-Signature: sha256=<hmac-hex>
```

Verify in your receiver:
```javascript
const crypto = require('crypto');
function verifySignature(body, secret, signature) {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```
