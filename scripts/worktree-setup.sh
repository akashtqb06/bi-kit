#!/usr/bin/env bash
set -euo pipefail

# Worktree environment setup script for parallel development sessions
# Usage: ./scripts/worktree-setup.sh <session_name> <port>
# Example: ./scripts/worktree-setup.sh s2 3002

NAME="${1:-}"
PORT="${2:-}"

if [ -z "$NAME" ] || [ -z "$PORT" ]; then
    echo "Usage: $0 <name> <port>"
    echo "Example: $0 s2 3002"
    exit 1
fi

CLEAN_NAME=$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]_')
DB_NAME="bikit_${CLEAN_NAME}"

echo "==> Configuring worktree environment for session '${NAME}'..."

if [ ! -f .env.example ]; then
    echo "Error: .env.example not found in current directory."
    exit 1
fi

# 1. Copy .env.example to .env.local if not already present
if [ ! -f .env.local ]; then
    cp .env.example .env.local
    echo "Created .env.local from .env.example"
fi

# 2. Update DATABASE_URL and PORT in .env.local
DATABASE_URL="postgres://postgres:bi_password_123!@localhost:5432/${DB_NAME}"

# Replace or append DATABASE_URL
if grep -q "^DATABASE_URL=" .env.local; then
    # sed in-place compatible with macOS and Linux
    sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL}|" .env.local && rm -f .env.local.bak
else
    echo "DATABASE_URL=${DATABASE_URL}" >> .env.local
fi

# Replace or append PORT
if grep -q "^PORT=" .env.local; then
    sed -i.bak "s|^PORT=.*|PORT=${PORT}|" .env.local && rm -f .env.local.bak
else
    echo "PORT=${PORT}" >> .env.local
fi

echo "Updated .env.local: DATABASE_URL=${DATABASE_URL}, PORT=${PORT}"

# 3. Create the database in local Postgres
echo "==> Creating local Postgres database '${DB_NAME}'..."
pnpm db:create-local "${CLEAN_NAME}" || true

# 4. Run database migrations
echo "==> Running migrations..."
pnpm db:migrate

echo "==> Worktree setup complete for '${NAME}'. Start dev server with: pnpm dev -p ${PORT}"

