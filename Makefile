# Dev servers. Usage: `make run back` or `make run front`.
# Recipes avoid shell-specific syntax so they work under both sh and cmd.exe.
# The backend dev server uses the saveme_dev database of the compose stack
# (start it with `docker compose up -d db`) and turns on the local login.

.PHONY: run back front

TARGET := $(word 2,$(MAKECMDGOALS))

run:
ifeq ($(TARGET),back)
	cd backend && uv run python -m app.devserver
else ifeq ($(TARGET),front)
	cd frontend && npm run dev
else
	@echo Usage: make run back   or   make run front
	@exit 1
endif

# `back` and `front` are arguments to `run`, not standalone targets.
# `cd .` is a silent no-op in both shells.
back front:
	@cd .
