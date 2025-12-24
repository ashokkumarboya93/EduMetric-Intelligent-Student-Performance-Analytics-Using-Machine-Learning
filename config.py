import os

# Database configuration for deployment
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'database': os.getenv('DB_NAME', 'edumetric_db'),
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', 'A$hok3117'),
    'port': int(os.getenv('DB_PORT', 3306))
}

# Flask configuration
SECRET_KEY = os.getenv('SECRET_KEY', 'your-secret-key-here')
DEBUG = os.getenv('DEBUG', 'False').lower() == 'true'

# Email configuration
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USER = os.getenv('EMAIL_USER', 'ashokkumarboya93@gmail.com')
EMAIL_PASSWORD = os.getenv('EMAIL_PASSWORD', 'lubwbacntoubetxb')