from flask import Flask, jsonify, request, render_template
import pandas as pd
import numpy as np
import joblib
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'edumetric-key')

# Supabase Configuration
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Email config for mentor alerts
EMAIL_CONFIG = {
    'smtp_server': 'smtp.gmail.com',
    'smtp_port': 587,
    'sender_email': os.getenv('EMAIL_SENDER', 'ashokkumarboya93@gmail.com'),
    'sender_password': os.getenv('EMAIL_PASSWORD', 'tyqwgbnhrldauyyu')
}

# Load ML models
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")

performance_model = joblib.load(os.path.join(DATA_DIR, "performance_model.pkl"))
performance_encoder = joblib.load(os.path.join(DATA_DIR, "performance_label_encoder.pkl"))
risk_model = joblib.load(os.path.join(DATA_DIR, "risk_model.pkl"))
risk_encoder = joblib.load(os.path.join(DATA_DIR, "risk_label_encoder.pkl"))
dropout_model = joblib.load(os.path.join(DATA_DIR, "dropout_model.pkl"))
dropout_encoder = joblib.load(os.path.join(DATA_DIR, "dropout_label_encoder.pkl"))

def load_students_df():
    try:
        response = supabase.table('students').select('*').execute()
        df = pd.DataFrame(response.data)
        if not df.empty:
            df.columns = df.columns.str.upper()
            
            # Ensure numeric columns are actually numeric
            numeric_cols = ['PERFORMANCE_OVERALL', 'RISK_SCORE', 'DROPOUT_SCORE', 'ATTENDANCE_PCT', 'INTERNAL_PCT', 'BEHAVIOR_PCT']
            for col in numeric_cols:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
            
            # Ensure YEAR is int
            if 'YEAR' in df.columns:
                df['YEAR'] = pd.to_numeric(df['YEAR'], errors='coerce').fillna(0).astype(int)
                
        return df
    except:
        return pd.DataFrame()

def get_student_by_rno(rno):
    try:
        response = supabase.table('students').select('*').eq('rno', rno).execute()
        if response.data and len(response.data) > 0:
            student = response.data[0]
            # Convert keys to uppercase for consistency
            student = {k.upper(): v for k, v in student.items()}
            return student
        return None
    except Exception as e:
        print(f"Error fetching student: {e}")
        return None

def get_stats():
    try:
        # Get all students from Supabase
        response = supabase.table('students').select('dept, year').execute()
        data = response.data
        
        if not data:
            return {'total_students': 0, 'departments': [], 'years': []}
        
        total_students = len(data)
        
        # Get unique departments (filter out None/null values)
        departments = sorted(list(set(
            str(row.get('dept', '')).strip() 
            for row in data 
            if row.get('dept') and str(row.get('dept')).strip()
        )))
        
        # Get unique years (filter out None/null values)
        years = sorted(list(set(
            int(row.get('year', 0)) 
            for row in data 
            if row.get('year') is not None and row.get('year') != 0
        )))
        
        return {'total_students': total_students, 'departments': departments, 'years': years}
    except Exception as e:
        print(f"Error getting stats: {e}")
        return {'total_students': 0, 'departments': [], 'years': []}

def compute_features(student):
    curr_sem = int(student.get("CURR_SEM", 1) or 1)
    past = []
    for i in range(1, curr_sem):
        v = student.get(f"SEM{i}")
        if v and float(v) > 0:
            past.append(float(v))
    
    past_avg = np.mean(past) if past else 0.0
    past_count = len(past)
    trend = past[-1] - past[-2] if len(past) >= 2 else 0.0
    
    internal_pct = float(student.get("INTERNAL_MARKS", 0) or 0) / 30.0 * 100.0
    behavior_pct = float(student.get("BEHAVIOR_SCORE_10", 0) or 0) * 10.0
    
    total_days = float(student.get("TOTAL_DAYS_CURR", 90) or 90)
    attended_days = float(student.get("ATTENDED_DAYS_CURR", 80) or 80)
    prev_att = float(student.get("PREV_ATTENDANCE_PERC", 85) or 85)
    
    present_att = (attended_days / total_days * 100.0) if total_days > 0 else 0.0
    attendance_pct = present_att * 0.7 + prev_att * 0.2 + behavior_pct * 0.1
    
    performance_overall = past_avg * 0.5 + internal_pct * 0.3 + attendance_pct * 0.15 + behavior_pct * 0.05
    risk_score = abs(100.0 - performance_overall)
    dropout_score = abs(100.0 - (past_avg * 0.1 + internal_pct * 0.1 + attendance_pct * 0.7 + behavior_pct * 0.1))
    
    return {
        "past_avg": round(past_avg, 2),
        "past_count": past_count,
        "internal_pct": round(internal_pct, 2),
        "attendance_pct": round(attendance_pct, 2),
        "behavior_pct": round(behavior_pct, 2),
        "performance_trend": round(trend, 2),
        "performance_overall": round(performance_overall, 2),
        "risk_score": round(risk_score, 2),
        "dropout_score": round(dropout_score, 2)
    }

def predict_student(features):
    try:
        X = np.array([
            features["past_avg"], features["past_count"], features["internal_pct"],
            features["attendance_pct"], features["behavior_pct"], features["performance_trend"]
        ]).reshape(1, -1)
        
        perf_pred = performance_model.predict(X)[0]
        risk_pred = risk_model.predict(X)[0]
        drop_pred = dropout_model.predict(X)[0]
        
        return {
            "performance_label": performance_encoder.inverse_transform([perf_pred])[0],
            "risk_label": risk_encoder.inverse_transform([risk_pred])[0],
            "dropout_label": dropout_encoder.inverse_transform([drop_pred])[0]
        }
    except:
        return {"performance_label": "medium", "risk_label": "medium", "dropout_label": "medium"}

def analyze_data(df):
    if df.empty:
        return {"stats": {"total_students": 0}, "table": [], "scores": {"performance": [], "risk": [], "dropout": []}}
    
    table = []
    perf_labels, risk_labels, drop_labels = [], [], []
    perf_scores, risk_scores, dropout_scores = [], [], []
    
    for i, (_, row) in enumerate(df.iterrows()):
        student = row.to_dict()
        
        # Case-insensitive helper
        def get_val(key, default=None):
            return student.get(key) or student.get(key.upper()) or student.get(key.lower()) or default

        if not get_val('RNO'):
            continue
            
        try:
            p_lbl = get_val('performance_label')
            if p_lbl and p_lbl != 'unknown':
                perf_label = str(p_lbl).lower()
                risk_label = str(get_val('risk_label', 'medium')).lower()
                drop_label = str(get_val('dropout_label', 'medium')).lower()
                perf_score = float(get_val('performance_overall', 0))
                risk_score = float(get_val('risk_score', 50))
                dropout_score = float(get_val('dropout_score', 50))
            else:
                features = compute_features(student)
                predictions = predict_student(features)
                perf_label = predictions["performance_label"]
                risk_label = predictions["risk_label"]
                drop_label = predictions["dropout_label"]
                perf_score = features["performance_overall"]
                risk_score = features["risk_score"]
                dropout_score = features["dropout_score"]
            
            perf_labels.append(perf_label)
            risk_labels.append(risk_label)
            drop_labels.append(drop_label)
            perf_scores.append(float(perf_score))
            risk_scores.append(float(risk_score))
            dropout_scores.append(float(dropout_score))
            
            table.append({
                "RNO": get_val("RNO", ""),
                "NAME": get_val("NAME", ""),
                "DEPT": get_val("DEPT", ""),
                "YEAR": int(get_val("YEAR", 0)),
                "performance_label": perf_label,
                "risk_label": risk_label,
                "dropout_label": drop_label,
                "performance_overall": float(perf_score),
                "attendance_pct": float(get_val("ATTENDANCE_PCT", 0)),
                "risk_score": float(risk_score),
                "dropout_score": float(dropout_score)
            })
        except:
            continue
    
    stats = {
        "total_students": len(table),\
        "high_performers": perf_labels.count("high"),
        "high_risk": risk_labels.count("high"),
        "high_dropout": drop_labels.count("high"),
        "avg_performance": round(np.mean(perf_scores) if perf_scores else 0, 2)
    }
    
    label_counts = {
        "performance": {k: perf_labels.count(k) for k in set(perf_labels)},
        "risk": {k: risk_labels.count(k) for k in set(risk_labels)},
        "dropout": {k: drop_labels.count(k) for k in set(drop_labels)}
    }
    
    scores = {
        "performance": perf_scores,
        "risk": risk_scores,
        "dropout": dropout_scores
    }
    
    return {
        "stats": stats, 
        "label_counts": label_counts, 
        "table": table, 
        "scores": scores
    }


@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/stats")
def api_stats():
    return jsonify(get_stats())

@app.route("/api/student/search", methods=["POST"])
def api_student_search():
    data = request.get_json() or {}
    rno = data.get("rno", "").strip()
    
    if not rno:
        return jsonify({"success": False, "message": "Please provide Register Number"})
    
    student = get_student_by_rno(rno)
    if not student:
        return jsonify({"success": False, "message": "Student not found"})
    
    return jsonify({"success": True, "student": student})

@app.route("/api/student/predict", methods=["POST"])
def api_student_predict():
    student = request.get_json() or {}
    features = compute_features(student)
    predictions = predict_student(features)
    
    return jsonify({
        "success": True,
        "student": student,
        "features": features,
        "predictions": predictions,
        "need_alert": predictions["performance_label"] in ["poor", "medium"]
    })

# CRUD Operations
@app.route("/api/student/create", methods=["POST"])
def api_student_create():
    try:
        data = request.get_json() or {}
        # Basic validation
        if not data.get('RNO') or not data.get('NAME'):
            return jsonify({"success": False, "message": "Register Number and Name are required"})
            
        # Check if student exists
        existing = supabase.table('students').select('rno').eq('rno', data['RNO']).execute()
        if existing.data:
            return jsonify({"success": False, "message": f"Student with RNO {data['RNO']} already exists"})
            
        # Calculate features/predictions for new student
        features = compute_features(data)
        predictions = predict_student(features)
        
        # Prepare record
        record = {k.lower(): v for k, v in data.items()}
        # Add computed fields
        record.update({
            'performance_overall': features['performance_overall'],
            'risk_score': features['risk_score'],
            'dropout_score': features['dropout_score'],
            'performance_label': predictions['performance_label'],
            'risk_label': predictions['risk_label'],
            'dropout_label': predictions['dropout_label']
        })
        
        # Insert
        response = supabase.table('students').insert(record).execute()
        
        if response.data:
            return jsonify({"success": True, "student": data, "message": "Student created successfully"})
        return jsonify({"success": False, "message": "Failed to insert student"})
        
    except Exception as e:
        print(f"Create Error: {e}")
        return jsonify({"success": False, "message": str(e)})

@app.route("/api/student/read", methods=["POST"])
def api_student_read():
    try:
        data = request.get_json() or {}
        rno = data.get('rno', '').strip()
        name = data.get('name', '').strip()
        
        query = supabase.table('students').select('*')
        
        if rno:
            query = query.ilike('rno', f'%{rno}%')
        if name:
            query = query.ilike('name', f'%{name}%')
            
        response = query.limit(50).execute()
        students = []
        
        for s in response.data:
            stu = {k.upper(): v for k, v in s.items()}
            students.append(stu)
            
        return jsonify({"success": True, "students": students, "count": len(students)})
        
    except Exception as e:
        print(f"Read Error: {e}")
        return jsonify({"success": False, "message": str(e)})

@app.route("/api/student/update", methods=["POST"])
def api_student_update():
    try:
        data = request.get_json() or {}
        rno = data.get('RNO')
        
        if not rno:
            return jsonify({"success": False, "message": "Register Number is required"})
            
        # Calculate features/predictions
        features = compute_features(data)
        predictions = predict_student(features)
        
        # Prepare update data
        update_data = {k.lower(): v for k, v in data.items() if k != 'RNO'}
        update_data.update({
            'performance_overall': features['performance_overall'],
            'risk_score': features['risk_score'],
            'dropout_score': features['dropout_score'],
            'performance_label': predictions['performance_label'],
            'risk_label': predictions['risk_label'],
            'dropout_label': predictions['dropout_label']
        })
        
        response = supabase.table('students').update(update_data).eq('rno', rno).execute()
        
        if response.data:
            updated_student = {k.upper(): v for k, v in response.data[0].items()}
            return jsonify({"success": True, "student": updated_student})
            
        return jsonify({"success": False, "message": "Student not found or update failed"})
        
    except Exception as e:
        print(f"Update Error: {e}")
        return jsonify({"success": False, "message": str(e)})

@app.route("/api/student/delete", methods=["POST"])
def api_student_delete():
    try:
        data = request.get_json() or {}
        rno = data.get('rno')
        
        if not rno:
            return jsonify({"success": False, "message": "Register Number is required"})
            
        # Get student details first for return
        student = get_student_by_rno(rno)
        if not student:
             return jsonify({"success": False, "message": "Student not found"})
             
        response = supabase.table('students').delete().eq('rno', rno).execute()
        
        if response.data:
            return jsonify({"success": True, "deleted_student": student})
            
        return jsonify({"success": False, "message": "Delete failed"})
        
    except Exception as e:
        print(f"Delete Error: {e}")
        return jsonify({"success": False, "message": str(e)})

@app.route("/api/analytics/drilldown", methods=["POST"])
def api_analytics_drilldown():
    try:
        data = request.get_json() or {}
        filter_type = data.get("filter_type") # e.g., 'performance_label'
        filter_value = data.get("filter_value") # e.g., 'high'
        scope = data.get("scope") # 'year', 'dept', 'college', 'batch'
        scope_value = data.get("scope_value") # e.g., '1', 'CSE'
        
        # Base query
        query = supabase.table('students').select('*')
        
        # Apply scope filters
        if scope == 'dept' and scope_value:
            query = query.eq('dept', scope_value)
        elif scope == 'year' and scope_value:
            query = query.eq('year', scope_value)
        elif scope == 'batch' and scope_value:
            try:
                # Handle year filtering for batch correctly
                query = query.eq('year', int(scope_value) - 2025) # Approx logic, adjust if batch_year column exists
            except:
                pass
            
        # Apply data filter
        # Map frontend filter types to DB columns
        db_column = filter_type.lower()
        
        # Handle label filters
        if 'label' in db_column:
            query = query.eq(db_column, filter_value.lower())
        
        response = query.limit(100).execute()
        
        students = []
        for s in response.data:
            stu = {k.upper(): v for k, v in s.items()}
            students.append(stu)
            
        return jsonify({
            "success": True, 
            "students": students,
            "filter_info": data
        })
        
    except Exception as e:
        print(f"Drilldown Error: {e}")
        return jsonify({"success": False, "message": str(e)})

@app.route("/api/send-alert", methods=["POST"])
def api_send_alert():
    """Send mentor alert email for at-risk students"""
    try:
        data = request.get_json() or {}
        recipient_email = data.get("email", EMAIL_CONFIG['sender_email'])
        student = data.get("student", {})
        predictions = data.get("predictions", {})
        features = data.get("features", {})
        
        # Create email content
        subject = f"🚨 EduMetric Alert: Student {student.get('NAME', 'Unknown')} Needs Attention"
        
        # HTML email body
        html_body = f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 20px; }}
                .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; }}
                .content {{ padding: 20px; }}
                .metric {{ display: inline-block; margin: 10px; padding: 15px; border-radius: 8px; min-width: 120px; text-align: center; }}
                .high {{ background-color: #ffebee; border: 2px solid #f44336; }}
                .medium {{ background-color: #fff3e0; border: 2px solid #ff9800; }}
                .low {{ background-color: #e8f5e9; border: 2px solid #4caf50; }}
                .label {{ font-weight: bold; font-size: 14px; }}
                .value {{ font-size: 24px; margin-top: 5px; }}
                table {{ border-collapse: collapse; width: 100%; margin: 15px 0; }}
                th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }}
                th {{ background-color: #f5f5f5; }}
                .footer {{ margin-top: 20px; padding: 15px; background-color: #f5f5f5; border-radius: 8px; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>📊 EduMetric - Student Alert</h1>
                <p>Immediate attention required for the following student</p>
            </div>
            
            <div class="content">
                <h2>Student Information</h2>
                <table>
                    <tr><th>Name</th><td><strong>{student.get('NAME', 'N/A')}</strong></td></tr>
                    <tr><th>Register Number</th><td>{student.get('RNO', 'N/A')}</td></tr>
                    <tr><th>Department</th><td>{student.get('DEPT', 'N/A')}</td></tr>
                    <tr><th>Year / Semester</th><td>Year {student.get('YEAR', 'N/A')} / Sem {student.get('CURR_SEM', 'N/A')}</td></tr>
                </table>
                
                <h2>ML Predictions</h2>
                <div>
                    <div class="metric {predictions.get('performance_label', 'medium')}">
                        <div class="label">Performance</div>
                        <div class="value">{predictions.get('performance_label', 'N/A').upper()}</div>
                    </div>
                    <div class="metric {predictions.get('risk_label', 'medium')}">
                        <div class="label">Risk Level</div>
                        <div class="value">{predictions.get('risk_label', 'N/A').upper()}</div>
                    </div>
                    <div class="metric {predictions.get('dropout_label', 'medium')}">
                        <div class="label">Dropout Risk</div>
                        <div class="value">{predictions.get('dropout_label', 'N/A').upper()}</div>
                    </div>
                </div>
                
                <h2>Performance Metrics</h2>
                <table>
                    <tr><th>Overall Performance</th><td>{features.get('performance_overall', 0):.1f}%</td></tr>
                    <tr><th>Attendance</th><td>{features.get('attendance_pct', 0):.1f}%</td></tr>
                    <tr><th>Internal Marks</th><td>{features.get('internal_pct', 0):.1f}%</td></tr>
                    <tr><th>Behavior Score</th><td>{features.get('behavior_pct', 0):.1f}%</td></tr>
                    <tr><th>Risk Score</th><td>{features.get('risk_score', 0):.1f}%</td></tr>
                </table>
                
                <h2>Recommended Actions</h2>
                <ul>
                    <li>Schedule immediate counseling session with the student</li>
                    <li>Contact parent/guardian for collaborative support</li>
                    <li>Provide additional academic resources and tutoring</li>
                    <li>Monitor attendance and engagement closely</li>
                </ul>
            </div>
            
            <div class="footer">
                <p><strong>EduMetric - Intelligent Student Performance Analytics</strong></p>
                <p>This is an automated alert generated by the EduMetric ML system. Please take appropriate action.</p>
            </div>
        </body>
        </html>
        """
        
        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = EMAIL_CONFIG['sender_email']
        msg['To'] = recipient_email
        
        # Attach HTML content
        msg.attach(MIMEText(html_body, 'html'))
        
        # Send email via Gmail SMTP
        with smtplib.SMTP(EMAIL_CONFIG['smtp_server'], EMAIL_CONFIG['smtp_port']) as server:
            server.starttls()
            server.login(EMAIL_CONFIG['sender_email'], EMAIL_CONFIG['sender_password'])
            server.sendmail(EMAIL_CONFIG['sender_email'], recipient_email, msg.as_string())
        
        return jsonify({"success": True, "message": f"Alert sent to {recipient_email}"})
        
    except Exception as e:
        print(f"Email error: {e}")
        return jsonify({"success": False, "message": str(e)})

@app.route("/api/department/analyze", methods=["POST"])
def api_department():
    try:
        data = request.get_json() or {}
        dept = data.get("dept")
        year = data.get("year")
        
        df = load_students_df()
        if df.empty:
            return jsonify({"success": False, "message": "No data available"})
        
        if dept:
            df = df[df["DEPT"].astype(str).str.strip() == str(dept).strip()]
        if year and year != "all":
            df = df[df["YEAR"].fillna(0).astype(int) == int(year)]
        
        if df.empty:
            return jsonify({"success": False, "message": "No students found"})
        
        result = analyze_data(df)
        return jsonify({"success": True, **result})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

@app.route("/api/year/analyze", methods=["POST"])
def api_year():
    try:
        data = request.get_json() or {}
        year = data.get("year")
        
        if not year:
            return jsonify({"success": False, "message": "Year is required"})
        
        df = load_students_df()
        if df.empty:
            return jsonify({"success": False, "message": "No data available"})
        
        df = df[df["YEAR"].fillna(0).astype(int) == int(year)]
        if df.empty:
            return jsonify({"success": False, "message": f"No students found for year {year}"})
        
        result = analyze_data(df)
        return jsonify({"success": True, **result})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

@app.route("/api/college/analyze")
def api_college():
    try:
        df = load_students_df()
        if df.empty:
            return jsonify({"success": False, "message": "No data available"})
        
        if len(df) > 500:
            df = df.sample(500, random_state=42)
        
        result = analyze_data(df)
        result["sample_size"] = len(df)
        return jsonify({"success": True, **result})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

@app.route("/api/analytics/aggregated", methods=["POST"])
def api_aggregated():
    """Provide aggregated analytics data for comparison charts"""
    try:
        data = request.get_json() or {}
        analytics_type = data.get("type", "department")
        
        df = load_students_df()
        if df.empty:
            return jsonify({"success": False, "message": "No data available"})
        
        result = {"success": True, "data": {}}
        
        # Department performance comparison
        dept_perf = df.groupby("DEPT").apply(
            lambda x: x["PERFORMANCE_OVERALL"].mean() if "PERFORMANCE_OVERALL" in x.columns else 0
        ).to_dict()
        result["data"]["dept_performance"] = {k: round(v, 2) if pd.notna(v) else 0 for k, v in dept_perf.items()}
        
        # Risk distribution by department
        risk_dist = {}
        for dept in df["DEPT"].unique():
            if pd.isna(dept):
                continue
            dept_df = df[df["DEPT"] == dept]
            risk_dist[dept] = {
                "low": len(dept_df[dept_df["RISK_LABEL"].str.lower() == "low"]),
                "normal": len(dept_df[dept_df["RISK_LABEL"].str.lower() == "normal"]) + len(dept_df[dept_df["RISK_LABEL"].str.lower() == "medium"]),
                "high": len(dept_df[dept_df["RISK_LABEL"].str.lower() == "high"])
            }
        result["data"]["risk_distribution"] = risk_dist
        
        # Dropout percentage by department
        dropout_pct = {}
        for dept in df["DEPT"].unique():
            if pd.isna(dept):
                continue
            dept_df = df[df["DEPT"] == dept]
            high_dropout = len(dept_df[dept_df["DROPOUT_LABEL"].str.lower() == "high"])
            total = len(dept_df)
            dropout_pct[dept] = round((high_dropout / total * 100) if total > 0 else 0, 2)
        result["data"]["dept_dropout_pct"] = dropout_pct
        
        # Year performance
        year_perf = df.groupby("YEAR").apply(
            lambda x: x["PERFORMANCE_OVERALL"].mean() if "PERFORMANCE_OVERALL" in x.columns else 0
        ).to_dict()
        result["data"]["year_performance"] = {int(k): round(v, 2) if pd.notna(v) else 0 for k, v in year_perf.items() if pd.notna(k)}
        
        # Year attendance
        if "ATTENDANCE_PCT" in df.columns:
            year_att = df.groupby("YEAR")["ATTENDANCE_PCT"].mean().to_dict()
        else:
            year_att = df.groupby("YEAR").apply(lambda x: 85.0).to_dict()
        result["data"]["year_attendance"] = {int(k): round(v, 2) if pd.notna(v) else 0 for k, v in year_att.items() if pd.notna(k)}
        
        # Year risk distribution
        year_risk_dist = {}
        for year in df["YEAR"].dropna().unique():
            year_df = df[df["YEAR"] == year]
            year_risk_dist[int(year)] = {
                "low": len(year_df[year_df["RISK_LABEL"].str.lower() == "low"]),
                "medium": len(year_df[year_df["RISK_LABEL"].str.lower() == "medium"]) + len(year_df[year_df["RISK_LABEL"].str.lower() == "normal"]),
                "high": len(year_df[year_df["RISK_LABEL"].str.lower() == "high"])
            }
        result["data"]["year_risk_distribution"] = year_risk_dist
        
        # Scatter data for detailed plots
        scatter_data = []
        for _, row in df.head(500).iterrows():
            scatter_data.append({
                "DEPT": row.get("DEPT", ""),
                "YEAR": int(row.get("YEAR", 0) or 0),
                "ATTENDANCE_PCT": float(row.get("ATTENDANCE_PCT", 0) or 0),
                "PERFORMANCE_OVERALL": float(row.get("PERFORMANCE_OVERALL", 0) or 0)
            })
        result["data"]["scatter_data"] = scatter_data
        
        # Performance scores list
        if "PERFORMANCE_OVERALL" in df.columns:
            result["data"]["performance_scores"] = df["PERFORMANCE_OVERALL"].dropna().tolist()[:500]
        
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=5000)
    