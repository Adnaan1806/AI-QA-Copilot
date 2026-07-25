from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.auth.security import decode_access_token
from app.database.connection import get_db
from app.database.models import User


def get_current_user(
    authorization: str = Header(None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    user_id = decode_access_token(token)
    if user_id is None:
        raise HTTPException(401, "Invalid or expired token")

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(401, "User no longer exists")

    return user
