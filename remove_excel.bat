@echo off
cd /d "%~dp0"
del /q "algorithms\*.xlsx" 2>nul
del /q "algorithms\*.csv" 2>nul
del /q "public\all_results.json" 2>nul
echo Excel, CSV, and JSON files removed.
