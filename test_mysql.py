import mysql.connector

# Connect to database
conn = mysql.connector.connect(
    host='localhost',
    database='edumetric_db',
    user='root',
    password='A$hok3117'
)

cursor = conn.cursor()

# Check table structure
print("=== TABLE STRUCTURE ===")
cursor.execute("DESCRIBE students")
for row in cursor.fetchall():
    print(f"{row[0]} - {row[1]}")

print("\n=== SAMPLE DATA ===")
cursor.execute("SELECT * FROM students LIMIT 3")
rows = cursor.fetchall()
for i, row in enumerate(rows):
    print(f"Row {i+1}: {row}")

print("\n=== COLUMN NAMES ===")
cursor.execute("SELECT * FROM students LIMIT 1")
cursor.fetchone()
column_names = [desc[0] for desc in cursor.description]
print("Columns:", column_names)

conn.close()