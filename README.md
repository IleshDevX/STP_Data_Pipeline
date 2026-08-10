# 🌊 STP Data Pipeline — Sewage Treatment Plant Operations & Telemetry Platform

[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.2-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.1-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://www.python.org/)

An end-to-end telemetry monitoring, data ingestion pipeline, and real-time operations dashboard built for modern Sewage Treatment Plants (STP). The platform aggregates continuous sensor readings across 10 critical wastewater treatment sections, providing automated fault detection, historical trend analytics, time-travel data playback, and robust data storage in Supabase PostgreSQL.

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [System Architecture & Data Flow](#-system-architecture--data-flow)
- [Monitored Process Sections](#-monitored-process-sections)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Database Setup & Data Ingestion](#database-setup--data-ingestion)
  - [Running the Application](#running-the-application)
- [Database Schema](#-database-schema)
- [Scripts Reference](#-scripts-reference)
- [Contributing & License](#-contributing--license)

---

## 🔍 Overview

Sewage Treatment Plants rely on precise physical, chemical, and biological balances to safely process municipal and industrial wastewater. **STP Data Pipeline** bridges operational hardware data with modern web software, enabling plant managers and engineers to:

- Detect anomalies and process faults (e.g., aeration DO drops, MLSS imbalances, effluent threshold breaches) in real-time.
- Playback historical telemetry step-by-step to analyze process degradation or historical incidents.
- Maintain a centralized database in Supabase for sensor logs and operational compliance reporting.

---

## ✨ Key Features

- 📊 **Real-Time Telemetry Dashboard**: Visual cards and health status badges (`NORMAL` / `FAULT`) for sensors across 10 operational sections.
- ⏱️ **Time-Travel Playback Engine**: Historical playback controls allowing users to step minute-by-minute, fast-forward, or jump to specific dates/times.
- 📈 **Interactive Analytical Charts**: High-performance Recharts visualizations detailing parameter trends, target thresholds, and upper/lower operational boundaries.
- 📑 **Audit Logs & Data Management**: Searchable system logs table supporting status filtering (`ALL`, `NORMAL`, `FAULT`), date navigation, and CSV exports.
- ⚡ **High-Performance Python ETL Pipeline**: Fast COPY staging and SQL transformation scripts to process large sensor datasets into Supabase PostgreSQL.
- 🛡️ **Graceful Fallback Mode**: Automatic transition to high-fidelity simulated mock telemetry if Supabase credentials are not connected, ensuring uninterrupted offline/demo execution.
- 🎨 **Modern SaaS UI**: Glassmorphic styling, smooth micro-interactions powered by Framer Motion, and fully responsive layouts.

---

## 🏗️ System Architecture & Data Flow

```
┌────────────────────────┐      ┌────────────────────────────┐      ┌──────────────────────────┐
│  Sensor Telemetry CSV  │ ───► │  Python Ingestion Script   │ ───► │   Supabase PostgreSQL    │
│  (Raw Operational Data)│      │ (import_to_supabase.py)    │      │  (sensor_data Tables)    │
└────────────────────────┘      └────────────────────────────┘      └────────────┬─────────────┘
                                                                                 │
                                                                                 ▼
┌────────────────────────┐      ┌────────────────────────────┐      ┌──────────────────────────┐
│ Time-Travel & Logs UI  │ ◄─── │ Recharts & Sensor Cards    │ ◄─── │  Supabase Service Layer  │
│ (Historical Playback)  │      │ (Framer Motion / Tailwind) │      │  (src/services/supabase) │
└────────────────────────┘      └────────────────────────────┘      └──────────────────────────┘
```

---

## 🏭 Monitored Process Sections

The platform tracks operational parameters organized into 10 key biological and mechanical sections:

| Section | Key Parameters Monitored | Units | Normal Range |
| :--- | :--- | :--- | :--- |
| **Influent** | Flow Rate, BOD, COD, pH, TSS, Temperature | `m³/h`, `mg/L`, `pH`, `°C` | Flow: 150-200 m³/h, pH: 6.5-8.5 |
| **Aeration** | Dissolved Oxygen (DO), Airflow, Blower Energy | `mg/L`, `Nm³/h`, `kW` | DO: 2.0 - 4.0 mg/L |
| **Biological** | Mixed Liquor Suspended Solids (MLSS), SRT, F/M Ratio | `mg/L`, `days`, `kg/kg·d` | MLSS: 3,500 - 4,500 mg/L |
| **Nitrogen Removal** | Ammonia Profile, Nitrification & Denitrification Rates | `mg/L`, `mg/L·h` | Ammonia: 5 - 10 mg/L |
| **IFAS Biofilm** | Biofilm Health Index, Carrier Stress | `%`, `index` | Health: 70% - 100% |
| **Sludge** | RAS Flow, WAS Flow, Combined Sludge Flow, SVI | `m³/h`, `mL/g` | SVI: 80 - 150 mL/g |
| **Chemical & Disinfection** | Coagulant Dose, Chlorine Dose, Chlorine Residual | `L/h`, `kg/h`, `mg/L` | Residual: 0.3 - 1.0 mg/L |
| **Effluent** | Effluent BOD, TSS, TN, NH3, Combined Quality Index | `mg/L` | BOD: 0 - 10 mg/L, NH3: 0 - 1.0 mg/L |
| **Digestion** | Anaerobic Digester Feed, Biogas Yield, Stability Index | `m³/d`, `m³/h`, `%` | Biogas: 200 - 300 m³/h |
| **System** | Mechanical & Equipment Health Index | `%` | 80% - 100% |

---

## 💻 Tech Stack

### Frontend & Core
- **Framework**: [React 19](https://react.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite 6](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Data Visualization**: [Recharts](https://recharts.org/)
- **Icons**: [Lucide React](https://lucide.dev/)

### Backend & Database
- **Database**: [Supabase PostgreSQL](https://supabase.com/)
- **ETL Ingestion**: Python 3 (Psycopg 3, Pandas, Supabase REST Client)
- **AI Analytics**: [Google Gemini API Integration](https://ai.google.dev/) (`@google/genai`)

---

## 📁 Project Structure

```
11 STP-Data_Pipeline/
├── Data/                             # Data generation & PDF documentation
│   ├── PROJECT-PROPOSAL-FINAL-V2.pdf  # Project proposal & specification
│   ├── generate_sensor_data.py       # Python synthetic data generator
│   ├── import_to_supabase.py         # Direct Postgres COPY import script
│   ├── upload_to_supabase_rest.py    # REST API batch upload script
│   └── requirements.txt              # Python dependencies
├── src/
│   ├── components/                   # React UI components
│   │   ├── ChartPanel.tsx            # Recharts trend visualization panel
│   │   └── SensorCard.tsx            # Individual telemetry metric card
│   ├── lib/
│   │   └── utils.ts                  # Classnames (cn) helper utilities
│   ├── services/
│   │   └── supabase.ts               # Supabase data layer & mock generator
│   ├── App.tsx                       # Main application layout & state
│   ├── index.css                     # Global styles & Tailwind entry
│   ├── main.tsx                      # React root entry point
│   └── types.ts                      # TypeScript interfaces & sensor metadata
├── .env.example                      # Template environment configuration
├── import_to_supabase.py             # Root database migration runner
├── index.html                        # Main HTML entry file
├── package.json                      # NPM package definitions & scripts
├── tsconfig.json                     # TypeScript compiler configuration
└── vite.config.ts                    # Vite build & chunking configuration
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: Version `18.0.0` or higher
- **npm**: Version `9.0.0` or higher
- **Python** *(optional for data ingestion)*: Version `3.10+`

---

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd "11 STP-Data_Pipeline"
   ```

2. **Install frontend dependencies**:
   ```bash
   npm install
   ```

3. **Install Python dependencies** *(optional, for database ETL)*:
   ```bash
   pip install -r Data/requirements.txt
   ```

---

### Environment Variables

Copy `.env.example` to create a `.env` file in the project root:

```bash
cp .env.example .env
```

Configure your credentials in `.env`:

```env
# Google Gemini AI Key
GEMINI_API_KEY="your_gemini_api_key"

# Supabase Credentials
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your_supabase_anon_key"

# Database Connection (For Python direct import)
SUPABASE_DB_HOST="db.your-project.supabase.co"
SUPABASE_DB_PASSWORD="your_database_password"
```

> 💡 **Note**: If Supabase variables are left default or unconfigured, the application will automatically run in **Mock Data Mode**, enabling full functionality for testing.

---

### Database Setup & Data Ingestion

To populate your Supabase PostgreSQL database with sensor telemetry:

```bash
python import_to_supabase.py
```

This script automatically:
1. Creates `public.sensor_data_raw` (staging) and `public.sensor_data` (production) tables.
2. Creates indexes on `recorded_at` and `sensor_name` for fast time-series query execution.
3. Performs a bulk CSV import into the database.

---

### Running the Application

Start the local development server:

```bash
npm run dev
```

The application will be accessible at `http://localhost:3000`.

To build for production:

```bash
npm run build
```

---

## 🗄️ Database Schema

```sql
-- Staging Table
CREATE TABLE IF NOT EXISTS public.sensor_data_raw (
    id BIGINT,
    date_text TEXT,
    time_text TEXT,
    sensor_name TEXT,
    value NUMERIC,
    status_flag TEXT
);

-- Production Telemetry Table
CREATE TABLE IF NOT EXISTS public.sensor_data (
    id BIGINT PRIMARY KEY,
    recorded_at TIMESTAMP NOT NULL,
    sensor_name TEXT NOT NULL,
    value NUMERIC NOT NULL,
    status_flag TEXT NOT NULL CHECK (status_flag IN ('NORMAL', 'FAULT'))
);

-- Time Series Indexes
CREATE INDEX idx_sensor_data_recorded_at ON public.sensor_data(recorded_at);
CREATE INDEX idx_sensor_data_sensor_name ON public.sensor_data(sensor_name);
```

---

## 🛠️ Scripts Reference

| Command | Description |
| :--- | :--- |
| `npm run dev` | Launches Vite local development server on port 3000 |
| `npm run build` | Builds optimized production bundle into `dist/` |
| `npm run preview` | Previews production build locally |
| `npm run lint` | Runs TypeScript type checker (`tsc --noEmit`) |
| `python Data/generate_sensor_data.py` | Generates synthetic time-series sensor telemetry |
| `python import_to_supabase.py` | Executes PostgreSQL table setup and CSV bulk copy |

---

## 🤝 Contributing & License

Contributions are welcome! Please open an issue or submit a pull request for any bug fixes, feature proposals, or operational section enhancements.

Developed for STP operations and environmental data monitoring.
