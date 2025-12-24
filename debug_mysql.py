from db import load_students_df, get_student_by_rno
import pandas as pd

print("=== TESTING MYSQL DATA LOADING ===")

# Test 1: Load DataFrame
print("1. Loading students DataFrame...")
df = load_students_df()
print(f"   Shape: {df.shape}")
print(f"   Columns: {list(df.columns)}")

if not df.empty:
    print(f"   First RNO: {df.iloc[0]['RNO'] if 'RNO' in df.columns else 'RNO not found'}")
    print(f"   Sample data:")
    print(df.head(2))
else:
    print("   DataFrame is empty!")

print("\n2. Testing individual student lookup...")
student = get_student_by_rno('23G31A6867')
if student:
    print(f"   Found: {student.get('NAME', 'No name')}")
    print(f"   RNO: {student.get('RNO', 'No RNO')}")
    print(f"   DEPT: {student.get('DEPT', 'No dept')}")
else:
    print("   Student not found!")

print("\n3. Testing analytics function...")
try:
    from app import analyze_subset
    if not df.empty:
        result = analyze_subset(df.head(10))  # Test with first 10 students
        print(f"   Total students processed: {result['stats']['total_students']}")
        print(f"   Avg performance: {result['stats']['avg_performance']}")
        print(f"   High performers: {result['stats']['high_performers']}")
    else:
        print("   Cannot test analytics - no data!")
except Exception as e:
    print(f"   Analytics test failed: {e}")
    import traceback
    traceback.print_exc()