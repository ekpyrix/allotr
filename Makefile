.PHONY: install dev test lint build format

# Installs dependencies when the lockfile or any manifest changes.
node_modules/.modules.yaml: package.json pnpm-lock.yaml pnpm-workspace.yaml $(wildcard apps/*/package.json packages/*/package.json)
	pnpm install --frozen-lockfile
	@touch $@

install: node_modules/.modules.yaml

dev: install
	pnpm run dev

test: install
	pnpm run test

lint: install
	pnpm run lint

build: install
	pnpm run build

format: install
	pnpm run format
