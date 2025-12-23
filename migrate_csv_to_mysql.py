import pandas as pd
from db import get_db_connection

print("Starting CSV migration...")

df = pd.read_csv("data/DS3_full_report.csv")
print(f"Loaded {len(df)} rows from CSV")

conn = get_db_connection()
cursor = conn.cursor()

successful_inserts = 0
skipped_rows = 0

for _, row in df.iterrows():
    # Skip rows with missing essential data
    if pd.isna(row["RNO"]) or pd.isna(row["NAME"]):
        skipped_rows += 1
        continue
        
    # Handle NaN values and convert to appropriate types
    def safe_convert(value, default=None):
        if pd.isna(value):
            return default
        return value
    
    def safe_int(value, default=0):
        if pd.isna(value):
            return default
        try:
            return int(float(value))
        except (ValueError, TypeError):
            return default
    
    def safe_float(value, default=0.0):
        if pd.isna(value):
            return default
        try:
            return float(value)
        except (ValueError, TypeError):
            return default

    values = (
        safe_convert(row["RNO"]),
        safe_convert(row["NAME"]),
        safe_convert(row["EMAIL"]),
        safe_convert(row["DEPT"]),
        safe_int(row["YEAR"]),
        safe_int(row["CURR_SEM"]),
        safe_int(row["YEAR"]),  # Using YEAR as batch_year since BATCH_YEAR column doesn't exist

        safe_float(row["SEM1"]),
        safe_float(row["SEM2"]),
        safe_float(row["SEM3"]),
        safe_float(row["SEM4"]),
        safe_float(row["SEM5"]),
        safe_float(row["SEM6"]),
        safe_float(row["SEM7"]),
        safe_float(row["SEM8"]),

        safe_float(row["internal_pct"]),
        safe_float(row["attendance_pct"]),
        safe_float(row["behavior_pct"]),

        safe_float(row["performance_overall"]),
        safe_convert(row["performance_label"]),

        safe_float(row["risk_score"]),
        safe_convert(row["risk_label"]),

        safe_float(row["dropout_score"]),
        safe_convert(row["dropout_label"])
    )

    try:
        cursor.execute("""
            INSERT INTO students (
                rno, name, email, dept, year, curr_sem, batch_year,
                sem1, sem2, sem3, sem4, sem5, sem6, sem7, sem8,
                internal_pct, attendance_pct, behavior_pct,
                performance_overall, performance_label,
                risk_score, risk_label,
                dropout_score, dropout_label
            )
            VALUES (%s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,
                    %s,%s,
                    %s,%s,
                    %s,%s)
        """, values)
        successful_inserts += 1
        
        if successful_inserts % 100 == 0:
            print(f"Processed {successful_inserts} records...")
            
    except Exception as e:
        print(f"Error inserting row {successful_inserts + skipped_rows + 1}: {e}")
        skipped_rows += 1
        continue

conn.commit()
conn.close()

print("CSV migration completed successfully!")
print(f"Successfully inserted: {successful_inserts} records")
print(f"Skipped rows: {skipped_rows} records")
print(f"Total processed: {successful_inserts + skipped_rows} records")
