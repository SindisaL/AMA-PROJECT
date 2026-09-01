from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, EmailStr

# ==========================
# Asset Schemas
# ==========================

class AssetBase(BaseModel):
    asset_tag: str
    category: str
    brand: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    hostname: Optional[str] = None

    status: Optional[str] = "In Use"
    assigned_to: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None

    purchase_date: Optional[date] = None
    warranty_expiry: Optional[date] = None
    cost: Optional[float] = None
    useful_life_years: Optional[int] = None

    notes: Optional[str] = None


class AssetCreate(AssetBase):
    # For now same as base; later we can restrict fields if needed
    pass


class AssetUpdate(BaseModel):
    # All fields optional so we can do partial updates
    asset_tag: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    hostname: Optional[str] = None

    status: Optional[str] = None
    assigned_to: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None

    purchase_date: Optional[date] = None
    warranty_expiry: Optional[date] = None
    cost: Optional[float] = None
    useful_life_years: Optional[int] = None

    notes: Optional[str] = None


class AssetRead(AssetBase):
    id: int
    life_remaining_percent: Optional[int] = None

    class Config:
        orm_mode = True


# ==========================
# Asset Event (History) Schemas
# ==========================

class AssetEventBase(BaseModel):
    event_type: str
    actor: Optional[str] = None
    timestamp: Optional[datetime] = None
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    details: Optional[str] = None


class AssetEventCreate(AssetEventBase):
    pass


class AssetEventRead(AssetEventBase):
    id: int
    asset_id: int

    class Config:
        orm_mode = True

# ==========================
# User / Auth Schemas
# ==========================

class UserBase(BaseModel):
    username: str
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = "AssetDeskUser"
    is_active: Optional[bool] = True


class UserCreate(UserBase):
    # plain password only used on create; never stored directly
    password: str


class UserRead(UserBase):
    id: int
    is_active: bool
    role: str  # <-- ADD THIS LINE


    class Config:
        orm_mode = True


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None

# ==========================
# PASSWORD MANAGEMENT
# ==========================

class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class PasswordReset(BaseModel):
    new_password: str
