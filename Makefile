.PHONY: api api-bg api-stop api-restart

API_PID_FILE := .api.pid
API_LOG_FILE := .api.log

api:
	npm run dev:api

api-bg:
	@if [ -f "$(API_PID_FILE)" ] && kill -0 "$$(cat $(API_PID_FILE))" 2>/dev/null; then \
		echo "API is already running with PID $$(cat $(API_PID_FILE))"; \
	else \
		echo "Starting API in background..."; \
		nohup npm run dev:api > "$(API_LOG_FILE)" 2>&1 & echo $$! > "$(API_PID_FILE)"; \
		echo "API started with PID $$(cat $(API_PID_FILE))"; \
	fi

api-stop:
	@if [ -f "$(API_PID_FILE)" ] && kill -0 "$$(cat $(API_PID_FILE))" 2>/dev/null; then \
		echo "Stopping API PID $$(cat $(API_PID_FILE))"; \
		kill "$$(cat $(API_PID_FILE))"; \
		rm -f "$(API_PID_FILE)"; \
	else \
		echo "API is not running"; \
		rm -f "$(API_PID_FILE)"; \
	fi

api-restart: api-stop api-bg
