# EduMetric Deployment Guide - PythonAnywhere

## Prerequisites
1. PythonAnywhere account (free or paid)
2. MySQL database on PythonAnywhere

## Step 1: Upload Code
1. Go to PythonAnywhere Dashboard
2. Open a Bash console
3. Clone your repository:
   ```bash
   git clone https://github.com/ashokkumarboya93/EduMetric-Final-Year-Project.git
   cd EduMetric-Final-Year-Project
   ```

## Step 2: Set up Virtual Environment
```bash
mkvirtualenv --python=/usr/bin/python3.10 edumetric
pip install -r requirements.txt
```

## Step 3: Set up MySQL Database
1. Go to PythonAnywhere Dashboard > Databases
2. Create a new MySQL database: `yourusername$edumetric`
3. Note your database details:
   - Host: `yourusername.mysql.pythonanywhere-services.com`
   - Database: `yourusername$edumetric`
   - Username: `yourusername`
   - Password: [your password]

## Step 4: Import Your Data
1. Export your local MySQL data:
   ```bash
   mysqldump -u root -p edumetric_db > edumetric_backup.sql
   ```
2. Upload the SQL file to PythonAnywhere
3. Import to PythonAnywhere MySQL:
   ```bash
   mysql -u yourusername -p -h yourusername.mysql.pythonanywhere-services.com yourusername$edumetric < edumetric_backup.sql
   ```

## Step 5: Configure Environment Variables
Create a `.env` file in your project directory:
```
DB_HOST=yourusername.mysql.pythonanywhere-services.com
DB_NAME=yourusername$edumetric
DB_USER=yourusername
DB_PASSWORD=your_mysql_password
DB_PORT=3306
SECRET_KEY=your-secret-key-here
DEBUG=False
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
```

## Step 6: Set up Web App
1. Go to PythonAnywhere Dashboard > Web
2. Create a new web app
3. Choose "Manual configuration" with Python 3.10
4. Set the source code directory: `/home/yourusername/EduMetric-Final-Year-Project`
5. Set the WSGI configuration file: `/home/yourusername/EduMetric-Final-Year-Project/wsgi.py`
6. Set the virtualenv: `/home/yourusername/.virtualenvs/edumetric`

## Step 7: Configure Static Files
In the Web tab, add static files mapping:
- URL: `/static/`
- Directory: `/home/yourusername/EduMetric-Final-Year-Project/static/`

## Step 8: Update WSGI File
Edit `/home/yourusername/EduMetric-Final-Year-Project/wsgi.py`:
```python
#!/usr/bin/python3.10

import sys
import os

# Add your project directory to sys.path
project_home = '/home/yourusername/EduMetric-Final-Year-Project'
if project_home not in sys.path:
    sys.path = [project_home] + sys.path

# Load environment variables
from dotenv import load_dotenv
load_dotenv(os.path.join(project_home, '.env'))

from app import app as application

if __name__ == "__main__":
    application.run()
```

## Step 9: Test and Deploy
1. Click "Reload" on the Web tab
2. Visit your app at: `https://yourusername.pythonanywhere.com`

## Troubleshooting
- Check error logs in PythonAnywhere Dashboard > Web > Log files
- Test database connection in a console:
  ```python
  from db import test_connection
  test_connection()
  ```

## Environment Variables for Production
Set these in your `.env` file:
- `DB_HOST`: Your PythonAnywhere MySQL host
- `DB_NAME`: Your database name
- `DB_USER`: Your PythonAnywhere username
- `DB_PASSWORD`: Your MySQL password
- `SECRET_KEY`: A secure random key
- `DEBUG`: Set to `False` for production