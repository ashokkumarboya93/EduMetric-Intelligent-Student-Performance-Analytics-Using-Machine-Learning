#!/usr/bin/env python3
"""
Script to compute and update predictions for all students in MySQL database
This will make analytics work properly by adding missing prediction columns
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from db import get_db_connection, load_students_df
from app import compute_features, predict_student
import pandas as pd

def update_student_predictions():
    """Compute and update predictions for all students in MySQL"""
    print("Loading students from MySQL...")
    df = load_students_df()
    
    if df.empty:
        print("No students found in database!")
        return
    
    print(f"Found {len(df)} students. Computing predictions...")
    
    conn = get_db_connection()
    if not conn:
        print("Failed to connect to database!")
        return
    
    cursor = conn.cursor()
    
    # First, add prediction columns if they don't exist
    prediction_columns = [
        "past_avg DECIMAL(5,2) DEFAULT 0.0",
        "past_count INT DEFAULT 0",
        "internal_pct DECIMAL(5,2) DEFAULT 0.0",
        "attendance_pct DECIMAL(5,2) DEFAULT 0.0",
        "behavior_pct DECIMAL(5,2) DEFAULT 0.0",
        "performance_trend DECIMAL(5,2) DEFAULT 0.0",
        "performance_overall DECIMAL(5,2) DEFAULT 0.0",
        "risk_score DECIMAL(5,2) DEFAULT 0.0",
        "dropout_score DECIMAL(5,2) DEFAULT 0.0",
        "present_att DECIMAL(5,2) DEFAULT 0.0",
        "prev_att DECIMAL(5,2) DEFAULT 0.0",
        "performance_label VARCHAR(20) DEFAULT 'unknown'",
        "risk_label VARCHAR(20) DEFAULT 'unknown'",
        "dropout_label VARCHAR(20) DEFAULT 'unknown'"
    ]
    
    print("Adding prediction columns to database...")
    for col_def in prediction_columns:
        col_name = col_def.split()[0]
        try:
            cursor.execute(f"ALTER TABLE students ADD COLUMN {col_def}")
            print(f"Added column: {col_name}")
        except Exception as e:
            if "Duplicate column name" in str(e):
                print(f"Column {col_name} already exists")
            else:
                print(f"Error adding column {col_name}: {e}")
    
    conn.commit()
    
    # Now compute predictions for each student
    updated_count = 0
    for idx, row in df.iterrows():
        try:
            student_dict = row.to_dict()
            rno = student_dict.get('RNO')
            
            if not rno:
                print(f"Skipping row {idx}: No RNO found")
                continue
            
            print(f"Processing student {rno}...")
            
            # Compute features and predictions
            feats = compute_features(student_dict)
            preds = predict_student(feats)
            
            print(f"Computed for {rno}: perf={preds['performance_label']}, risk={preds['risk_label']}")
            
            # Update database
            update_query = """
                UPDATE students SET 
                    past_avg = %s, past_count = %s, internal_pct = %s,
                    attendance_pct = %s, behavior_pct = %s, performance_trend = %s,
                    performance_overall = %s, risk_score = %s, dropout_score = %s,
                    present_att = %s, prev_att = %s,
                    performance_label = %s, risk_label = %s, dropout_label = %s
                WHERE RNO = %s
            """
            
            values = (
                feats['past_avg'], feats['past_count'], feats['internal_pct'],
                feats['attendance_pct'], feats['behavior_pct'], feats['performance_trend'],
                feats['performance_overall'], feats['risk_score'], feats['dropout_score'],
                feats['present_att'], feats['prev_att'],
                preds['performance_label'], preds['risk_label'], preds['dropout_label'],
                rno
            )
            
            cursor.execute(update_query, values)
            updated_count += 1
            
            if updated_count % 100 == 0:
                print(f"Updated {updated_count} students...")
                conn.commit()
            
            # Stop after first 5 for testing
            if updated_count >= 5:
                print("Stopping after 5 students for testing...")
                break
                
        except Exception as e:
            print(f"Error updating student {rno}: {e}")
            import traceback
            traceback.print_exc()
            continue
    
    conn.commit()
    conn.close()
    
    print(f"Successfully updated predictions for {updated_count} students!")
    print("Analytics should now work properly.")

if __name__ == "__main__":
    update_student_predictions()