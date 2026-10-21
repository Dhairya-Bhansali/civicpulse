# CivicPulse – Cloud Deployment Guide

This guide explains how to deploy CivicPulse 24/7 online for free using **TiDB Cloud (Serverless MySQL)** and **Render.com (Node.js Web Service)**.

---

## Architecture for Cloud Hosting

- **Frontend & Backend**: Hosted together on **Render** (Node.js Web Service, Free Tier).
- **Database**: Hosted on **TiDB Cloud** (Free 5 GiB Serverless MySQL, fully compatible with MySQL 8).

---

## Step 1: Set Up Free Cloud MySQL on TiDB Cloud

1. Go to [https://tidbcloud.com](https://tidbcloud.com) and sign up for free (using GitHub or Google).
2. Click **Create Cluster** and choose **Serverless (Free)**.
3. Once created, click **Connect**:
   - Choose **Node.js** or **General connection string**.
   - Note down:
     - `Host`
     - `Port` (usually 4000)
     - `User`
     - `Password`
     - `Database Name` (`test` or create `civicpulse`)
4. In the TiDB Cloud web console, open the **SQL Editor**, paste the contents of `database/schema.sql`, and execute it to create all tables and sample data.

---

## Step 2: Deploy to Render.com

1. Go to [https://render.com](https://render.com) and log in with your GitHub account (`Dhairya-Bhansali`).
2. Click **New +** $\rightarrow$ **Web Service**.
3. Select your repository: `Dhairya-Bhansali/civicpulse`.
4. Configure the service:
   - **Name**: `civicpulse`
   - **Environment**: `Node`
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `node backend/server.js`
5. In **Environment Variables**, add:
   ```ini
   PORT=5000
   DB_HOST=<your-tidb-host>
   DB_PORT=4000
   DB_USER=<your-tidb-user>
   DB_PASSWORD=<your-tidb-password>
   DB_NAME=civicpulse
   ADMIN_USER=admin
   ADMIN_PASSWORD=admin123
   JWT_SECRET=civicpulse-production-super-secret-key-98765
   MAP_LAT=23.0225
   MAP_LNG=72.5714
   MAP_ZOOM=12
   ```
6. Click **Deploy Web Service**.
7. Render will provide a permanent URL like `https://civicpulse.onrender.com`.

---

## Alternative: Instant Public Link from Local Machine

If presenting live for a Viva / evaluation without setting up cloud databases:

1. Ensure the backend is running (`npm start` inside `backend`).
2. Run in a terminal:
   ```bash
   ssh -o ServerAliveInterval=30 -R 80:localhost:5000 serveo.net
   ```
3. Share the generated HTTPS link. Anyone with internet access can use the platform connected directly to your local MySQL database.
