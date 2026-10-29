#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=".env.production"
EXAMPLE_FILE=".env.production.example"

echo "=========================================================="
echo " BI Kit Production Environment Setup (.env.production)"
echo "=========================================================="

if [ -f "$ENV_FILE" ]; then
  echo "❌ Error: '$ENV_FILE' already exists." >&2
  echo "Refusing to overwrite an existing production configuration." >&2
  echo "If you want to re-initialize, manually backup or remove '$ENV_FILE' first." >&2
  exit 1
fi

if [ ! -f "$EXAMPLE_FILE" ]; then
  echo "❌ Error: '$EXAMPLE_FILE' template not found." >&2
  exit 1
fi

# Cryptographically secure random tokens
echo "🔐 Generating cryptographic secrets..."
POSTGRES_PASS="$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)"
CONNECTOR_KEY="$(openssl rand -base64 32)"
CRON_SEC="$(openssl rand -hex 24)"
DEFAULT_ADMIN_PASS="$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)Aa1!"

# Interactive prompts (reads from tty or fallback to defaults if non-interactive)
prompt() {
  local prompt_text="$1"
  local default_val="$2"
  local result=""

  if [ -t 0 ]; then
    read -r -p "$prompt_text [$default_val]: " result
  fi
  echo "${result:-$default_val}"
}

echo ""
echo "Please configure your self-hosted instance settings:"
echo "----------------------------------------------------"

ADMIN_EMAIL="$(prompt "Admin Email" "admin@example.com")"
ADMIN_NAME="$(prompt "Admin Name" "Admin")"
ADMIN_PASSWORD="$(prompt "Admin Password" "$DEFAULT_ADMIN_PASS")"
TIMEZONE="$(prompt "Timezone" "Asia/Kolkata")"
APP_PORT="$(prompt "Host Port (APP_PORT)" "3100")"
APP_URL="$(prompt "Application URL (APP_URL)" "http://localhost:${APP_PORT}")"

# Copy example template and replace variables
cat "$EXAMPLE_FILE" \
  | sed "s|POSTGRES_PASSWORD=replace-with-strong-database-password|POSTGRES_PASSWORD=${POSTGRES_PASS}|g" \
  | sed "s|CONNECTOR_SECRET_KEY=replace-with-32-byte-base64-secret-key|CONNECTOR_SECRET_KEY=${CONNECTOR_KEY}|g" \
  | sed "s|CRON_SECRET=replace-with-random-cron-secret|CRON_SECRET=${CRON_SEC}|g" \
  | sed "s|BOOTSTRAP_ADMIN_EMAIL=admin@example.com|BOOTSTRAP_ADMIN_EMAIL=${ADMIN_EMAIL}|g" \
  | sed "s|BOOTSTRAP_ADMIN_NAME=Admin|BOOTSTRAP_ADMIN_NAME=${ADMIN_NAME}|g" \
  | sed "s|BOOTSTRAP_ADMIN_PASSWORD=replace-with-admin-initial-password|BOOTSTRAP_ADMIN_PASSWORD=${ADMIN_PASSWORD}|g" \
  | sed "s|APP_PORT=3100|APP_PORT=${APP_PORT}|g" \
  | sed "s|APP_URL=http://localhost:3100|APP_URL=${APP_URL}|g" \
  | sed "s|APP_TIMEZONE=Asia/Kolkata|APP_TIMEZONE=${TIMEZONE}|g" \
  > "$ENV_FILE"

chmod 600 "$ENV_FILE"

echo ""
echo "✅ Successfully generated '${ENV_FILE}' with restricted permissions (chmod 600)."
echo ""
echo "Configuration Summary:"
echo "  - APP_URL:        ${APP_URL}"
echo "  - APP_PORT:       ${APP_PORT}"
echo "  - Timezone:       ${TIMEZONE}"
echo "  - Bootstrap Admin: ${ADMIN_EMAIL}"
echo "  - Registration:   Disabled (ALLOW_REGISTRATION=false)"
echo ""
echo "To start BI Kit with Docker Compose, run:"
echo "  make up"
echo "  # or: docker compose up -d"

