# 🚀 EduMetric PythonAnywhere Deployment Guide

## ✅ CURRENT STATUS
- ✅ Project uploaded to PythonAnywhere (3.7MB)
- ✅ WSGI file configured for ashokkumar369
- ✅ Database configuration updated
- ✅ Requirements.txt ready

## 📋 STEP-BY-STEP DEPLOYMENT

### 1. Extract Your Project
```bash
cd /home/ashokkumar369
unzip Final\ Year.zip
mv "Final Year" Edumetric1
```

### 2. Install Dependencies
```bash
cd Edumetric1
pip3.10 install --user -r requirements.txt
```

### 3. Setup MySQL Database
1. Go to **Databases** tab in PythonAnywhere
2. Create database: `ashokkumar369$edumetric`
3. Set password (remember this!)
4. Create tables using this SQL:

```sql
CREATE TABLE students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rno VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    dept VARCHAR(50),
    year INT,
    curr_sem INT,
    mentor VARCHAR(100),
    mentor_email VARCHAR(100),
    sem1 FLOAT DEFAULT 0,
    sem2 FLOAT DEFAULT 0,
    sem3 FLOAT DEFAULT 0,
    sem4 FLOAT DEFAULT 0,
    sem5 FLOAT DEFAULT 0,
    sem6 FLOAT DEFAULT 0,
    sem7 FLOAT DEFAULT 0,
    sem8 FLOAT DEFAULT 0,
    internal_marks FLOAT DEFAULT 20,
    total_days_curr FLOAT DEFAULT 90,
    attended_days_curr FLOAT DEFAULT 80,
    prev_attendance_perc FLOAT DEFAULT 85,
    behavior_score_10 FLOAT DEFAULT 7,
    past_avg FLOAT DEFAULT 0,
    past_count INT DEFAULT 0,
    internal_pct FLOAT DEFAULT 0,
    attendance_pct FLOAT DEFAULT 0,
    behavior_pct FLOAT DEFAULT 0,
    performance_trend FLOAT DEFAULT 0,
    performance_overall FLOAT DEFAULT 0,
    risk_score FLOAT DEFAULT 0,
    dropout_score FLOAT DEFAULT 0,
    present_att FLOAT DEFAULT 0,
    prev_att FLOAT DEFAULT 0,
    performance_label VARCHAR(20) DEFAULT 'unknown',
    risk_label VARCHAR(20) DEFAULT 'unknown',
    dropout_label VARCHAR(20) DEFAULT 'unknown',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 4. Set Environment Variables
Create `.env` file in your project:
```bash
nano /home/ashokkumar369/Edumetric1/.env
```

Add:
```
DB_PASSWORD=YOUR_MYSQL_PASSWORD
SECRET_KEY=edumetric-pythonanywhere-secret-2024
DEBUG=False
```

### 5. Configure Web App
1. Go to **Web** tab
2. Click "Add a new web app"
3. Choose "Manual configuration"
4. Select Python 3.10
5. Set these paths:

**Source code:** `/home/ashokkumar369/Edumetric1`
**WSGI file:** `/var/www/ashokkumar369_pythonanywhere_com_wsgi.py`

### 6. Update WSGI File
Replace WSGI file content with:
```python
#!/usr/bin/python3.10

import sys
import os

# Add your project directory to sys.path
project_home = '/home/ashokkumar369/Edumetric1'
if project_home not in sys.path:
    sys.path = [project_home] + sys.path

from app import app as application

if __name__ == "__main__":
    application.run()
```

### 7. Set Static Files
In Web tab, add static files mapping:
- URL: `/static/`
- Directory: `/home/ashokkumar369/Edumetric1/static/`

### 8. Test Database Connection
```bash
cd /home/ashokkumar369/Edumetric1
python3.10 -c "from db import test_connection; test_connection()"
```

### 9. Load Sample Data (Optional)
If you have CSV data to import:
```bash
python3.10 -c "
import pandas as pd
from db import batch_insert_students
df = pd.read_csv('your_data.csv')
batch_insert_students(df)
print('Data loaded successfully!')
"
```

### 10. Reload Web App
Click **Reload** button in Web tab

## 🌐 YOUR LIVE URL
**https://ashokkumar369.pythonanywhere.com**

## 🔧 TROUBLESHOOTING

### Error Logs
Check error logs in Web tab if app doesn't load

### Common Issues:
1. **Import Error**: Check if all packages installed
2. **Database Error**: Verify password in config.py
3. **File Not Found**: Check file paths in WSGI

### Debug Commands:
```bash
# Check Python path
python3.10 -c "import sys; print(sys.path)"

# Test imports
python3.10 -c "from app import app; print('App imported successfully')"

# Check database
python3.10 -c "from config import DB_CONFIG; print(DB_CONFIG)"
```

## 📱 APP FEATURES AFTER DEPLOYMENT

### 🎯 Student Search
- URL: `/api/student/search`
- Search by RNO, get predictions

### 📊 Analytics
- Department: `/api/department/analyze`
- Year: `/api/year/analyze`
- College: `/api/college/analyze`

### 📧 Email Alerts
- Automatic mentor notifications
- Performance alerts

### 📈 Batch Analytics
- Cohort performance tracking
- Trend analysis

## 🔐 SECURITY NOTES
- Database password is secure
- Debug mode disabled in production
- Email credentials protected

## 📞 SUPPORT
If you encounter issues:
1. Check PythonAnywhere error logs
2. Verify database connection
3. Test individual components

Your EduMetric app is now ready for deployment! 🎉