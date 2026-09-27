.PHONY: install dev test e2e lint build image format

ALLOTR_IMAGE ?= allotr:local

# Installs dependencies when the lockfile or any manifest changes.
node_modules/.modules.yaml: package.json pnpm-lock.yaml pnpm-workspace.yaml $(wildcard apps/*/package.json packages/*/package.json)
	pnpm install --frozen-lockfile
	@touch $@

install: node_modules/.modules.yaml

dev: install
	pnpm run dev

test: install
	pnpm run test

# Browser smoke tests; needs `pnpm --filter @allotr/web exec playwright install chromium` once.
e2e: install
	pnpm --filter @allotr/web e2e

lint: install
	pnpm run lint

# Production build of the workspaces, then the container image.
build: install
	pnpm run build
	$(MAKE) image

# Image for this machine's architecture; CI also builds arm64.
image:
	docker build -t $(ALLOTR_IMAGE) .

format: install
	pnpm run format
