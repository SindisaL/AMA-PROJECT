from sqlalchemy.orm import Session
from datetime import datetime
from . import models, schemas


def get_assets(db: Session, skip: int = 0, limit: int = 100, search: str | None = None):
    query = db.query(models.Asset)
    if search:
        like = f"%{search}%"
        query = query.filter(
            (models.Asset.asset_tag.ilike(like)) |
            (models.Asset.serial_number.ilike(like)) |
            (models.Asset.name.ilike(like)) |
            (models.Asset.current_holder.ilike(like))
        )
    return query.offset(skip).limit(limit).all()


def get_asset(db: Session, asset_id: int):
    return db.query(models.Asset).filter(models.Asset.id == asset_id).first()


def create_asset(db: Session, asset: schemas.AssetCreate):
    db_asset = models.Asset(**asset.dict())
    db.add(db_asset)
    db.commit()
    db.refresh(db_asset)
    return db_asset


def update_asset_status(
    db: Session,
    asset: models.Asset,
    status: str,
    current_holder: str | None = None,
    location: str | None = None,
):
    asset.status = status
    if current_holder is not None:
        asset.current_holder = current_holder
    if location is not None:
        asset.location = location
    asset.last_movement = datetime.utcnow()
    db.commit()
    db.refresh(asset)
    return asset


def create_transaction(db: Session, tx: schemas.TransactionCreate):
    asset = get_asset(db, tx.asset_id)
    if not asset:
        return None

    db_tx = models.Transaction(
        asset_id=tx.asset_id,
        tx_type=tx.tx_type,
        from_user=tx.from_user,
        to_user=tx.to_user,
        from_location=tx.from_location,
        to_location=tx.to_location,
        condition_notes=tx.condition_notes,
        performed_by=tx.performed_by,
    )
    db.add(db_tx)

    if tx.tx_type.upper() == "ISSUE":
        update_asset_status(
            db, asset, status="issued", current_holder=tx.to_user, location=tx.to_location
        )
    elif tx.tx_type.upper() == "RECEIVE":
        update_asset_status(
            db, asset, status="available", current_holder=None, location=tx.to_location
        )
    elif tx.tx_type.upper() == "VERIFY":
        asset.last_movement = datetime.utcnow()
        db.commit()
    elif tx.tx_type.upper() == "TRANSFER":
        update_asset_status(
            db,
            asset,
            status="issued" if tx.to_user else asset.status,
            current_holder=tx.to_user if tx.to_user else asset.current_holder,
            location=tx.to_location if tx.to_location else asset.location,
        )

    db.commit()
    db.refresh(db_tx)
    return db_tx


def get_dashboard(db: Session):
    total = db.query(models.Asset).count()
    available = db.query(models.Asset).filter(models.Asset.status == "available").count()
    issued = db.query(models.Asset).filter(models.Asset.status == "issued").count()
    in_repair = db.query(models.Asset).filter(models.Asset.status == "repair").count()
    disposed = db.query(models.Asset).filter(models.Asset.status == "disposed").count()
    return {
        "total_assets": total,
        "available": available,
        "issued": issued,
        "in_repair": in_repair,
        "disposed": disposed,
    }
