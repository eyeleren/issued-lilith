IMAGE    ?= issued-lilith:latest
PLATFORM ?= linux/arm/v7
BUILDER  ?= lilith-builder
TAR      ?= issued-lilith-armv7.tar
REGISTRY_IMAGE ?=

.DEFAULT_GOAL := help
.PHONY: help env install dev start lint test check release buildx-setup build build-arm push-arm save-arm up down logs restart ps

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-13s\033[0m %s\n", $$1, $$2}'

env: ## Create .env from .env.example (never overwrites)
	@cp -n .env.example .env 2>/dev/null && echo "Created .env, now edit it" || echo ".env already exists"

install: ## Install dependencies from the lockfile
	npm ci

dev: env ## Run locally with auto-reload
	npm run dev

start: env ## Run locally
	npm start

lint: ## Run ESLint
	npm run lint

test: ## Run unit tests
	npm test

check: lint test ## Lint + tests

release: ## Bump version, commit and tag: make release VERSION=patch|minor|major|x.y.z
	@test -n "$(VERSION)" || (echo "Usage: make release VERSION=patch|minor|major|x.y.z" && exit 1)
	@test -z "$$(git status --porcelain)" || (echo "Working tree not clean, commit first" && exit 1)
	npm run lint && npm test
	npm version $(VERSION) -m "chore: release v%s"
	@echo "Now publish it with: git push --follow-tags"

buildx-setup: ## Create a buildx builder able to cross-build (once)
	docker buildx inspect $(BUILDER) >/dev/null 2>&1 || docker buildx create --name $(BUILDER) --driver docker-container
	docker buildx inspect $(BUILDER) --bootstrap >/dev/null

build: ## Build image for the local machine
	docker build -t $(IMAGE) .

build-arm: buildx-setup ## Cross-build for ARMv7 and load it into the local Docker
	docker buildx build --builder $(BUILDER) --platform $(PLATFORM) --provenance=false -t $(IMAGE) --load .

push-arm: buildx-setup ## Cross-build for ARMv7 and push to REGISTRY_IMAGE
	@test -n "$(REGISTRY_IMAGE)" || (echo "Set REGISTRY_IMAGE, e.g. make push-arm REGISTRY_IMAGE=ghcr.io/eyeleren/issued-lilith:latest" && exit 1)
	docker buildx build --builder $(BUILDER) --platform $(PLATFORM) --provenance=false -t $(REGISTRY_IMAGE) --push .

save-arm: buildx-setup ## Cross-build for ARMv7 into a .tar for Container Station
	docker buildx build --builder $(BUILDER) --platform $(PLATFORM) --provenance=false -t $(IMAGE) --output type=docker,dest=$(TAR) .
	@ls -lh $(TAR)

up: env ## docker compose up -d
	docker compose up -d

down: ## docker compose down
	docker compose down

logs: ## Follow container logs
	docker compose logs -f --tail=100

restart: ## Restart the container
	docker compose restart

ps: ## Container status (incl. health)
	docker compose ps
