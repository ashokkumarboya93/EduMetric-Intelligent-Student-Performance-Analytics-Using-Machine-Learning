import mysql.connector
from mysql.connector import Error
import pandas as pd

def get_db_connection():
    try:
        connection = mysql.connector.connect(
            host='localhost',
            database='edumetric_db',
            user='root',
            password='A$hok3117'
        )
        return connection
    except Error as e:
        print(f"Error connecting to MySQL: {e}")
        return None

def load_students_df():
    """Load all students from MySQL as DataFrame - SINGLE SOURCE OF TRUTH"""
    try:
        conn = get_db_connection()
        if not conn:
            return pd.DataFrame()
        
        df = pd.read_sql("SELECT * FROM students", conn)
        conn.close()
        return df
    except Exception as e:
        print(f"Error loading students from MySQL: {e}")
        return pd.DataFrame()

def get_student_by_rno(rno):
    """Get single student by RNO from MySQL"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM students WHERE RNO = %s", (rno,))
        student = cursor.fetchone()
        conn.close()
        return student
    except Exception as e:
        print(f"Error fetching student {rno}: {e}")
        return None

def insert_student(student_data):
    """Insert new student into MySQL"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        columns = list(student_data.keys())
        values = list(student_data.values())
        placeholders = ', '.join(['%s'] * len(values))
        columns_str = ', '.join(columns)
        
        query = f"INSERT INTO students ({columns_str}) VALUES ({placeholders})"
        cursor.execute(query, values)
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error inserting student: {e}")
        return False

def update_student(rno, student_data):
    """Update student in MySQL"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        set_clause = ', '.join([f"{k} = %s" for k in student_data.keys()])
        values = list(student_data.values()) + [rno]
        
        query = f"UPDATE students SET {set_clause} WHERE RNO = %s"
        cursor.execute(query, values)
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error updating student {rno}: {e}")
        return False

def delete_student(rno):
    """Delete student from MySQL"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM students WHERE RNO = %s", (rno,))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error deleting student {rno}: {e}")
        return False

def batch_insert_students(students_df):
    """Batch insert/update students from DataFrame to MySQL"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        for _, row in students_df.iterrows():
            # Convert row to dict and handle NaN values
            student_data = row.to_dict()
            student_data = {k: (None if pd.isna(v) else v) for k, v in student_data.items()}
            
            # Use INSERT ... ON DUPLICATE KEY UPDATE
            columns = list(student_data.keys())
            values = list(student_data.values())
            placeholders = ', '.join(['%s'] * len(values))
            columns_str = ', '.join(columns)
            
            # Create update clause for duplicate key
            update_clause = ', '.join([f"{col} = VALUES({col})" for col in columns if col != 'RNO'])
            
            query = f"""
                INSERT INTO students ({columns_str}) 
                VALUES ({placeholders})
                ON DUPLICATE KEY UPDATE {update_clause}
            """
            
            cursor.execute(query, values)
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error batch inserting students: {e}")
        return False

def get_stats():
    """Get basic statistics from MySQL"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Total students
        cursor.execute("SELECT COUNT(*) FROM students")
        total_students = cursor.fetchone()[0]
        
        # Departments
        cursor.execute("SELECT DISTINCT DEPT FROM students WHERE DEPT IS NOT NULL ORDER BY DEPT")
        departments = [row[0] for row in cursor.fetchall()]
        
        # Years
        cursor.execute("SELECT DISTINCT YEAR FROM students WHERE YEAR IS NOT NULL ORDER BY YEAR")
        years = [int(row[0]) for row in cursor.fetchall()]
        
        conn.close()
        return {
            'total_students': total_students,
            'departments': departments,
            'years': years
        }
    except Exception as e:
        print(f"Error getting stats: {e}")
        return {'total_students': 0, 'departments': [], 'years': []}

def test_connection():
    conn = get_db_connection()
    if conn:
        print("Database connection successful!")
        conn.close()
        return True
    else:
        print("Database connection failed!")
        return False