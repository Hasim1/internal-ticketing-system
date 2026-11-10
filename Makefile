# ===========================================================================
# Makefile — convenience targets for the Internal Ticketing & Support System.
#
# Docker targets (up/down/logs) run the full stack via docker-compose.
# Dev targets (backend-dev/frontend-dev) run each app locally without Docker.
#
# Usage: `make <target>` (run `make help` to list everything).
# ===========================================================================

# Use bash and fail fast on errors / undefined pipeline failures.
SHELL := /bin/bash

# Prefer the modern `docker compose` plugin; override if you use docker-compose v1:
#   make up COMPOSE="docker-compose"
COMPOSE ?= docker compose

BACKEND_DIR  := backend
FRONTEND_DIR := frontend

.DEFAULT_GOAL := help

# Every target below is a phony (task) target, not a file.
.PHONY: help up down logs ps build backend-dev frontend-dev install test seed clean

help: ## Show this help message.
	@echo "Internal Ticketing & Support — available make targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# --- Docker / full stack -------------------------------------------------- #

up: ## Build and start the full stack (db + backend + frontend) in the foreground.
	$(COMPOSE) up --build

down: ## Stop and remove the stack's containers and network.
	$(COMPOSE) down

logs: ## Tail logs from all running services.
	$(COMPOSE) logs -f

ps: ## Show the status of compose services.
	$(COMPOSE) ps

build: ## Build (or rebuild) all service images without starting them.
	$(COMPOSE) build

# --- Local development ----------------------------------------------------- #

backend-dev: ## Run the backend with autoreload (requires a local venv + deps installed).
	cd $(BACKEND_DIR) && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

frontend-dev: ## Run the Vite dev server with hot module reload on :5173.
	cd $(FRONTEND_DIR) && npm run dev

install: ## Install backend (pip) and frontend (npm) dependencies locally.
	cd $(BACKEND_DIR) && pip install -r requirements.txt
	cd $(FRONTEND_DIR) && npm install

# --- Quality / data -------------------------------------------------------- #

test: ## Run the backend test suite with pytest.
	cd $(BACKEND_DIR) && pytest

seed: ## Populate the database with demo departments, users, and tickets.
	cd $(BACKEND_DIR) && python -m app.seed

clean: ## Stop the stack and remove the Postgres data volume (DESTRUCTIVE).
	$(COMPOSE) down -v
