"""HTTP/REST API connector provider."""

import json
import logging

from backend.connectors.registry import ConnectorResult

logger = logging.getLogger("orchestrator")


class HttpRestConnector:
    """BaseConnector implementation for HTTP/REST APIs."""

    def execute(self, config: dict, params: dict) -> ConnectorResult:
        """Perform an HTTP request.

        Config: base_url, headers (dict), _credentials (auth token or JSON with auth details)
        Params: method (GET/POST/PUT/DELETE), path, body (dict), query_params (dict)
        """
        import httpx

        url = self._build_url(config, params)
        headers = self._build_headers(config)
        method = params.get("method", "GET").upper()
        body = params.get("body", None)
        query_params = params.get("query_params", None)
        timeout = config.get("timeout", 30)

        with httpx.Client(timeout=timeout) as client:
            response = client.request(
                method=method,
                url=url,
                headers=headers,
                json=body if body and method in ("POST", "PUT", "PATCH") else None,
                params=query_params,
            )
            response.raise_for_status()

            try:
                data = response.json()
            except (json.JSONDecodeError, ValueError):
                data = response.text

            record_count = len(data) if isinstance(data, list) else 1

            return ConnectorResult(
                data=data,
                record_count=record_count,
                metadata={
                    "url": url,
                    "method": method,
                    "status_code": response.status_code,
                    "content_type": response.headers.get("content-type", ""),
                },
            )

    def health_check(self, config: dict) -> str:
        """Perform a HEAD request to verify endpoint availability."""
        import httpx

        try:
            url = config.get("base_url", "").rstrip("/")
            headers = self._build_headers(config)
            with httpx.Client(timeout=10) as client:
                response = client.head(url, headers=headers)
                if response.status_code < 500:
                    return "healthy"
                return "degraded"
        except Exception as e:
            logger.warning("HTTP health check failed: %s", e)
            return "unreachable"

    def get_metadata(self, config: dict) -> dict:
        """Return endpoint URL and basic info."""
        return {
            "base_url": config.get("base_url", ""),
            "has_auth": bool(config.get("_credentials", "")),
        }

    def _build_url(self, config: dict, params: dict) -> str:
        base = config.get("base_url", "").rstrip("/")
        path = params.get("path", "").lstrip("/")
        return f"{base}/{path}" if path else base

    def _build_headers(self, config: dict) -> dict:
        headers = dict(config.get("headers", {}))
        creds = config.get("_credentials", "")
        if creds:
            try:
                cred_data = json.loads(creds) if isinstance(creds, str) else creds
                if isinstance(cred_data, dict):
                    if "token" in cred_data:
                        headers["Authorization"] = f"Bearer {cred_data['token']}"
                    elif "api_key" in cred_data:
                        headers["X-API-Key"] = cred_data["api_key"]
                else:
                    headers["Authorization"] = f"Bearer {creds}"
            except (json.JSONDecodeError, AttributeError):
                headers["Authorization"] = f"Bearer {creds}"
        return headers
