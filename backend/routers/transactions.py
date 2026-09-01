from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from .. import schemas, crud, models
from ..database import get_db

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.post("/", response_model=schemas.Transaction)
def create_tx(tx: schemas.TransactionCreate, db: Session = Depends(get_db)):
    new_tx = crud.create_transaction(db, tx)
    if not new_tx:
        raise HTTPException(status_code=404, detail="Asset not found")
    return new_tx


@router.get("/asset/{asset_id}", response_model=List[schemas.Transaction])
def get_asset_txs(asset_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.Transaction)
        .filter(models.Transaction.asset_id == asset_id)
        .order_by(models.Transaction.performed_on.desc())
        .all()
    )
