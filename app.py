import os
import numpy as np
import pandas as pd

from flask import Flask, jsonify, request, render_template, send_file
import joblib
import io
import base64
from db import (
    load_students_df, get_student_by_rno, insert_student, 
    update_student, delete_student, batch_insert_students, get_stats
)
from config import SECRET_KEY, DEBUG, EMAIL_USER, EMAIL_PASSWORD

try:
    from fpdf import FPDF
    FPDF_AVAILABLE = True
except ImportError:
    try:
        from fpdf2 import FPDF
        FPDF_AVAILABLE = True
    except ImportError:
        FPDF_AVAILABLE = False
        print("[WARN] fpdf not available - PDF export disabled")

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Circle
    MATPLOTLIB_AVAILABLE = True
except ImportError:
    matplotlib = None
    plt = None
    MATPLOTLIB_AVAILABLE = False
    print("[WARN] matplotlib not available - PDF charts disabled")

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# ===========================================================
# PATH SETUP
# ===========================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, r"data")

app = Flask(__name__)
app.secret_key = SECRET_KEY
app.config['DEBUG'] = DEBUG

# ===========================================================
# UNIVERSAL FIX: NUMPY/PANDAS → PYTHON TYPES
# ===========================================================
def to_py(obj):
    """Convert numpy/pandas types → pure Python types for JSON."""
    # numpy / pandas integers
    if isinstance(obj, (np.integer, np.int64, np.int32, np.int16)):  # type: ignore
        return int(obj)

    # numpy / pandas floats  → handle NaN / inf safely
    if isinstance(obj, (np.floating, np.float64, np.float32, np.float16)):  # type: ignore
        val = float(obj)
        if np.isnan(val) or np.isinf(val):
            return None
        return val

    # plain Python float (just in case)
    if isinstance(obj, float):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return obj

    # pandas Series → dict
    if isinstance(obj, pd.Series):
        return {k: to_py(v) for k, v in obj.to_dict().items()}

    # pandas DataFrame → list of dicts
    if isinstance(obj, pd.DataFrame):
        return [to_py(r) for _, r in obj.iterrows()]

    # dict / list recursion
    if isinstance(obj, dict):
        return {k: to_py(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [to_py(v) for v in obj]

    return obj

# ===========================================================
# SAFE CSV & MODEL LOADING
# ===========================================================
def safe_read_csv(path):
    if not os.path.exists(path):
        print(f"[WARN] CSV not found: {path}")
        return pd.DataFrame()
    try:
        return pd.read_csv(path)
    except Exception as e:
        print(f"[WARN] Could not read {path}: {e}")
        return pd.DataFrame()

# MySQL is now the SINGLE SOURCE OF TRUTH - No more CSV loading

def safe_load(name):
    path = os.path.join(DATA_DIR, name)
    if not os.path.exists(path):
        print(f"[WARN] Model missing: {path}")
        return None
    try:
        return joblib.load(path)
    except Exception as e:
        print(f"[WARN] Failed to load {path}: {e}")
        return None

performance_model = safe_load("performance_model.pkl")
performance_encoder = safe_load("performance_label_encoder.pkl")
risk_model = safe_load("risk_model.pkl")
risk_encoder = safe_load("risk_label_encoder.pkl")
dropout_model = safe_load("dropout_model.pkl")
dropout_encoder = safe_load("dropout_label_encoder.pkl")

# ===========================================================
# FEATURE ENGINEERING
# ===========================================================
def compute_features(student_row):
    curr_sem = int(student_row.get("CURR_SEM", 1) or 1)

    # past semester marks
    past = []
    for i in range(1, curr_sem):
        key = f"SEM{i}"
        v = student_row.get(key)
        if v not in (None, "", "nan") and not pd.isna(v):
            past.append(float(v))

    past_count = len(past)
    past_avg = float(np.mean(past)) if past_count > 0 else 0.0
    trend = float(past[-1] - past[-2]) if past_count >= 2 else 0.0

    internal_marks = float(student_row.get("INTERNAL_MARKS", 0) or 0)
    internal_pct = internal_marks / 30.0 * 100.0

    behavior_score = float(student_row.get("BEHAVIOR_SCORE_10", 0) or 0)
    behavior_pct = behavior_score * 10.0

    total_days = float(student_row.get("TOTAL_DAYS_CURR", 0) or 0)
    attended_days = float(student_row.get("ATTENDED_DAYS_CURR", 0) or 0)
    prev_att = float(student_row.get("PREV_ATTENDANCE_PERC", 0) or 0)

    present_att = (attended_days / total_days * 100.0) if total_days > 0 else 0.0

    attendance_pct = present_att * 0.70 + prev_att * 0.20 + behavior_pct * 0.10

    performance_overall = (
        past_avg * 0.50
        + internal_pct * 0.30
        + attendance_pct * 0.15
        + behavior_pct * 0.05
    )

    risk_score = abs(100.0 - performance_overall)

    dropout_overall = (
        past_avg * 0.10
        + internal_pct * 0.10
        + attendance_pct * 0.70
        + behavior_pct * 0.10
    )
    dropout_score = abs(100.0 - dropout_overall)

    return {
        "past_avg": round(past_avg, 2),
        "past_count": int(past_count),
        "internal_pct": round(internal_pct, 2),
        "attendance_pct": round(attendance_pct, 2),
        "behavior_pct": round(behavior_pct, 2),
        "performance_trend": round(trend, 2),
        "performance_overall": round(performance_overall, 2),
        "risk_score": round(risk_score, 2),
        "dropout_score": round(dropout_score, 2),
        "present_att": round(present_att, 2),
        "prev_att": round(prev_att, 2),
    }

# ===========================================================
# MODEL PREDICTION
# ===========================================================
def predict_student(f):
    if not all(
        [
            performance_model,
            performance_encoder,
            risk_model,
            risk_encoder,
            dropout_model,
            dropout_encoder,
        ]
    ):
        return {
            "performance_label": "unknown",
            "risk_label": "unknown",
            "dropout_label": "unknown",
        }

    X = np.array(
        [
            f["past_avg"],
            f["past_count"],
            f["internal_pct"],
            f["attendance_pct"],
            f["behavior_pct"],
            f["performance_trend"],
        ]
    ).reshape(1, -1)

    perf_raw = performance_model.predict(X)[0] # type: ignore
    risk_raw = risk_model.predict(X)[0] # type: ignore
    drop_raw = dropout_model.predict(X)[0] # type: ignore

    perf = performance_encoder.inverse_transform([perf_raw])[0] # type: ignore
    risk = risk_encoder.inverse_transform([risk_raw])[0] # type: ignore
    drop = dropout_encoder.inverse_transform([drop_raw])[0] # type: ignore

    return {
        "performance_label": str(perf),
        "risk_label": str(risk),
        "dropout_label": str(drop),
    }

# ===========================================================
# LOAD DS3 FOR ANALYTICS - NOW FROM MYSQL
# ===========================================================
def load_ds3_data():
    """Load student data from MySQL - SINGLE SOURCE OF TRUTH"""
    return load_students_df()

# ===========================================================
# GROUP ANALYSIS
# ===========================================================
def safe_int(v, default=0):
    try:
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return default
        return int(v)
    except Exception:
        return default

def analyze_subset(df):
    if df.empty:
        return {
            "stats": {
                "total_students": 0,
                "high_performers": 0,
                "high_risk": 0,
                "high_dropout": 0,
                "avg_performance": 0.0,
            },
            "label_counts": {"performance": {}, "risk": {}, "dropout": {}},
            "scores": {"performance": [], "risk": [], "dropout": []},
            "table": [],
        }

    table = []
    perf_labels, risk_labels, drop_labels = [], [], []
    perf_scores, risk_scores, drop_scores = [], [], []

    for _, row in df.iterrows():
        try:
            st = row.to_dict()
            
            # Ensure required fields exist
            if not st.get('RNO') or not st.get('NAME'):
                continue
            
            # Check if predictions already exist in MySQL data
            if ('performance_label' in st and 'risk_label' in st and 'dropout_label' in st and
                st.get('performance_label') not in [None, '', 'nan', 'unknown'] and
                st.get('risk_label') not in [None, '', 'nan', 'unknown'] and
                st.get('dropout_label') not in [None, '', 'nan', 'unknown']):
                # Use existing predictions from MySQL
                perf_label = str(st.get('performance_label', 'unknown')).lower()
                risk_label = str(st.get('risk_label', 'unknown')).lower()
                drop_label = str(st.get('dropout_label', 'unknown')).lower()
                perf_score = float(st.get('performance_overall', 0.0) or 0.0)
                risk_score = float(st.get('risk_score', 0.0) or 0.0)
                drop_score = float(st.get('dropout_score', 0.0) or 0.0)
            else:
                # Compute predictions if not available
                try:
                    feats = compute_features(st)
                    preds = predict_student(feats)
                    perf_label = preds["performance_label"]
                    risk_label = preds["risk_label"]
                    drop_label = preds["dropout_label"]
                    perf_score = feats["performance_overall"]
                    risk_score = feats["risk_score"]
                    drop_score = feats["dropout_score"]
                    
                    # Update MySQL with computed predictions
                    try:
                        update_data = feats.copy()
                        update_data.update(preds)
                        from db import update_student
                        update_student(st.get('RNO'), update_data)
                    except Exception as update_err:
                        print(f"[WARN] Failed to update predictions for {st.get('RNO')}: {update_err}")
                        
                except Exception as e:
                    print(f"[WARN] Prediction failed for student {st.get('RNO', 'unknown')}: {e}")
                    perf_label = 'poor'
                    risk_label = 'high'
                    drop_label = 'medium'
                    perf_score = 30.0
                    risk_score = 70.0
                    drop_score = 50.0

            perf_labels.append(perf_label)
            risk_labels.append(risk_label)
            drop_labels.append(drop_label)
            perf_scores.append(float(perf_score))
            risk_scores.append(float(risk_score))
            drop_scores.append(float(drop_score))

            table.append(
                {
                    "RNO": str(st.get("RNO", "")),
                    "NAME": str(st.get("NAME", "")),
                    "DEPT": str(st.get("DEPT", "")),
                    "YEAR": safe_int(st.get("YEAR", 0)),
                    "CURR_SEM": safe_int(st.get("CURR_SEM", 0)),
                    "performance_label": perf_label,
                    "risk_label": risk_label,
                    "dropout_label": drop_label,
                    "performance_overall": float(perf_score),
                    "risk_score": float(risk_score),
                    "dropout_score": float(drop_score),
                }
            )
        except Exception as e:
            print(f"[WARN] Error processing student row: {e}")
            continue

    if not table:
        return {
            "stats": {
                "total_students": 0,
                "high_performers": 0,
                "high_risk": 0,
                "high_dropout": 0,
                "avg_performance": 0.0,
            },
            "label_counts": {"performance": {}, "risk": {}, "dropout": {}},
            "scores": {"performance": [], "risk": [], "dropout": []},
            "table": [],
        }

    stats = {
        "total_students": len(table),
        "high_performers": perf_labels.count("high"),
        "high_risk": risk_labels.count("high"),
        "high_dropout": drop_labels.count("high"),
        "avg_performance": round(float(np.mean(perf_scores)) if perf_scores else 0.0, 2),
    }

    # Create label counts with safe handling
    all_perf_labels = set(perf_labels) if perf_labels else set()
    all_risk_labels = set(risk_labels) if risk_labels else set()
    all_drop_labels = set(drop_labels) if drop_labels else set()

    label_counts = {
        "performance": {k: perf_labels.count(k) for k in all_perf_labels},
        "risk": {k: risk_labels.count(k) for k in all_risk_labels},
        "dropout": {k: drop_labels.count(k) for k in all_drop_labels},
    }

    scores = {
        "performance": perf_scores,
        "risk": risk_scores,
        "dropout": drop_scores,
    }

    return {
        "stats": stats,
        "label_counts": label_counts,
        "scores": scores,
        "table": table,
    }

# ===========================================================
# ROUTES
# ===========================================================
@app.route("/")
def index():
    return render_template("index.html")

# Chat-based assistant disabled for current release
# @app.route("/api/chat", methods=["POST"])
# def api_chat():
#     """NLP Chat Assistant for analytics queries - DISABLED"""
#     return jsonify({"success": False, "message": "Chat assistant is currently disabled"})

@app.route("/api/stats")
def api_stats():
    try:
        stats = get_stats()
        return jsonify(stats)
    except Exception as e:
        print(f"[ERR] Stats API error: {e}")
        return jsonify({"total_students": 0, "departments": [], "years": []}), 500

@app.route("/api/student/search", methods=["POST"])
def api_student_search():
    data = request.get_json(silent=True) or {}
    rno = data.get("rno", "").strip()

    if not rno:
        return jsonify(
            {"success": False, "message": "Please provide Register Number."}
        ), 400

    # Search student in MySQL
    student = get_student_by_rno(rno)
    
    if not student:
        return jsonify({"success": False, "message": "Student not found."}), 200

    # Convert to proper format
    student_data = {
        "NAME": student.get("NAME", ""),
        "RNO": student.get("RNO", ""),
        "EMAIL": student.get("EMAIL", ""),
        "DEPT": student.get("DEPT", ""),
        "YEAR": safe_int(student.get("YEAR", 0)),
        "CURR_SEM": safe_int(student.get("CURR_SEM", 0)),
        "MENTOR": student.get("MENTOR", ""),
        "MENTOR_EMAIL": student.get("MENTOR_EMAIL", ""),
        "SEM1": student.get("SEM1", 0.0) or 0.0,
        "SEM2": student.get("SEM2", 0.0) or 0.0,
        "SEM3": student.get("SEM3", 0.0) or 0.0,
        "SEM4": student.get("SEM4", 0.0) or 0.0,
        "SEM5": student.get("SEM5", 0.0) or 0.0,
        "SEM6": student.get("SEM6", 0.0) or 0.0,
        "SEM7": student.get("SEM7", 0.0) or 0.0,
        "SEM8": student.get("SEM8", 0.0) or 0.0,
        "INTERNAL_MARKS": student.get("INTERNAL_MARKS", 0.0) or 0.0,
        "TOTAL_DAYS_CURR": student.get("TOTAL_DAYS_CURR", 0.0) or 0.0,
        "ATTENDED_DAYS_CURR": student.get("ATTENDED_DAYS_CURR", 0.0) or 0.0,
        "PREV_ATTENDANCE_PERC": student.get("PREV_ATTENDANCE_PERC", 0.0) or 0.0,
        "BEHAVIOR_SCORE_10": student.get("BEHAVIOR_SCORE_10", 0.0) or 0.0
    }
    
    return jsonify({"success": True, "student": to_py(student_data)})


@app.route("/api/student/predict", methods=["POST"])
def api_student_predict():
    student = request.get_json(silent=True) or {}
    feats = compute_features(student)
    preds = predict_student(feats)

    # Check if student needs mentor alert (poor or medium performance)
    need_alert = (preds["performance_label"] in ["poor", "medium"] or 
                 preds["risk_label"] == "high" or 
                 preds["dropout_label"] == "high")

    payload = {
        "success": True,
        "student": student,
        "features": feats,
        "predictions": preds,
        "need_alert": need_alert,
    }
    return jsonify(to_py(payload))

@app.route("/api/department/analyze", methods=["POST"])
def api_dept():
    try:
        data = request.get_json(silent=True) or {}
        dept = data.get("dept", None)
        year = data.get("year", None)

        df = load_students_df().copy()
        
        if df.empty:
            return jsonify({"success": False, "message": "No data available"}), 400
        
        # Filter by department
        if dept and dept != "":
            df = df[df["DEPT"].astype(str).str.strip() == str(dept).strip()]

        # Filter by year
        if year not in (None, "", "all"):
            try:
                year_int = int(year)
                df = df[df["YEAR"].fillna(0).astype(int) == year_int]
            except Exception as e:
                print("[WARN] dept year filter:", e)
                return jsonify({"success": False, "message": "Invalid year filter"}), 400

        if df.empty:
            return jsonify({"success": False, "message": "No students found for the selected criteria"}), 400

        res = analyze_subset(df)
        return jsonify(to_py({"success": True, **res}))
    except Exception as e:
        print(f"[ERR] Department analysis: {e}")
        return jsonify({"success": False, "message": f"Analysis failed: {str(e)}"}), 500

@app.route("/api/year/analyze", methods=["POST"])
def api_year():
    try:
        data = request.get_json(silent=True) or {}
        year = data.get("year", None)
        
        if not year:
            return jsonify({"success": False, "message": "Year is required"}), 400
            
        try:
            year_int = int(year)
        except Exception:
            return jsonify({"success": False, "message": "Invalid year format"}), 400

        df = load_students_df().copy()
        
        if df.empty:
            return jsonify({"success": False, "message": "No data available"}), 400
        
        try:
            df = df[df["YEAR"].fillna(0).astype(int) == year_int]
        except Exception as e:
            print("[WARN] year filter:", e)
            return jsonify({"success": False, "message": "Error filtering by year"}), 500

        if df.empty:
            return jsonify({"success": False, "message": f"No students found for year {year_int}"}), 400

        res = analyze_subset(df)
        return jsonify(to_py({"success": True, **res}))
    except Exception as e:
        print(f"[ERR] Year analysis: {e}")
        return jsonify({"success": False, "message": f"Analysis failed: {str(e)}"}), 500

@app.route("/api/college/analyze")
def api_college():
    try:
        df = load_students_df()
        
        if df.empty:
            return jsonify({"success": False, "message": "No data available"}), 400
        
        # Sample data if too large
        original_size = len(df)
        if len(df) > 500:
            df = df.sample(min(500, len(df)), random_state=42)

        res = analyze_subset(df)
        res["sample_size"] = int(len(df))
        res["total_size"] = int(original_size)
        return jsonify(to_py({"success": True, **res}))
    except Exception as e:
        print(f"[ERR] College analysis: {e}")
        return jsonify({"success": False, "message": f"Analysis failed: {str(e)}"}), 500

@app.route("/api/batch/analyze", methods=["POST"])
def api_batch_analyze():
    """Analyze batch performance data"""
    try:
        data = request.get_json(silent=True) or {}
        batch_year = data.get("batch_year")
        
        if not batch_year:
            return jsonify({"success": False, "message": "Batch year is required"}), 400
        
        df = load_ds3_data().copy()
        if df.empty:
            return jsonify({"success": False, "message": "No data available"}), 400
        
        # Create batch_year column if it doesn't exist
        if 'batch_year' not in df.columns:
            df['batch_year'] = df['YEAR'].apply(lambda x: 2022 + int(x) if pd.notna(x) else 2025)
        
        # Filter by batch_year
        batch_df = df[df["batch_year"].fillna(0).astype(int) == int(batch_year)]
        
        if batch_df.empty:
            return jsonify({"success": False, "message": f"No students found for batch {batch_year}"}), 400
        
        # Calculate KPIs
        total_students = len(batch_df)
        avg_performance = float(batch_df["performance_overall"].fillna(0).mean())
        high_risk_count = len(batch_df[batch_df["risk_score"].fillna(0) > 70])
        high_risk_pct = (high_risk_count / total_students * 100) if total_students > 0 else 0
        avg_dropout = float(batch_df["dropout_score"].fillna(0).mean())
        top_performers = len(batch_df[batch_df["performance_label"] == "high"])
        top_performers_pct = (top_performers / total_students * 100) if total_students > 0 else 0
        
        # Distribution counts
        perf_counts = batch_df["performance_label"].fillna("unknown").value_counts().to_dict()
        risk_counts = batch_df["risk_label"].fillna("unknown").value_counts().to_dict()
        dropout_counts = batch_df["dropout_label"].fillna("unknown").value_counts().to_dict()
        
        # Semester trend data
        sem_cols = [f"SEM{i}" for i in range(1, 9)]
        sem_averages = []
        for sem in sem_cols:
            if sem in batch_df.columns:
                avg_mark = float(batch_df[sem].fillna(0).replace('', 0).astype(float).mean())
                sem_averages.append(avg_mark if avg_mark > 0 else None)
            else:
                sem_averages.append(None)
        
        # Generate insights
        insights = generate_batch_insights(batch_year, total_students, high_risk_pct, avg_performance, top_performers_pct)
        
        return jsonify({
            "success": True,
            "batch_year": batch_year,
            "stats": {
                "total_students": total_students,
                "avg_performance": round(avg_performance, 2),
                "high_risk_pct": round(high_risk_pct, 1),
                "avg_dropout": round(avg_dropout, 2),
                "top_performers_pct": round(top_performers_pct, 1)
            },
            "distributions": {
                "performance": perf_counts,
                "risk": risk_counts,
                "dropout": dropout_counts
            },
            "semester_trend": sem_averages,
            "insights": insights
        })
        
    except Exception as e:
        print(f"[ERR] Batch analysis: {e}")
        return jsonify({"success": False, "message": f"Analysis failed: {str(e)}"}), 500

@app.route("/api/batch/students", methods=["POST"])
def api_batch_students():
    """Get filtered students for batch drill-down"""
    try:
        data = request.get_json(silent=True) or {}
        batch_year = data.get("scope_value")
        filter_type = data.get("filter_type")
        filter_value = data.get("filter_value")
        
        if not all([batch_year, filter_type, filter_value]):
            return jsonify({"success": False, "message": "Missing required parameters"}), 400
        
        df = load_ds3_data().copy()
        if df.empty:
            return jsonify({"success": False, "message": "No data available"}), 400
        
        # Create batch_year column if it doesn't exist
        if 'batch_year' not in df.columns:
            df['batch_year'] = df['YEAR'].apply(lambda x: 2022 + int(x) if pd.notna(x) else 2025)
        
        # Filter by batch_year and category
        filtered_df = df[
            (df["batch_year"].fillna(0).astype(int) == int(batch_year)) &
            (df[filter_type].fillna("unknown") == filter_value)
        ]
        
        # Prepare student list
        students = []
        for _, row in filtered_df.iterrows():
            student = {
                "RNO": str(row.get("RNO", "")),
                "NAME": str(row.get("NAME", "")),
                "DEPT": str(row.get("DEPT", "")),
                "YEAR": safe_int(row.get("YEAR", 0)),
                "batch_year": safe_int(row.get("batch_year", 0)),
                "performance_label": str(row.get("performance_label", "unknown")),
                "risk_label": str(row.get("risk_label", "unknown")),
                "dropout_label": str(row.get("dropout_label", "unknown"))
            }
            students.append(student)
        
        return jsonify({
            "success": True,
            "students": to_py(students),
            "count": len(students),
            "filter_info": {
                "batch_year": batch_year,
                "category": filter_type,
                "value": filter_value
            }
        })
        
    except Exception as e:
        print(f"[ERR] Batch students: {e}")
        return jsonify({"success": False, "message": f"Failed to get students: {str(e)}"}), 500

def generate_batch_insights(batch_year, total, high_risk_pct, avg_perf, top_perf_pct):
    """Generate batch insights and recommendations"""
    insights = []
    
    if high_risk_pct > 30:
        insights.append(f"⚠️ Critical: {high_risk_pct:.1f}% of students are high-risk. Immediate intervention required.")
    elif high_risk_pct > 15:
        insights.append(f"⚠️ Warning: {high_risk_pct:.1f}% of students are high-risk. Enhanced monitoring recommended.")
    else:
        insights.append(f"✅ Good: Only {high_risk_pct:.1f}% of students are high-risk.")
    
    if avg_perf < 60:
        insights.append(f"📉 Batch {batch_year} shows below-average performance ({avg_perf:.1f}%). Academic support needed.")
    elif avg_perf > 80:
        insights.append(f"📈 Excellent: Batch {batch_year} shows strong performance ({avg_perf:.1f}%).")
    
    if top_perf_pct < 20:
        insights.append(f"🎯 Focus needed: Only {top_perf_pct:.1f}% are top performers. Consider advanced programs.")
    
    # Recommendations
    recommendations = []
    if high_risk_pct > 20:
        recommendations.append("📋 Schedule immediate counseling sessions for high-risk students")
        recommendations.append("👥 Implement peer mentoring programs")
    
    if avg_perf < 70:
        recommendations.append("📚 Provide additional academic resources and tutoring")
        recommendations.append("🔄 Review curriculum delivery methods")
    
    return {
        "summary": f"Batch {batch_year} analysis: {total} students with {avg_perf:.1f}% average performance.",
        "insights": insights,
        "recommendations": recommendations
    }

@app.route("/api/send-alert", methods=["POST"])
def api_send_alert():
    data = request.get_json(silent=True) or {}
    to_email = data.get("email", "ashokkumarboya999@gmail.com")  # Default mentor email
    
    # Extract student data for HTML email
    student_data = data.get("student", {})
    predictions = data.get("predictions", {})
    features = data.get("features", {})
    
    # Generate reason for alert based on predictions
    reasons = []
    if predictions.get("performance_label") == "poor":
        reasons.append("Poor academic performance detected")
    elif predictions.get("performance_label") == "medium":
        reasons.append("Below-average academic performance")
    
    if predictions.get("risk_label") == "high":
        reasons.append("High academic risk identified")
    
    if predictions.get("dropout_label") == "high":
        reasons.append("High dropout probability detected")
    
    if features.get("attendance_pct", 100) < 75:
        reasons.append("Low attendance rate")
    
    if features.get("internal_pct", 100) < 60:
        reasons.append("Poor internal assessment performance")
    
    alert_reason = "; ".join(reasons) if reasons else "Academic performance requires attention"
    
    # Create HTML email content
    subject = "Student Performance Alert – EduMetric"
    
    html_body = f"""
<div style="font-family: Arial, sans-serif; background: #f4f6fb; padding: 20px;">
  <div style="max-width: 600px; margin: auto; background: white; border-radius: 10px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <h2 style="color: #6a11cb; margin-bottom: 20px;">🚨 EduMetric – Student Alert</h2>
    
    <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-bottom: 20px;">
      <p style="margin: 0; font-weight: bold; color: #856404;">Immediate Mentor Attention Required</p>
    </div>
    
    <h3 style="color: #495057; border-bottom: 2px solid #e9ecef; padding-bottom: 10px;">Student Details</h3>
    <table style="width: 100%; margin-bottom: 20px;">
      <tr><td style="padding: 5px 0; font-weight: bold;">Name:</td><td style="padding: 5px 0;">{student_data.get('NAME', 'N/A')}</td></tr>
      <tr><td style="padding: 5px 0; font-weight: bold;">Register Number:</td><td style="padding: 5px 0;">{student_data.get('RNO', 'N/A')}</td></tr>
      <tr><td style="padding: 5px 0; font-weight: bold;">Department:</td><td style="padding: 5px 0;">{student_data.get('DEPT', 'N/A')}</td></tr>
      <tr><td style="padding: 5px 0; font-weight: bold;">Year:</td><td style="padding: 5px 0;">{student_data.get('YEAR', 'N/A')}</td></tr>
      <tr><td style="padding: 5px 0; font-weight: bold;">Batch Year:</td><td style="padding: 5px 0;">{student_data.get('batch_year', 'N/A')}</td></tr>
    </table>
    
    <h3 style="color: #495057; border-bottom: 2px solid #e9ecef; padding-bottom: 10px;">Academic Summary</h3>
    <table style="width: 100%; margin-bottom: 20px;">
      <tr><td style="padding: 5px 0; font-weight: bold;">Performance Level:</td><td style="padding: 5px 0; color: #dc3545; font-weight: bold;">{predictions.get('performance_label', 'unknown').upper()}</td></tr>
      <tr><td style="padding: 5px 0; font-weight: bold;">Risk Level:</td><td style="padding: 5px 0; color: #fd7e14; font-weight: bold;">{predictions.get('risk_label', 'unknown').upper()}</td></tr>
      <tr><td style="padding: 5px 0; font-weight: bold;">Dropout Probability:</td><td style="padding: 5px 0; color: #dc3545; font-weight: bold;">{predictions.get('dropout_label', 'unknown').upper()}</td></tr>
      <tr><td style="padding: 5px 0; font-weight: bold;">Attendance:</td><td style="padding: 5px 0;">{features.get('attendance_pct', 0):.1f}%</td></tr>
      <tr><td style="padding: 5px 0; font-weight: bold;">Internal Marks:</td><td style="padding: 5px 0;">{features.get('internal_pct', 0):.1f}%</td></tr>
    </table>
    
    <div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin-bottom: 20px;">
      <p style="margin: 0; font-weight: bold; color: #721c24;">Reason for Alert:</p>
      <p style="margin: 5px 0 0 0; color: #721c24;">{alert_reason}</p>
    </div>
    
    <div style="background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin-bottom: 20px;">
      <p style="margin: 0; font-weight: bold; color: #0c5460;">Suggested Action:</p>
      <p style="margin: 5px 0 0 0; color: #0c5460;">Please review the student's academic progress and consider appropriate mentoring or intervention.</p>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e9ecef; margin: 20px 0;">
    
    <p style="color: #6c757d; font-size: 14px; margin: 0;">Regards,<br><strong>EduMetric Analytics System</strong><br><em>(Automated Notification – Do Not Reply)</em></p>
  </div>
</div>
"""

    FROM = EMAIL_USER
    PASS = EMAIL_PASSWORD

    # Use MIMEText with "html" for proper HTML email rendering
    msg = MIMEText(html_body, "html")
    msg["From"] = FROM
    msg["To"] = to_email
    msg["Subject"] = subject

    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(FROM, PASS)
        server.send_message(msg)
        server.quit()
        return jsonify({"success": True, "message": "Alert sent successfully"})
    except Exception as e:
        print("[ERR] send alert:", e)
        return jsonify({"success": False, "message": str(e)}), 500

# ===========================================================
# DS3 NORMALIZATION FUNCTIONS
# ===========================================================
def clean_data(df):
    """Clean and normalize raw dataset"""
    df_clean = df.copy()
    
    # Handle different column name variations
    column_mapping = {
        'reg_number': 'RNO',
        'student_id': 'STUDENT_ID', 
        'name': 'NAME',
        'email': 'EMAIL',
        'department': 'DEPT',
        'year': 'YEAR',
        'semester': 'CURR_SEM',
        'mentor_name': 'MENTOR',
        'mentor_email': 'MENTOR_EMAIL',
        'sem1': 'SEM1', 'sem2': 'SEM2', 'sem3': 'SEM3', 'sem4': 'SEM4',
        'sem5': 'SEM5', 'sem6': 'SEM6', 'sem7': 'SEM7', 'sem8': 'SEM8',
        'age': 'AGE',
        'total_marks': 'TOTAL_MARKS',
        'attendance': 'ATTENDANCE',
        'cgpa': 'CGPA',
        'backlog_count': 'BACKLOG_COUNT'
    }
    
    # Rename columns to standard format
    for old_name, new_name in column_mapping.items():
        if old_name in df_clean.columns:
            df_clean.rename(columns={old_name: new_name}, inplace=True)
    
    # Replace empty strings and NaN with appropriate defaults
    numeric_cols = ['SEM1', 'SEM2', 'SEM3', 'SEM4', 'SEM5', 'SEM6', 'SEM7', 'SEM8', 
                   'INTERNAL_MARKS', 'TOTAL_DAYS_CURR', 'ATTENDED_DAYS_CURR', 
                   'PREV_ATTENDANCE_PERC', 'BEHAVIOR_SCORE_10', 'YEAR', 'CURR_SEM',
                   'AGE', 'TOTAL_MARKS', 'ATTENDANCE', 'CGPA', 'BACKLOG_COUNT', 'STUDENT_ID']
    
    for col in numeric_cols:
        if col in df_clean.columns:
            df_clean[col] = pd.to_numeric(df_clean[col], errors='coerce').fillna(0)
    
    # Fill string columns
    string_cols = ['NAME', 'RNO', 'EMAIL', 'DEPT', 'MENTOR', 'MENTOR_EMAIL']
    for col in string_cols:
        if col in df_clean.columns:
            df_clean[col] = df_clean[col].fillna('')
    
    # Add missing columns with default values if not present
    required_cols = {
        'INTERNAL_MARKS': 20.0,
        'TOTAL_DAYS_CURR': 90.0,
        'ATTENDED_DAYS_CURR': 80.0,
        'PREV_ATTENDANCE_PERC': 85.0,
        'BEHAVIOR_SCORE_10': 7.0,
        'AGE': 20.0
    }
    
    for col, default_val in required_cols.items():
        if col not in df_clean.columns:
            df_clean[col] = default_val
    
    return df_clean

def create_ds3_dataset(df_raw):
    """Create DS3 analytics-ready dataset from raw data"""
    ds3_rows = []
    
    for _, row in df_raw.iterrows():
        st = row.to_dict()
        feats = compute_features(st)
        preds = predict_student(feats)
        
        # Merge raw data + features + predictions
        ds3_row = st.copy()
        ds3_row.update(feats)
        ds3_row.update(preds)
        
        ds3_rows.append(ds3_row)
    
    return pd.DataFrame(ds3_rows)

@app.route("/api/analytics/preview", methods=["GET"])
def api_analytics_preview():
    """Preview analytics data from DS3"""
    data_source = load_ds3_data()
    if data_source.empty:
        return jsonify({"success": False, "message": "No analytics data available"})
    
    # Get basic stats
    total_students = len(data_source)
    
    # Count high risk and high dropout students
    high_risk = 0
    high_dropout = 0
    
    if 'risk_label' in data_source.columns:
        high_risk = len(data_source[data_source['risk_label'] == 'high'])
    if 'dropout_label' in data_source.columns:
        high_dropout = len(data_source[data_source['dropout_label'] == 'high'])
    
    # Get sample students for preview
    sample_students = []
    for _, row in data_source.head(100).iterrows():
        student = {
            'RNO': row.get('RNO', ''),
            'NAME': row.get('NAME', ''),
            'DEPT': row.get('DEPT', ''),
            'YEAR': safe_int(row.get('YEAR', 0)),
            'performance_label': row.get('performance_label', 'unknown'),
            'risk_label': row.get('risk_label', 'unknown'),
            'dropout_label': row.get('dropout_label', 'unknown')
        }
        sample_students.append(student)
    
    return jsonify({
        "success": True,
        "stats": {
            "total_students": total_students,
            "high_risk": high_risk,
            "high_dropout": high_dropout
        },
        "students": sample_students
    })

@app.route("/api/batch-upload", methods=["POST"])
def api_batch_upload():
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file uploaded"}), 400
    
    file = request.files["file"]
    mode = request.form.get("mode", "normalize")
    
    if file.filename == "":
        return jsonify({"success": False, "message": "Empty filename"}), 400
    
    if not file.filename.endswith((".csv", ".xlsx")):
        return jsonify({"success": False, "message": "Invalid file type. Only CSV/XLSX allowed"}), 400
    
    try:
        # Read uploaded file temporarily
        if file.filename.endswith(".csv"):
            df_uploaded = pd.read_csv(file)
        else:
            df_uploaded = pd.read_excel(file)
        
        if df_uploaded.empty:
            return jsonify({"success": False, "message": "Empty file"}), 400
        
        processed_rows = len(df_uploaded)
        
        if mode == "normalize":
            # Clean and normalize data
            df_clean = clean_data(df_uploaded)
            
            # Compute features and predictions for each student
            enhanced_students = []
            for _, row in df_clean.iterrows():
                student_dict = row.to_dict()
                feats = compute_features(student_dict)
                preds = predict_student(feats)
                
                # Merge all data
                full_record = student_dict.copy()
                full_record.update(feats)
                full_record.update(preds)
                enhanced_students.append(full_record)
            
            # Convert to DataFrame and insert into MySQL
            df_enhanced = pd.DataFrame(enhanced_students)
            success = batch_insert_students(df_enhanced)
            
            if success:
                return jsonify({
                    "success": True,
                    "mode": "normalize",
                    "processed_rows": processed_rows,
                    "message": "Data normalized, predictions generated, and saved to MySQL successfully"
                })
            else:
                return jsonify({"success": False, "message": "Failed to save data to MySQL"}), 500
                
        else:
            # Analytics mode - data already has predictions
            success = batch_insert_students(df_uploaded)
            
            if success:
                return jsonify({
                    "success": True,
                    "mode": "analytics",
                    "processed_rows": processed_rows,
                    "message": "Analytics data saved to MySQL successfully"
                })
            else:
                return jsonify({"success": False, "message": "Failed to save data to MySQL"}), 500
        
    except Exception as e:
        print(f"[ERR] batch upload: {e}")
        return jsonify({"success": False, "message": f"Upload failed: {str(e)}"}), 500

def send_dropout_alerts(high_dropout_students):
    """Send email alerts for high dropout risk students"""
    alerts_sent = 0
    
    for student in high_dropout_students:
        try:
            FROM = "ashokkumarboya93@gmail.com"
            PASS = "lubwbacntoubetxb"
            
            msg = MIMEMultipart()
            msg["From"] = FROM
            msg["To"] = student["email"]
            msg["Subject"] = f"Alert: High Dropout Risk - {student['name']}"
            body = f"""Dear Mentor,

This is an automated alert regarding student {student['name']} (RNO: {student['rno']}).

The student has been identified as HIGH DROPOUT RISK with a dropout score of {student['dropout_score']}.

Please take immediate action to counsel and support the student.

Best regards,
Student Analytics System"""
            msg.attach(MIMEText(body, "plain"))
            
            server = smtplib.SMTP("smtp.gmail.com", 587)
            server.starttls()
            server.login(FROM, PASS)
            server.send_message(msg)
            server.quit()
            alerts_sent += 1
        except Exception as e:
            print(f"[WARN] Email failed for {student['email']}: {e}")
    
    return alerts_sent

# ===========================================================
# CRUD API ENDPOINTS - MYSQL FIRST
# ===========================================================

@app.route("/api/student/create", methods=["POST"])
def api_create_student():
    """Create a new student record in MySQL"""
    try:
        data = request.get_json(silent=True) or {}
        
        # Validate required fields
        required_fields = ['NAME', 'RNO', 'EMAIL', 'DEPT', 'YEAR', 'CURR_SEM']
        for field in required_fields:
            if not data.get(field):
                return jsonify({"success": False, "message": f"{field} is required"}), 400
        
        # Check if student already exists
        existing = get_student_by_rno(data.get("RNO"))
        if existing:
            return jsonify({"success": False, "message": "Student with this RNO already exists"}), 400
        
        # Create student record with defaults
        student_data = {
            'NAME': str(data.get('NAME', '')).strip(),
            'RNO': str(data.get('RNO', '')).strip(),
            'EMAIL': str(data.get('EMAIL', '')).strip(),
            'DEPT': str(data.get('DEPT', '')).strip(),
            'YEAR': safe_int(data.get('YEAR', 1)),
            'CURR_SEM': safe_int(data.get('CURR_SEM', 1)),
            'MENTOR': str(data.get('MENTOR', '')).strip(),
            'MENTOR_EMAIL': str(data.get('MENTOR_EMAIL', '')).strip(),
            'SEM1': float(data.get('SEM1', 0) or 0),
            'SEM2': float(data.get('SEM2', 0) or 0),
            'SEM3': float(data.get('SEM3', 0) or 0),
            'SEM4': float(data.get('SEM4', 0) or 0),
            'SEM5': float(data.get('SEM5', 0) or 0),
            'SEM6': float(data.get('SEM6', 0) or 0),
            'SEM7': float(data.get('SEM7', 0) or 0),
            'SEM8': float(data.get('SEM8', 0) or 0),
            'INTERNAL_MARKS': float(data.get('INTERNAL_MARKS', 20) or 20),
            'TOTAL_DAYS_CURR': float(data.get('TOTAL_DAYS_CURR', 90) or 90),
            'ATTENDED_DAYS_CURR': float(data.get('ATTENDED_DAYS_CURR', 80) or 80),
            'PREV_ATTENDANCE_PERC': float(data.get('PREV_ATTENDANCE_PERC', 85) or 85),
            'BEHAVIOR_SCORE_10': float(data.get('BEHAVIOR_SCORE_10', 7) or 7)
        }
        
        # Compute features and predictions
        feats = compute_features(student_data)
        preds = predict_student(feats)
        
        # Merge all data
        full_record = student_data.copy()
        full_record.update(feats)
        full_record.update(preds)
        
        # Insert into MySQL
        success = insert_student(full_record)
        
        if success:
            return jsonify({
                "success": True,
                "message": "Student created successfully",
                "student": to_py(full_record)
            })
        else:
            return jsonify({"success": False, "message": "Failed to create student"}), 500
        
    except Exception as e:
        print(f"[ERR] Create student: {e}")
        return jsonify({"success": False, "message": f"Failed to create student: {str(e)}"}), 500

@app.route("/api/student/read", methods=["POST"])
def api_read_student():
    """Read/search student records from MySQL"""
    try:
        data = request.get_json(silent=True) or {}
        rno = data.get("rno", "").strip()
        name = data.get("name", "").strip()
        
        if not rno and not name:
            return jsonify({"success": False, "message": "Please provide RNO or Name to search"}), 400
        
        # Load all students from MySQL
        df = load_students_df()
        if df.empty:
            return jsonify({"success": False, "message": "No student data available"}), 400
        
        # Search by RNO or Name
        if rno:
            results = df[df["RNO"].astype(str).str.strip().str.contains(rno, case=False, na=False)]
        else:
            results = df[df["NAME"].astype(str).str.strip().str.contains(name, case=False, na=False)]
        
        if results.empty:
            return jsonify({"success": False, "message": "No students found matching the search criteria"})
        
        # Convert to list of dictionaries
        students = []
        for _, row in results.iterrows():
            student = {
                'RNO': str(row.get('RNO', '')),
                'NAME': str(row.get('NAME', '')),
                'EMAIL': str(row.get('EMAIL', '')),
                'DEPT': str(row.get('DEPT', '')),
                'YEAR': safe_int(row.get('YEAR', 0)),
                'CURR_SEM': safe_int(row.get('CURR_SEM', 0)),
                'performance_label': str(row.get('performance_label', 'unknown')),
                'risk_label': str(row.get('risk_label', 'unknown')),
                'dropout_label': str(row.get('dropout_label', 'unknown')),
                'performance_overall': float(row.get('performance_overall', 0) or 0),
                'risk_score': float(row.get('risk_score', 0) or 0),
                'dropout_score': float(row.get('dropout_score', 0) or 0)
            }
            students.append(student)
        
        return jsonify({
            "success": True,
            "students": to_py(students),
            "count": len(students)
        })
        
    except Exception as e:
        print(f"[ERR] Read student: {e}")
        return jsonify({"success": False, "message": f"Search failed: {str(e)}"}), 500

@app.route("/api/student/update", methods=["POST"])
def api_update_student():
    """Update existing student record in MySQL"""
    try:
        data = request.get_json(silent=True) or {}
        rno = data.get("RNO", "").strip()
        
        if not rno:
            return jsonify({"success": False, "message": "RNO is required for update"}), 400
        
        # Check if student exists
        existing = get_student_by_rno(rno)
        if not existing:
            return jsonify({"success": False, "message": "Student not found"}), 404
        
        # Update student data
        updated_data = {
            'NAME': str(data.get('NAME', existing.get('NAME', ''))).strip(),
            'EMAIL': str(data.get('EMAIL', existing.get('EMAIL', ''))).strip(),
            'DEPT': str(data.get('DEPT', existing.get('DEPT', ''))).strip(),
            'YEAR': safe_int(data.get('YEAR', existing.get('YEAR', 0))),
            'CURR_SEM': safe_int(data.get('CURR_SEM', existing.get('CURR_SEM', 0))),
            'MENTOR': str(data.get('MENTOR', existing.get('MENTOR', ''))).strip(),
            'MENTOR_EMAIL': str(data.get('MENTOR_EMAIL', existing.get('MENTOR_EMAIL', ''))).strip(),
            'SEM1': float(data.get('SEM1', existing.get('SEM1', 0)) or 0),
            'SEM2': float(data.get('SEM2', existing.get('SEM2', 0)) or 0),
            'SEM3': float(data.get('SEM3', existing.get('SEM3', 0)) or 0),
            'SEM4': float(data.get('SEM4', existing.get('SEM4', 0)) or 0),
            'SEM5': float(data.get('SEM5', existing.get('SEM5', 0)) or 0),
            'SEM6': float(data.get('SEM6', existing.get('SEM6', 0)) or 0),
            'SEM7': float(data.get('SEM7', existing.get('SEM7', 0)) or 0),
            'SEM8': float(data.get('SEM8', existing.get('SEM8', 0)) or 0),
            'INTERNAL_MARKS': float(data.get('INTERNAL_MARKS', existing.get('INTERNAL_MARKS', 20)) or 20),
            'TOTAL_DAYS_CURR': float(data.get('TOTAL_DAYS_CURR', existing.get('TOTAL_DAYS_CURR', 90)) or 90),
            'ATTENDED_DAYS_CURR': float(data.get('ATTENDED_DAYS_CURR', existing.get('ATTENDED_DAYS_CURR', 80)) or 80),
            'PREV_ATTENDANCE_PERC': float(data.get('PREV_ATTENDANCE_PERC', existing.get('PREV_ATTENDANCE_PERC', 85)) or 85),
            'BEHAVIOR_SCORE_10': float(data.get('BEHAVIOR_SCORE_10', existing.get('BEHAVIOR_SCORE_10', 7)) or 7)
        }
        
        # Recompute features and predictions
        feats = compute_features(updated_data)
        preds = predict_student(feats)
        
        # Merge all updates
        full_update = updated_data.copy()
        full_update.update(feats)
        full_update.update(preds)
        
        # Update in MySQL
        success = update_student(rno, full_update)
        
        if success:
            full_record = full_update.copy()
            full_record['RNO'] = rno
            return jsonify({
                "success": True,
                "message": "Student updated successfully",
                "student": to_py(full_record)
            })
        else:
            return jsonify({"success": False, "message": "Failed to update student"}), 500
        
    except Exception as e:
        print(f"[ERR] Update student: {e}")
        return jsonify({"success": False, "message": f"Failed to update student: {str(e)}"}), 500

@app.route("/api/student/delete", methods=["POST"])
def api_delete_student():
    """Delete student record from MySQL"""
    try:
        data = request.get_json(silent=True) or {}
        rno = data.get("rno", "").strip()
        
        if not rno:
            return jsonify({"success": False, "message": "RNO is required for deletion"}), 400
        
        # Get student info before deletion
        student = get_student_by_rno(rno)
        if not student:
            return jsonify({"success": False, "message": "Student not found"}), 404
        
        # Delete from MySQL
        success = delete_student(rno)
        
        if success:
            return jsonify({
                "success": True,
                "message": f"Student {student.get('NAME', '')} ({rno}) deleted successfully",
                "deleted_student": {
                    "RNO": rno,
                    "NAME": str(student.get('NAME', '')),
                    "DEPT": str(student.get('DEPT', '')),
                    "YEAR": safe_int(student.get('YEAR', 0))
                }
            })
        else:
            return jsonify({"success": False, "message": "Failed to delete student"}), 500
        
    except Exception as e:
        print(f"[ERR] Delete student: {e}")
        return jsonify({"success": False, "message": f"Failed to delete student: {str(e)}"}), 500

@app.route("/api/students/list", methods=["GET"])
def api_list_students():
    """List all students with pagination from MySQL"""
    try:
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 50))
        dept_filter = request.args.get('dept', '')
        year_filter = request.args.get('year', '')
        
        # Load from MySQL
        df = load_students_df()
        if df.empty:
            return jsonify({"success": False, "message": "No student data available"})
        
        # Apply filters
        filtered_data = df.copy()
        if dept_filter:
            filtered_data = filtered_data[filtered_data["DEPT"].astype(str).str.strip() == dept_filter]
        if year_filter:
            filtered_data = filtered_data[filtered_data["YEAR"].astype(int) == int(year_filter)]
        
        total_students = len(filtered_data)
        
        # Pagination
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_data = filtered_data.iloc[start_idx:end_idx]
        
        # Convert to list
        students = []
        for _, row in paginated_data.iterrows():
            student = {
                'RNO': str(row.get('RNO', '')),
                'NAME': str(row.get('NAME', '')),
                'EMAIL': str(row.get('EMAIL', '')),
                'DEPT': str(row.get('DEPT', '')),
                'YEAR': safe_int(row.get('YEAR', 0)),
                'CURR_SEM': safe_int(row.get('CURR_SEM', 0)),
                'performance_label': str(row.get('performance_label', 'unknown')),
                'risk_label': str(row.get('risk_label', 'unknown')),
                'dropout_label': str(row.get('dropout_label', 'unknown'))
            }
            students.append(student)
        
        return jsonify({
            "success": True,
            "students": to_py(students),
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": total_students,
                "pages": (total_students + per_page - 1) // per_page
            }
        })
        
    except Exception as e:
        print(f"[ERR] List students: {e}")
        return jsonify({"success": False, "message": f"Failed to list students: {str(e)}"}), 500

@app.route("/api/batch-analytics", methods=["POST"])
def api_batch_analytics():
    data = request.get_json(silent=True) or {}
    batch_year = data.get("batch_year", "2025")
    
    try:
        ds2_path = os.path.join(DATA_DIR, "DS2_ml_ready.csv")
        if not os.path.exists(ds2_path):
            return jsonify({"success": False, "message": "No analytics data available"}), 400
        
        df = pd.read_csv(ds2_path)
        df['batch_year'] = df['YEAR'].apply(lambda x: 2022 + int(x) if pd.notna(x) else 2025)
        batch_df = df[df['batch_year'] == int(batch_year)]
        
        if batch_df.empty:
            return jsonify({"success": False, "message": f"No data found for batch {batch_year}"}), 400
        
        total_students = len(batch_df)
        avg_performance = batch_df['performance_overall'].mean()
        high_risk_count = len(batch_df[batch_df['risk_score'] > 70])
        high_risk_pct = (high_risk_count / total_students) * 100
        dropout_avg = batch_df['dropout_score'].mean()
        top_performers = len(batch_df[batch_df['performance_label'] == 'high'])
        top_performers_pct = (top_performers / total_students) * 100
        
        perf_dist = batch_df['performance_label'].value_counts().to_dict()
        risk_dist = batch_df['risk_label'].value_counts().to_dict()
        dropout_dist = batch_df['dropout_label'].value_counts().to_dict()
        
        sem_cols = ['SEM1', 'SEM2', 'SEM3', 'SEM4', 'SEM5', 'SEM6', 'SEM7', 'SEM8']
        sem_trends = []
        for sem in sem_cols:
            if sem in batch_df.columns:
                avg_marks = batch_df[sem].dropna().mean()
                sem_trends.append(avg_marks if not pd.isna(avg_marks) else 0)
            else:
                sem_trends.append(0)
        
        declining_students = 0
        for _, row in batch_df.iterrows():
            sem_marks = [row.get(f'SEM{i}', 0) for i in range(1, 9) if pd.notna(row.get(f'SEM{i}', 0)) and row.get(f'SEM{i}', 0) > 0]
            if len(sem_marks) >= 2 and sem_marks[-1] < sem_marks[0]:
                declining_students += 1
        
        declining_pct = (declining_students / total_students) * 100
        silent_risk = len(batch_df[(batch_df['performance_label'] == 'medium') & (batch_df['dropout_label'] == 'high')])
        low_att_high_risk = len(batch_df[(batch_df['attendance_pct'] < 75) & (batch_df['risk_label'] == 'high')])
        
        return jsonify({
            "success": True,
            "batch_year": batch_year,
            "kpis": {
                "total_students": total_students,
                "avg_performance": round(avg_performance, 1),
                "high_risk_pct": round(high_risk_pct, 1),
                "dropout_avg": round(dropout_avg, 1),
                "top_performers_pct": round(top_performers_pct, 1)
            },
            "distributions": {
                "performance": perf_dist,
                "risk": risk_dist,
                "dropout": dropout_dist
            },
            "trends": {
                "semesters": ['SEM1', 'SEM2', 'SEM3', 'SEM4', 'SEM5', 'SEM6', 'SEM7', 'SEM8'],
                "marks": sem_trends
            },
            "deep_analytics": {
                "declining_pct": round(declining_pct, 1),
                "silent_risk": silent_risk,
                "attendance_risk_correlation": low_att_high_risk
            }
        })
        
    except Exception as e:
        print(f"[ERR] batch analytics: {e}")
        return jsonify({"success": False, "message": f"Analysis failed: {str(e)}"}), 500

@app.route("/api/analytics/drilldown", methods=["POST"])
def api_analytics_drilldown():
    """Universal drill-down API for all analytics views"""
    try:
        data = request.get_json(silent=True) or {}
        filter_type = data.get("filter_type")
        filter_value = data.get("filter_value")
        scope = data.get("scope", "all")
        scope_value = data.get("scope_value")
        
        # Use DS3 as primary data source
        df = load_ds3_data()
        if df.empty:
            return jsonify({"success": False, "message": "No data available"}), 400
        
        # Apply scope filter first
        if scope != "all" and scope_value:
            if scope == "student":
                df = df[df["RNO"].astype(str).str.strip() == str(scope_value)]
            elif scope == "dept":
                df = df[df["DEPT"].astype(str).str.strip() == str(scope_value)]
            elif scope == "year":
                df = df[df["YEAR"].fillna(0).astype(int) == int(scope_value)]
            elif scope == "batch":
                if 'batch_year' not in df.columns:
                    df['batch_year'] = df['YEAR'].apply(lambda x: 2022 + int(x) if pd.notna(x) else 2025)
                df = df[df["batch_year"].fillna(0).astype(int) == int(scope_value)]
            elif scope == "college":
                # No additional filter for college-wide
                pass
        
        # Apply category filter
        if filter_type and filter_value and filter_type in df.columns:
            df = df[df[filter_type].fillna("unknown") == filter_value]
        
        # Prepare student list with required columns only
        students = []
        for _, row in df.iterrows():
            student = {
                "RNO": str(row.get("RNO", "")),
                "NAME": str(row.get("NAME", "")),
                "DEPT": str(row.get("DEPT", "")),
                "YEAR": safe_int(row.get("YEAR", 0)),
                "batch_year": safe_int(row.get("batch_year", 0)),
                "performance_label": str(row.get("performance_label", "unknown")),
                "risk_label": str(row.get("risk_label", "unknown")),
                "dropout_label": str(row.get("dropout_label", "unknown"))
            }
            students.append(student)
        
        return jsonify({
            "success": True,
            "students": to_py(students),
            "count": len(students),
            "filter_info": {
                "filter_type": filter_type,
                "filter_value": filter_value,
                "scope": scope,
                "scope_value": scope_value
            }
        })
        
    except Exception as e:
        print(f"[ERR] Universal drilldown: {e}")
        return jsonify({"success": False, "message": f"Drilldown failed: {str(e)}"}), 500

if FPDF_AVAILABLE:
    class EnhancedPDF(FPDF):
        def header(self):
            self.set_font('Arial', 'B', 15)
            self.cell(0, 10, 'EduMetric Analytics Report', 0, 1, 'C')
            self.ln(5)
        
        def footer(self):
            self.set_y(-15)
            self.set_font('Arial', 'I', 8)
            self.cell(0, 10, f'Page {self.page_no()}', 0, 0, 'C')
else:
    class EnhancedPDF:
        def __init__(self):
            pass

def create_kpi_chart(kpis, title):
    """Create KPI visualization chart"""
    if not MATPLOTLIB_AVAILABLE:
        return io.BytesIO()
    
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))
    fig.suptitle(title, fontsize=16, fontweight='bold')
    
    # Extract numeric values
    numeric_kpis = {}
    for key, value in kpis.items():
        if isinstance(value, (int, float)):
            numeric_kpis[key.replace('_', ' ').title()] = value
    
    if numeric_kpis:
        keys = list(numeric_kpis.keys())
        values = list(numeric_kpis.values())
        
        # KPI Bar Chart
        colors = ['#2196F3', '#4CAF50', '#FF9800', '#F44336', '#9C27B0'][:len(keys)]
        bars = ax1.bar(keys, values, color=colors, alpha=0.8)
        ax1.set_title('Key Performance Indicators', fontweight='bold')
        ax1.set_ylabel('Values', fontweight='bold')
        ax1.grid(True, alpha=0.3)
        
        # Add value labels
        for bar, value in zip(bars, values):
            height = bar.get_height()
            ax1.text(bar.get_x() + bar.get_width()/2., height + max(values)*0.01,
                   f'{value:.1f}', ha='center', va='bottom', fontweight='bold')
        
        plt.setp(ax1.xaxis.get_majorticklabels(), rotation=45, ha='right')
        
        # Donut chart for top KPIs
        if len(values) >= 3:
            top_3_keys = keys[:3]
            top_3_values = values[:3]
            
            wedges, texts = ax2.pie(top_3_values, labels=top_3_keys, colors=colors[:3], 
                                   startangle=90, textprops={'fontweight': 'bold'})
            
            centre_circle = plt.Circle((0,0), 0.60, fc='white')
            ax2.add_artist(centre_circle)
            ax2.text(0, 0, 'TOP\nKPIs', ha='center', va='center', fontsize=12, fontweight='bold')
            ax2.set_title('Top Performance Metrics', fontweight='bold')
    
    plt.tight_layout()
    
    # Save to bytes
    img_buffer = io.BytesIO()
    plt.savefig(img_buffer, format='png', dpi=300, bbox_inches='tight', facecolor='white')
    img_buffer.seek(0)
    plt.close()
    return img_buffer

def create_performance_chart(data, chart_type='student'):
    """Create performance visualization charts"""
    if not MATPLOTLIB_AVAILABLE:
        return io.BytesIO()
    
    fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(14, 12))
    fig.suptitle(f'{chart_type.title()} Performance Analytics', fontsize=16, fontweight='bold')
    
    if chart_type == 'student' and 'features' in data:
        features = data['features']
        predictions = data.get('predictions', {})
        
        # Performance Metrics
        metrics = ['Performance', 'Risk Score', 'Dropout Risk']
        values = [features.get('performance_overall', 0), 
                 features.get('risk_score', 0), 
                 features.get('dropout_score', 0)]
        colors = ['#4CAF50', '#FF9800', '#F44336']
        
        bars1 = ax1.bar(metrics, values, color=colors, alpha=0.8)
        ax1.set_title('Performance Metrics', fontweight='bold')
        ax1.set_ylabel('Score (%)', fontweight='bold')
        ax1.set_ylim(0, 100)
        ax1.grid(True, alpha=0.3)
        
        for bar, value in zip(bars1, values):
            ax1.text(bar.get_x() + bar.get_width()/2., bar.get_height() + 2,
                    f'{value:.1f}%', ha='center', va='bottom', fontweight='bold')
        
        # Detailed Metrics
        categories = ['Attendance', 'Behavior', 'Internal Marks']
        values2 = [features.get('attendance_pct', 0), 
                  features.get('behavior_pct', 0), 
                  features.get('internal_pct', 0)]
        
        bars2 = ax2.barh(categories, values2, color=['#2196F3', '#9C27B0', '#FF5722'], alpha=0.8)
        ax2.set_title('Detailed Breakdown', fontweight='bold')
        ax2.set_xlabel('Score (%)', fontweight='bold')
        ax2.set_xlim(0, 100)
        ax2.grid(True, alpha=0.3)
        
        # AI Predictions
        pred_labels = [f"Perf: {predictions.get('performance_label', 'unknown').upper()}",
                      f"Risk: {predictions.get('risk_label', 'unknown').upper()}",
                      f"Drop: {predictions.get('dropout_label', 'unknown').upper()}"]
        
        ax3.pie([1, 1, 1], labels=pred_labels, colors=colors, 
               startangle=90, textprops={'fontweight': 'bold'})
        ax3.set_title('AI Predictions', fontweight='bold')
        
        # Semester Trend
        if 'student' in data:
            student = data['student']
            sems, marks = [], []
            for i in range(1, 9):
                sem_key = f'SEM{i}'
                if sem_key in student and student[sem_key] and float(student[sem_key]) > 0:
                    sems.append(f'S{i}')
                    marks.append(float(student[sem_key]))
            
            if marks:
                ax4.plot(sems, marks, marker='o', linewidth=3, markersize=8, 
                        color='#1976D2', markerfacecolor='#FFEB3B')
                ax4.fill_between(sems, marks, alpha=0.3, color='#1976D2')
                ax4.set_title('Semester Trend', fontweight='bold')
                ax4.set_ylabel('Marks (%)', fontweight='bold')
                ax4.grid(True, alpha=0.3)
    
    elif chart_type in ['department', 'year', 'college', 'batch']:
        if 'label_counts' in data:
            label_counts = data['label_counts']
            
            # Performance Distribution
            if 'performance' in label_counts:
                perf_data = label_counts['performance']
                colors1 = ['#4CAF50', '#FF9800', '#F44336']
                ax1.pie(perf_data.values(), labels=perf_data.keys(), 
                       autopct='%1.1f%%', colors=colors1, textprops={'fontweight': 'bold'})
                ax1.set_title('Performance Distribution', fontweight='bold')
            
            # Risk Distribution
            if 'risk' in label_counts:
                risk_data = label_counts['risk']
                ax2.pie(risk_data.values(), labels=risk_data.keys(), 
                       autopct='%1.1f%%', colors=colors1, textprops={'fontweight': 'bold'})
                ax2.set_title('Risk Distribution', fontweight='bold')
            
            # Dropout Distribution
            if 'dropout' in label_counts:
                drop_data = label_counts['dropout']
                ax3.pie(drop_data.values(), labels=drop_data.keys(), 
                       autopct='%1.1f%%', colors=colors1, textprops={'fontweight': 'bold'})
                ax3.set_title('Dropout Distribution', fontweight='bold')
        
        # Statistics
        if 'stats' in data:
            stats = data['stats']
            stat_names, stat_values = [], []
            
            for key, value in stats.items():
                if isinstance(value, (int, float)) and key != 'total_students':
                    stat_names.append(key.replace('_', ' ').title())
                    stat_values.append(value)
            
            if stat_names:
                bars4 = ax4.bar(stat_names, stat_values, color='#2196F3', alpha=0.8)
                ax4.set_title('Key Statistics', fontweight='bold')
                ax4.set_ylabel('Values', fontweight='bold')
                ax4.grid(True, alpha=0.3)
                plt.setp(ax4.xaxis.get_majorticklabels(), rotation=45, ha='right')
    
    plt.tight_layout()
    
    # Save to bytes
    img_buffer = io.BytesIO()
    plt.savefig(img_buffer, format='png', dpi=300, bbox_inches='tight', facecolor='white')
    img_buffer.seek(0)
    plt.close()
    return img_buffer

@app.route("/api/export-report", methods=["POST"])
def api_export_report():
    """Export comprehensive analytics report with charts as PDF"""
    if not FPDF_AVAILABLE:
        return jsonify({"success": False, "message": "PDF export not available - fpdf package missing"}), 500
    
    try:
        data = request.get_json(silent=True) or {}
        report_type = data.get("report_type", "student")
        report_data = data.get("report_data", {})
        
        # Create enhanced PDF
        pdf = EnhancedPDF()
        pdf.add_page()
        
        # Title
        title_map = {
            "student": "Student Performance Report",
            "department": "Department Analytics Report", 
            "year": "Year Analytics Report",
            "college": "College Analytics Report",
            "batch": "Batch Analytics Report"
        }
        
        pdf.set_font('Arial', 'B', 18)
        pdf.cell(0, 15, title_map.get(report_type, "Analytics Report"), 0, 1, 'C')
        pdf.ln(10)
        
        # Report metadata
        pdf.set_font('Arial', '', 11)
        pdf.cell(0, 8, f"Generated: {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')}", 0, 1)
        pdf.cell(0, 8, "Report Type: Comprehensive Analytics with Visual Charts", 0, 1)
        pdf.ln(10)
        
        # Executive Summary
        pdf.set_font('Arial', 'B', 14)
        pdf.set_fill_color(240, 248, 255)
        pdf.cell(0, 10, "EXECUTIVE SUMMARY", 1, 1, 'C', True)
        pdf.set_font('Arial', '', 10)
        
        if 'summary' in report_data:
            summary_lines = [report_data['summary'][i:i+85] for i in range(0, len(report_data['summary']), 85)]
            for line in summary_lines:
                pdf.cell(0, 6, line, 0, 1)
        else:
            pdf.cell(0, 6, f"Comprehensive {report_type} analytics report with performance insights and predictions.", 0, 1)
        pdf.ln(5)
        
        # KPIs Section with Chart
        if 'kpis' in report_data or 'stats' in report_data:
            kpis = report_data.get('kpis', report_data.get('stats', {}))
            
            pdf.set_font('Arial', 'B', 14)
            pdf.cell(0, 10, "KEY PERFORMANCE INDICATORS & VISUAL ANALYTICS", 0, 1)
            pdf.ln(5)
            
            # Create and embed KPI chart
            kpi_chart = create_kpi_chart(kpis, "Performance Metrics Dashboard")
            
            # Save chart as temporary file
            temp_kpi_path = os.path.join(DATA_DIR, "temp_kpi_chart.png")
            with open(temp_kpi_path, 'wb') as f:
                f.write(kpi_chart.getvalue())
            
            pdf.image(temp_kpi_path, x=10, y=pdf.get_y(), w=190)
            pdf.ln(85)
            
            # KPI Table
            pdf.set_font('Arial', 'B', 10)
            pdf.cell(60, 8, "KPI Metric", 1, 0, 'C')
            pdf.cell(40, 8, "Value", 1, 0, 'C')
            pdf.cell(90, 8, "Description", 1, 1, 'C')
            
            pdf.set_font('Arial', '', 9)
            kpi_descriptions = {
                'total_students': 'Total number of students analyzed',
                'avg_performance': 'Average performance score across all students',
                'high_performers': 'Number of high-performing students',
                'high_risk': 'Number of students at high risk',
                'high_risk_pct': 'Percentage of high-risk students',
                'top_performers_pct': 'Percentage of top performers'
            }
            
            for key, value in kpis.items():
                if isinstance(value, (int, float)):
                    pdf.cell(60, 6, key.replace('_', ' ').title(), 1, 0, 'L')
                    pdf.cell(40, 6, f"{value:.1f}" + ('%' if 'pct' in key else ''), 1, 0, 'C')
                    pdf.cell(90, 6, kpi_descriptions.get(key, 'Performance metric'), 1, 1, 'L')
            
            # Clean up temp file
            if os.path.exists(temp_kpi_path):
                os.remove(temp_kpi_path)
        
        # Student Details
        if 'student' in report_data:
            student = report_data['student']
            pdf.ln(5)
            pdf.set_font('Arial', 'B', 12)
            pdf.set_fill_color(245, 245, 245)
            pdf.cell(0, 8, "STUDENT INFORMATION", 1, 1, 'L', True)
            pdf.set_font('Arial', '', 10)
            
            student_info = [
                f"Name: {student.get('NAME', 'N/A')}",
                f"Register Number: {student.get('RNO', 'N/A')}",
                f"Department: {student.get('DEPT', 'N/A')}",
                f"Year: {student.get('YEAR', 'N/A')}",
                f"Current Semester: {student.get('CURR_SEM', 'N/A')}"
            ]
            
            for info in student_info:
                pdf.cell(0, 6, info, 0, 1)
        
        # Performance Analytics Charts
        pdf.add_page()
        pdf.set_font('Arial', 'B', 16)
        pdf.cell(0, 10, "PERFORMANCE ANALYTICS & VISUAL INSIGHTS", 0, 1)
        pdf.ln(5)
        
        # Create and embed performance charts
        perf_chart = create_performance_chart(report_data, report_type)
        
        temp_perf_path = os.path.join(DATA_DIR, "temp_perf_chart.png")
        with open(temp_perf_path, 'wb') as f:
            f.write(perf_chart.getvalue())
        
        pdf.image(temp_perf_path, x=5, y=pdf.get_y(), w=200)
        pdf.ln(120)
        
        # Clean up temp file
        if os.path.exists(temp_perf_path):
            os.remove(temp_perf_path)
        
        # Detailed Analysis
        if 'features' in report_data:
            feats = report_data['features']
            pdf.set_font('Arial', 'B', 12)
            pdf.cell(0, 8, "DETAILED PERFORMANCE ANALYSIS", 0, 1)
            pdf.set_font('Arial', '', 9)
            
            analysis_data = [
                ["Performance Score", f"{feats.get('performance_overall', 0):.1f}%", "Overall academic performance"],
                ["Risk Assessment", f"{feats.get('risk_score', 0):.1f}%", "Academic difficulty probability"],
                ["Dropout Risk", f"{feats.get('dropout_score', 0):.1f}%", "Study discontinuation likelihood"],
                ["Attendance Rate", f"{feats.get('attendance_pct', 0):.1f}%", "Combined attendance performance"],
                ["Internal Marks", f"{feats.get('internal_pct', 0):.1f}%", "Continuous assessment score"]
            ]
            
            # Analysis table
            pdf.set_font('Arial', 'B', 9)
            pdf.cell(45, 6, "Metric", 1, 0, 'C')
            pdf.cell(25, 6, "Value", 1, 0, 'C')
            pdf.cell(120, 6, "Description", 1, 1, 'C')
            
            pdf.set_font('Arial', '', 8)
            for row in analysis_data:
                pdf.cell(45, 5, row[0], 1, 0, 'L')
                pdf.cell(25, 5, row[1], 1, 0, 'C')
                pdf.cell(120, 5, row[2], 1, 1, 'L')
        
        # AI Predictions
        if 'predictions' in report_data:
            preds = report_data['predictions']
            pdf.ln(5)
            pdf.set_font('Arial', 'B', 12)
            pdf.set_fill_color(255, 248, 220)
            pdf.cell(0, 8, "AI PREDICTIONS & RECOMMENDATIONS", 1, 1, 'C', True)
            pdf.set_font('Arial', '', 10)
            
            pred_info = [
                f"Performance Level: {preds.get('performance_label', 'N/A').upper()}",
                f"Risk Level: {preds.get('risk_label', 'N/A').upper()}",
                f"Dropout Risk: {preds.get('dropout_label', 'N/A').upper()}"
            ]
            
            for info in pred_info:
                pdf.cell(0, 6, info, 0, 1)
        
        # Recommendations
        pdf.ln(5)
        pdf.set_font('Arial', 'B', 12)
        pdf.cell(0, 8, "ACTIONABLE RECOMMENDATIONS", 0, 1)
        pdf.set_font('Arial', '', 9)
        
        # Generate recommendations based on data
        recommendations = []
        if 'features' in report_data:
            feats = report_data['features']
            if feats.get('performance_overall', 0) < 60:
                recommendations.append("• Immediate academic intervention required - performance below threshold")
            if feats.get('risk_score', 0) > 70:
                recommendations.append("• High-risk student - schedule counseling sessions")
            if feats.get('attendance_pct', 0) < 75:
                recommendations.append("• Attendance improvement needed - implement monitoring system")
        
        if not recommendations:
            recommendations = [
                "• Continue monitoring student progress regularly",
                "• Maintain current academic support systems",
                "• Encourage participation in enhancement programs"
            ]
        
        for rec in recommendations:
            pdf.cell(0, 5, rec, 0, 1)
        
        # Footer
        pdf.ln(10)
        pdf.set_font('Arial', 'B', 10)
        pdf.cell(0, 6, "EDUMETRIC ANALYTICS SYSTEM - COMPREHENSIVE REPORT", 0, 1, 'C')
        pdf.set_font('Arial', '', 8)
        pdf.cell(0, 5, "This report contains AI-powered insights with visual analytics and performance predictions.", 0, 1, 'C')
        
        # Save PDF
        pdf_output = io.BytesIO()
        pdf_content = pdf.output(dest='S').encode('latin-1')
        pdf_output.write(pdf_content)
        pdf_output.seek(0)
        
        # Generate filename
        timestamp = pd.Timestamp.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{report_type}_visual_report_{timestamp}.pdf"
        
        return send_file(
            pdf_output,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        print(f"[ERR] PDF export: {e}")
        return jsonify({"success": False, "message": f"PDF export failed: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(debug=True)
