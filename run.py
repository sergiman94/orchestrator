#!/usr/bin/env python3
"""Start the Orchestrator server."""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8005,
        reload=True,
    )
