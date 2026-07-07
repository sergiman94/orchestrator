"""Per-job environment variable management with encryption for secrets."""

import base64
import hashlib
import logging

from cryptography.fernet import Fernet

from backend.config import JWT_SECRET

logger = logging.getLogger("orchestrator")

# Derive a Fernet key from JWT_SECRET (Fernet requires a 32-byte url-safe base64 key)
_derived_key = base64.urlsafe_b64encode(
    hashlib.sha256(JWT_SECRET.encode("utf-8")).digest()
)
_fernet = Fernet(_derived_key)


def encrypt_value(plaintext: str) -> str:
    """Encrypt a string value and return the ciphertext as a string."""
    return _fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a ciphertext string back to plaintext."""
    try:
        return _fernet.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except Exception:
        logger.warning("Failed to decrypt env var value; returning empty string")
        return ""


MASKED_VALUE = "\u2022\u2022\u2022\u2022\u2022\u2022"
