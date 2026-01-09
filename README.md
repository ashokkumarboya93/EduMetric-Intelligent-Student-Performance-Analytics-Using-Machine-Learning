# EduMetric - Student Analytics Platform

A comprehensive student analytics platform for educational institutions to track performance, risk assessment, and dropout prediction.

## Features

- **Individual Student Analytics**: Search and analyze individual student performance
- **Year-wise Analytics**: Department-level insights and year-specific analytics
- **College-level Analytics**: Institution-wide patterns and distributions
- **CRUD Operations**: Complete student data management
- **Real-time Predictions**: Performance, risk, and dropout predictions

## Project Structure

```
Final Year/
├── static/
│   ├── css/
│   │   └── style.css          # Application styles
│   └── js/
│       └── app.js             # Frontend JavaScript
├── templates/
│   └── index.html             # Main application template
├── .env                       # Environment variables (Supabase config)
├── .gitignore                 # Git ignore rules
├── app.py                     # Main Flask application
├── Procfile                   # Railway deployment config
├── railway.json               # Railway build settings
├── requirements.txt           # Python dependencies
└── README.md                  # This file
```

## Setup

1. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure Environment**
   - Update `.env` with your Supabase credentials
   - Ensure database table "students" exists with required schema

3. **Run Application**
   ```bash
   python app.py
   ```

## Deployment

The application is configured for Railway deployment:
- `Procfile`: Defines the web process
- `railway.json`: Build configuration
- Minimal dependencies for fast builds

## Database Schema

The application expects a Supabase table named "students" with fields including:
- Basic info: rno, name, email, dept, year, curr_sem
- Academic: sem1-sem8, internal_marks, performance_overall
- Attendance: total_days_curr, attended_days_curr, prev_attendance_perc
- Predictions: performance_label, risk_label, dropout_label

## API Endpoints

- `POST /api/analytics/individual` - Individual student analytics
- `POST /api/analytics/year` - Year-wise analytics
- `POST /api/analytics/college` - College-level analytics
- `POST /api/student/search` - Search student by register number
- `POST /api/student/predict` - Get student predictions
- `POST /api/student/create` - Create new student
- `PUT /api/student/update` - Update student data
- `DELETE /api/student/delete` - Delete student

## Technology Stack

- **Backend**: Flask (Python)
- **Database**: Supabase (PostgreSQL)
- **Frontend**: HTML, CSS, JavaScript
- **Charts**: Chart.js
- **Deployment**: Railway