from sqlalchemy import (
    Column,
    Integer,
    String,
    Date,
    DateTime,
    Float,
    Text,
    ForeignKey,
    Boolean,
)

from sqlalchemy.sql import func
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    asset_tag = Column(String, nullable=False, index=True)
    category = Column(String, nullable=False)
    brand = Column(String)
    model = Column(String)
    serial_number = Column(String, index=True)
    hostname = Column(String)

    status = Column(String, nullable=False, default="In Use")
    assigned_to = Column(String)
    department = Column(String)
    location = Column(String)

    purchase_date = Column(Date)
    warranty_expiry = Column(Date)
    cost = Column(Float)
    useful_life_years = Column(Integer)

    life_remaining_percent = Column(Integer)
    last_movement_date = Column(Date)
    last_movement_type = Column(String)

    notes = Column(String)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    # 🔹 Relationship to history events
    events = relationship(
        "AssetEvent",
        back_populates="asset",
        cascade="all, delete-orphan",
    )


class AssetEvent(Base):
    __tablename__ = "asset_events"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(
        Integer,
        ForeignKey("assets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # e.g. ISSUED, RECEIVED, DISPOSAL_MARK, LOST, STATUS_CHANGE
    event_type = Column(String, nullable=False, index=True)
    actor = Column(String)  # who performed the action (optional for now)

    timestamp = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    from_status = Column(String)
    to_status = Column(String)
    details = Column(Text)  # free text notes / description

    # back reference to Asset
    asset = relationship("Asset", back_populates="events")

    # ==========================
# User model (for AAA / login)
# ==========================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    username = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=True)
    email = Column(String, unique=True, index=True, nullable=True)

    # salted+hashed password (PBKDF2)
    hashed_password = Column(String, nullable=False)

    role = Column(String, default="AssetDeskAdmin")  # AssetDeskAdmin, ICT, Finance, Viewer
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

