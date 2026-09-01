from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Date,
    DateTime,
    ForeignKey,
    Text,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    asset_tag = Column(String, unique=True, index=True, nullable=False)
    serial_number = Column(String, index=True, nullable=True)
    name = Column(String, index=True, nullable=False)
    category = Column(String, index=True, nullable=True)
    status = Column(String, index=True, default="available")
    location = Column(String, index=True, nullable=True)
    current_holder = Column(String, nullable=True)
    purchase_date = Column(Date, nullable=True)
    purchase_cost = Column(Float, nullable=True)
    warranty_end = Column(Date, nullable=True)
    last_movement = Column(DateTime, default=datetime.utcnow)
    notes = Column(Text, nullable=True)

    transactions = relationship("Transaction", back_populates="asset")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"))
    tx_type = Column(String, index=True)  # ISSUE, RECEIVE, VERIFY, TRANSFER
    from_user = Column(String, nullable=True)
    to_user = Column(String, nullable=True)
    from_location = Column(String, nullable=True)
    to_location = Column(String, nullable=True)
    condition_notes = Column(Text, nullable=True)
    performed_by = Column(String, nullable=True)
    performed_on = Column(DateTime, default=datetime.utcnow)

    asset = relationship("Asset", back_populates="transactions")
