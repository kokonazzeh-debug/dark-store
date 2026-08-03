@echo off
title DARK STORE - Backend Server
cd /d "%~dp0"
echo ============================================
echo   DARK STORE Backend Server
echo ============================================
echo   الموقع:      http://localhost:8000
echo   لوحة التحكم: http://localhost:8000/admin
echo   (اترك هذه النافذة مفتوحة أثناء العمل)
echo ============================================
python server.py
pause
