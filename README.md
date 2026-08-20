# 🚌 CampusWay Buzz

> A real-time campus bus tracking system built with **React**, **Express**, **Socket.IO**, and **SQL Server**. Track a live fleet of campus buses on an interactive map, with dedicated dashboards for students, drivers, and administrators.

<!--<p align="center">
  <a href="#"><strong>🌐 Live Demo</strong></a>
</p>-->

---

## 📖 Overview

CampusWay Buzz solves a problem every student on a bus route deals with — not knowing where the bus actually is until it shows up (or doesn't). It tracks a 19-bus fleet in real time so students can see live locations, drivers can run their trips from the app, and admins can manage the whole system from one dashboard.

Students can:

- 🗺️ View live bus locations on an interactive map
- 📍 Check available buses and routes
- 🕒 Get ETA calculations
- 💬 Use in-app chat support and route assistance
- 🤖 Get AI-powered route help via Gemini

Drivers can:

- 🔐 Log in securely and manage sessions
- 📡 Share live GPS location
- ▶️ Start and end trips
- ✅ Log attendance/check-ins

Admins can:

- 🚍 Manage the bus fleet
- 📊 Review driver login activity and audit data
- 🛠️ Oversee the system end-to-end

---

# 📸 Screenshots

| Live Map |
|-----------|
|<img width="1123" height="1401" alt="WhatsApp Image 2026-08-20 at 11 45 37 AM (3)" src="https://github.com/user-attachments/assets/7cc335bc-bb6a-4cb1-8a29-09457439fd92" />
 |

| Driver Dashboard |
|-----------|
|<img width="1060" height="1484" alt="WhatsApp Image 2026-08-20 at 11 45 37 AM (1)" src="https://github.com/user-attachments/assets/22c8cf32-ae07-4837-a7af-0413a0504e00" />
|

<!--| Admin Panel |
|-----------|
| *(add screenshot here)* |-->

---

#  Features

##  Live Fleet Tracking

- Real-time location updates over Socket.IO
- Covers a 19-bus fleet
- Interactive Leaflet map
- Location history logging

---

##  Authentication & Roles

- JWT-based login for drivers and admins
- Role-based access (student / driver / admin)
- Session management for drivers

---

##  Driver Tools

- Start/end trip controls
- Live GPS broadcasting
- Attendance/check-in logging
- Session start/stop handling

---

##  Admin Tools

- Bus fleet management
- Login activity & audit review
- Centralized dashboard

---

##  AI & Assistance

- Gemini AI integration for route assistance
- In-app chat support
- ETA calculation

---

##  Mobile

- Android packaging via Capacitor
- Dedicated driver mobile app scaffolded with Expo Router (in progress)

---

#  Tech Stack

## Frontend

| Technology | Usage |
|------------|-------|
| React 19 | UI Framework |
| Vite | Build Tool |
| TypeScript | Type Safety |
| Leaflet | Interactive Maps |
| Socket.IO Client | Real-time Updates |
| Capacitor | Android Packaging |

---

## Backend

| Technology | Usage |
|------------|-------|
| Express | REST API |
| Node.js | Runtime |
| Socket.IO | Real-time Broadcasting |
| mssql | SQL Server Driver |
| JWT | Authentication |
| Helmet | Security Headers |
| CORS | Cross-Origin Handling |
| Morgan | Request Logging |
| node-cron | Scheduled Jobs |

---

## Database

| Technology | Usage |
|------------|-------|
| SQL Server | Primary Persistence |
| `Buses` | Bus fleet data |
| `LocationHistory` | GPS history |
| `DriverCheckins` | Attendance data |
| Admin audit tables | Login/activity tracking |

---

## Mobile

| Technology | Usage |
|------------|-------|
| Expo Router | Driver App (in progress) |

---

## Deployment

- Environment-based configuration (dev/production)
- HTTPS support
- Firebase Hosting *(frontend, legacy/optional)*

---

## External APIs

| API | Purpose |
|-----|----------|
| Gemini AI | Route assistance & chat support |

---

# 📂 Project Structure

```text
campusway-buzz
│
├── frontend
│   ├── src
│   │   ├── components
│   │   ├── hooks
│   │   ├── pages
│   │   └── App.tsx
│   └── vite.config.ts
│
├── backend
│   ├── routes
│   ├── controllers
│   ├── sockets
│   ├── db
│   └── server.js
│
├── CampusWayDriver        # Expo Router driver app (scaffolded)
│
├── create_table.sql
└── package.json
```

---

#  Getting Started

## Prerequisites

- Node.js 18+
- npm
- SQL Server instance

---

## Installation

```bash
git clone https://github.com/yaseenaffana/campusway-buzz.git

cd campusway-buzz

npm install
```

---

## Environment Setup

Create `.env` files for both `frontend` and `backend` with your database credentials, JWT secret, and API URL.

---

## Run Frontend

```bash
cd frontend
npm run dev
```

Open

```
http://localhost:3010
```

---

## Run Backend

```bash
cd backend
npm run dev
```

Runs on

```
http://localhost:4010
```

---

## Run Both (Root)

```bash
npm run dev
```

---

## Build

```bash
npm run build
```

---

## Database Setup

```bash
# Run create_table.sql against your SQL Server instance
# to create and seed bus routes, credentials, destinations, and school coordinates
```

---

#  API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/api/auth/login` | Driver/admin login |
| `/api/buses` | List all buses |
| `/api/buses/:id/location` | Live bus location |
| `/api/buses/:id/history` | Location history |
| `/api/buses/:id/disconnect` | Disconnect driver session |
| `/api/admin/*` | Admin management routes |

---

#  UI Highlights

- Dark, map-first layout
- Real-time marker updates
- Mobile-responsive design
- Role-specific dashboards
- Smooth live tracking animations

---

#  Performance Optimizations

- Socket.IO for low-latency updates over polling
- Bounded location history queries
- Efficient map re-renders
- Session-based disconnect handling to avoid stale bus markers

---

#  Roadmap

- [ ] Finish CampusWayDriver mobile app (Expo Router)
- [ ] Remove legacy Firebase compatibility code
- [ ] Consolidate legacy/compatibility server files
- [ ] Background GPS tracking on mobile

---

#  License

This project is intended for educational and personal use.

---

#  Acknowledgements

- OpenStreetMap / Leaflet
- Socket.IO
- Google Gemini

---

<p align="center">

</p>

## Author

Yaseen Affan
