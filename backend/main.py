from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import Base, engine
from .routers import assets, transactions, dashboard

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Asset Management API")

origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(assets.router)
app.include_router(transactions.router)
app.include_router(dashboard.router)
