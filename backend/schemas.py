from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel


class TransactionBase(BaseModel):
    tx_type: str
    from_user: Optional[str] = None
    to_user: Optional[str] = None
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    condition_notes: Optional[str] = None
    performed_by: Optional[str] = None


class TransactionCreate(TransactionBase):
    asset_id: int


class Transaction(TransactionBase):
    id: int
    asset_id: int
    performed_on: datetime

    class Config:
        orm_mode = True


class AssetBase(BaseModel):
    asset_tag: str
    name: str
    serial_number: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = "available"
    location: Optional[str] = None
    current_holder: Optional[str] = None
    purchase_date: Optional[date] = None
    purchase_cost: Optional[float] = None
    warranty_end: Optional[date] = None
    notes: Optional[str] = None


class AssetCreate(AssetBase):
    pass


class Asset(AssetBase):
    id: int
    last_movement: datetime
    transactions: List[Transaction] = []

    class Config:
        orm_mode = True


class DashboardStats(BaseModel):
    total_assets: int
    available: int
    issued: int
    in_repair: int
    disposed: int
