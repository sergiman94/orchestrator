"""S3 connector provider."""

import json
import logging

from backend.connectors.registry import ConnectorResult

logger = logging.getLogger("orchestrator")


class S3Connector:
    """BaseConnector implementation for AWS S3."""

    def execute(self, config: dict, params: dict) -> ConnectorResult:
        """Execute S3 operation (read, write, list).

        Config: bucket, region, _credentials (AWS access key/secret as JSON)
        Params: operation (read/write/list), key, data (for write), prefix (for list)
        """
        import boto3

        client = self._get_client(config)
        bucket = config.get("bucket", "")
        operation = params.get("operation", "list")

        if operation == "list":
            prefix = params.get("prefix", "")
            response = client.list_objects_v2(Bucket=bucket, Prefix=prefix, MaxKeys=1000)
            contents = response.get("Contents", [])
            keys = [{"key": obj["Key"], "size": obj["Size"], "last_modified": obj["LastModified"].isoformat()} for obj in contents]
            return ConnectorResult(data=keys, record_count=len(keys), metadata={"bucket": bucket, "prefix": prefix})

        elif operation == "read":
            key = params.get("key", "")
            response = client.get_object(Bucket=bucket, Key=key)
            body = response["Body"].read()
            try:
                data = json.loads(body)
            except (json.JSONDecodeError, UnicodeDecodeError):
                data = body.decode("utf-8", errors="replace")
            return ConnectorResult(
                data=data,
                record_count=1,
                metadata={"bucket": bucket, "key": key, "size": response["ContentLength"]},
            )

        elif operation == "write":
            key = params.get("key", "")
            data = params.get("data", "")
            body = json.dumps(data).encode("utf-8") if not isinstance(data, (str, bytes)) else data.encode("utf-8") if isinstance(data, str) else data
            client.put_object(Bucket=bucket, Key=key, Body=body)
            return ConnectorResult(data={"written": key}, record_count=1, metadata={"bucket": bucket, "key": key})

        else:
            raise ValueError(f"Unknown S3 operation: {operation}")

    def health_check(self, config: dict) -> str:
        """Verify bucket access."""
        import boto3

        try:
            client = self._get_client(config)
            client.head_bucket(Bucket=config.get("bucket", ""))
            return "healthy"
        except Exception as e:
            logger.warning("S3 health check failed: %s", e)
            return "unreachable"

    def get_metadata(self, config: dict) -> dict:
        """Return bucket metadata."""
        import boto3

        try:
            client = self._get_client(config)
            bucket = config.get("bucket", "")
            response = client.list_objects_v2(Bucket=bucket, MaxKeys=1)
            return {
                "bucket": bucket,
                "region": config.get("region", "us-east-1"),
                "key_count": response.get("KeyCount", 0),
            }
        except Exception as e:
            return {"bucket": config.get("bucket", ""), "error": str(e)}

    def _get_client(self, config: dict):
        import boto3

        kwargs = {"region_name": config.get("region", "us-east-1")}
        creds = config.get("_credentials", "")
        if creds:
            try:
                cred_data = json.loads(creds) if isinstance(creds, str) else creds
                kwargs["aws_access_key_id"] = cred_data.get("access_key_id", "")
                kwargs["aws_secret_access_key"] = cred_data.get("secret_access_key", "")
            except (json.JSONDecodeError, AttributeError):
                pass
        return boto3.client("s3", **kwargs)
