import mysql.connector

def get_db_connection():
    return mysql.connector.connect(
        host="localhost",
        user="root",
        password="A$hok3117",
        database="edumetric_db"
    )
