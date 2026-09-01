from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from .. import crud, schemas

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/", response_model=schemas.DashboardStats)
def get_stats(db: Session = Depends(get_db)):
    data = crud.get_dashboard(db)
    return schemas.DashboardStats(**data)
