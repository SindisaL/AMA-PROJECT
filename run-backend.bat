@echo off
cd backend
uvicorn backend.main:app --reload
pause
