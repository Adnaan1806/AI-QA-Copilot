"""Encryption for what a project needs to log in to its app: passwords and
saved browser sessions (whose cookies are as sensitive as the password).
Neither is ever returned by the API or given to an LLM."""

from cryptography.fernet import Fernet, InvalidToken

from app import config


class CredentialsKeyMissing(Exception):
    pass


def _fernet() -> Fernet:
    if not config.CREDENTIALS_KEY:
        raise CredentialsKeyMissing(
            "Set CREDENTIALS_KEY in the backend .env before saving accounts. Generate one with: "
            'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )
    return Fernet(config.CREDENTIALS_KEY.encode())


def ready() -> bool:
    try:
        _fernet()
        return True
    except (CredentialsKeyMissing, ValueError):
        return False


def encrypt(plain: str) -> str:
    return _fernet().encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken:
        raise CredentialsKeyMissing(
            "A stored password can't be read with the current CREDENTIALS_KEY. Enter the password again."
        ) from None
