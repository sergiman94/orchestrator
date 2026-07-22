"""Shared Fernet encryption utility for all credential fields.

Single canonical location for encrypt/decrypt (AD-8).
Derives key from JWT_SECRET using SHA-256 (same approach as env_vars.py).
"""

import base64
import hashlib
import logging

from cryptography.fernet import Fernet

from backend.config import JWT_SECRET

logger = logging.getLogger("orchestrator")

_fernet_instance = None


def _get_fernet() -> Fernet:
    global _fernet_instance
    if _fernet_instance is None:
        if not JWT_SECRET or JWT_SECRET == "change-me-to-a-random-string":
            logger.warning(
                "JWT_SECRET is not set or using default value. "
                "Encrypted data will not be secure. Set a strong JWT_SECRET in .env"
            )
        derived_key = base64.urlsafe_b64encode(
            hashlib.sha256(JWT_SECRET.encode("utf-8")).digest()
        )
        _fernet_instance = Fernet(derived_key)
    return _fernet_instance


def encrypt(plaintext: str) -> str:
    """Encrypt a plaintext string. Returns ciphertext as a string."""
    return _get_fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(ciphertext: str) -> str:
    """Decrypt a ciphertext string back to plaintext.
    Returns empty string on failure (never raises).
    """
    try:
        return _get_fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except Exception:
        logger.warning("Failed to decrypt value; returning empty string")
        return ""
