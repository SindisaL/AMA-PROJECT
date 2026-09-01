import os
import base64
import hashlib
import hmac

from database import SessionLocal, init_db
from models import User


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        150_000,
    )
    return base64.b64encode(salt).decode() + "$" + base64.b64encode(dk).decode()


def main():
    init_db()  # make sure tables exist
    db = SessionLocal()

    existing = db.query(User).filter(User.username == "assetdeskadmin").first()
    if existing:
        print("Admin already exists with id:", existing.id)
        return

    admin = User(
        username="assetdeskadmin",
        full_name="Asset Desk Admin",
        email="assetdeskadmin@rsr.org.za",
        role="AssetDeskAdmin",
        is_active=True,
        hashed_password=hash_password("ChangeMe123!"),
    )

    db.add(admin)
    db.commit()
    db.refresh(admin)

    print("✅ Admin created")
    print("Username: assetdeskadmin")
    print("Password: ChangeMe123!")


if __name__ == "__main__":
    main()
