@echo off
cd /d "%~dp0"
del /q "algorithms\*.xlsx" 2>nul
del /q "algorithms\*.csv" 2>nul
echo Excel and CSV files removed.
