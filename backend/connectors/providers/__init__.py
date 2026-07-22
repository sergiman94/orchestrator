"""Connector providers. Import this module to auto-register all built-in providers."""

from backend.connectors.providers.s3 import S3Connector
from backend.connectors.providers.postgresql import PostgreSQLConnector
from backend.connectors.providers.http_rest import HttpRestConnector
from backend.connectors.registry import register_connector

register_connector("s3", S3Connector)
register_connector("postgresql", PostgreSQLConnector)
register_connector("http_rest", HttpRestConnector)
