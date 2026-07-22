"""PostgreSQL connector provider."""

import json
import logging

from backend.connectors.registry import ConnectorResult

logger = logging.getLogger("orchestrator")


class PostgreSQLConnector:
    """BaseConnector implementation for PostgreSQL."""

    def execute(self, config: dict, params: dict) -> ConnectorResult:
        """Execute a SQL query.

        Config: connection_string (or host/port/dbname/user), _credentials (password)
        Params: query, output_format (json/csv — default json)
        """
        import psycopg2
        import psycopg2.extras

        conn = self._get_connection(config)
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                query = params.get("query", "")
                cur.execute(query)

                if cur.description:
                    rows = cur.fetchall()
                    data = [dict(row) for row in rows]
                    columns = [desc[0] for desc in cur.description]
                    return ConnectorResult(
                        data=data,
                        record_count=len(data),
                        metadata={"columns": columns, "query": query[:200]},
                    )
                else:
                    conn.commit()
                    return ConnectorResult(
                        data={"affected_rows": cur.rowcount},
                        record_count=cur.rowcount,
                        metadata={"query": query[:200]},
                    )
        finally:
            conn.close()

    def health_check(self, config: dict) -> str:
        """Run SELECT 1 to verify connectivity."""
        import psycopg2

        try:
            conn = self._get_connection(config)
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
            conn.close()
            return "healthy"
        except Exception as e:
            logger.warning("PostgreSQL health check failed: %s", e)
            return "unreachable"

    def get_metadata(self, config: dict) -> dict:
        """Return table schemas and row counts."""
        import psycopg2
        import psycopg2.extras

        try:
            conn = self._get_connection(config)
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("""
                    SELECT table_name,
                           pg_total_relation_size(quote_ident(table_name)) as size_bytes
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    ORDER BY table_name
                """)
                tables = [dict(row) for row in cur.fetchall()]
            conn.close()
            return {"tables": tables, "table_count": len(tables)}
        except Exception as e:
            return {"error": str(e)}

    def _get_connection(self, config: dict):
        import psycopg2

        conn_string = config.get("connection_string", "")
        creds = config.get("_credentials", "")

        if conn_string:
            if creds and "password" not in conn_string:
                conn_string += f" password={creds}"
            return psycopg2.connect(conn_string)

        return psycopg2.connect(
            host=config.get("host", "localhost"),
            port=config.get("port", 5432),
            dbname=config.get("dbname", ""),
            user=config.get("user", ""),
            password=creds or config.get("password", ""),
        )
