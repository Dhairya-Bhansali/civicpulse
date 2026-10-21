@echo off
title CivicPulse Public Link Generator
echo ========================================================
echo Starting Public HTTPS Tunnel for CivicPulse...
echo Make sure your backend is running on http://localhost:5000
echo ========================================================
echo.
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=5 -R 80:localhost:5000 serveo.net
pause
