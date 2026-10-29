.PHONY: backup restore

BACKUP_FILE ?= backup.sql

backup:
	@echo "Backing up database (excluding store_* schemas)..."
	@if docker ps --format '{{.Names}}' | grep -q "bikit-postgres"; then \
		docker compose exec -T postgres pg_dump -U postgres -d bikit_prod -N 'store_*' > $(BACKUP_FILE); \
	elif docker ps --format '{{.Names}}' | grep -q "bi-kit-postgres"; then \
		docker compose -f docker-compose.dev.yml exec -T postgres pg_dump -U postgres -d bikit_dev -N 'store_*' > $(BACKUP_FILE); \
	else \
		pg_dump "$${DATABASE_URL:-postgres://postgres:bi_password_123!@localhost:5432/bikit_dev}" -N 'store_*' > $(BACKUP_FILE); \
	fi
	@echo "Backup successfully saved to $(BACKUP_FILE) (store_* schemas excluded)"

restore:
	@echo "Restoring database from $(BACKUP_FILE)..."
	@if docker ps --format '{{.Names}}' | grep -q "bikit-postgres"; then \
		docker compose exec -T postgres psql -U postgres -d bikit_prod < $(BACKUP_FILE); \
	elif docker ps --format '{{.Names}}' | grep -q "bi-kit-postgres"; then \
		docker compose -f docker-compose.dev.yml exec -T postgres psql -U postgres -d bikit_dev < $(BACKUP_FILE); \
	else \
		psql "$${DATABASE_URL:-postgres://postgres:bi_password_123!@localhost:5432/bikit_dev}" < $(BACKUP_FILE); \
	fi
	@echo "Restore complete."

