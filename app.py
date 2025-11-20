import os
import numpy as np
import pandas as pd

from flask import Flask, jsonify, request, render_template
import joblib

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# ===========================================================
# PATH SETUP
# ===========================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, r"data")

app = Flask(__name__)

# ===========================================================
# UNIVERSAL FIX: NUMPY/PANDAS → PYTHON TYPES
# ===========================================================
def to_py(obj):
    """Convert numpy/pandas types → pure Python types for JSON."""
    if isinstance(obj, (np.integer, np.int64, np.int32, np.int16)):
        return int(obj)
    if isinstance(obj, (np.floating, np.float64, np.float32, np.float16)):
        return float(obj)
    if isinstance(obj, pd.Series):
        return {k: to_py(v) for k, v in obj.to_dict().items()}
    if isinstance(obj, pd.DataFrame):
        return [to_py(r) for _, r in obj.iterrows()]
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

DS1 = safe_read_csv(os.path.join(DATA_DIR, r"DS1.csv"))
DS2 = safe_read_csv(os.path.join(DATA_DIR, r"DS2_ml_ready.csv"))

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

    perf_raw = performance_model.predict(X)[0]
    risk_raw = risk_model.predict(X)[0]
    drop_raw = dropout_model.predict(X)[0]

    perf = performance_encoder.inverse_transform([perf_raw])[0]
    risk = risk_encoder.inverse_transform([risk_raw])[0]
    drop = dropout_encoder.inverse_transform([drop_raw])[0]

    return {
        "performance_label": str(perf),
        "risk_label": str(risk),
        "dropout_label": str(drop),
    }

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
        st = row.to_dict()
        feats = compute_features(st)
        preds = predict_student(feats)

        perf_labels.append(preds["performance_label"])
        risk_labels.append(preds["risk_label"])
        drop_labels.append(preds["dropout_label"])
        perf_scores.append(feats["performance_overall"])
        risk_scores.append(feats["risk_score"])
        drop_scores.append(feats["dropout_score"])

        table.append(
            {
                "RNO": st.get("RNO", ""),
                "NAME": st.get("NAME", ""),
                "DEPT": st.get("DEPT", ""),
                "YEAR": safe_int(st.get("YEAR", 0)),
                "CURR_SEM": safe_int(st.get("CURR_SEM", 0)),
                "performance_label": preds["performance_label"],
                "risk_label": preds["risk_label"],
                "dropout_label": preds["dropout_label"],
                "performance_overall": feats["performance_overall"],
                "risk_score": feats["risk_score"],
                "dropout_score": feats["dropout_score"],
            }
        )

    stats = {
        "total_students": len(table),
        "high_performers": perf_labels.count("high"),
        "high_risk": risk_labels.count("high"),
        "high_dropout": drop_labels.count("high"),
        "avg_performance": round(float(np.mean(perf_scores)), 2),
    }

    label_counts = {
        "performance": {k: perf_labels.count(k) for k in set(perf_labels)},
        "risk": {k: risk_labels.count(k) for k in set(risk_labels)},
        "dropout": {k: drop_labels.count(k) for k in set(drop_labels)},
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

@app.route("/api/stats")
def api_stats():
    if DS1.empty:
        return jsonify({"total_students": 0, "departments": [], "years": []})
    try:
        departments = sorted(DS1["DEPT"].dropna().astype(str).unique().tolist())
    except Exception:
        departments = []
    try:
        years = sorted(
            [int(y) for y in DS1["YEAR"].dropna().astype(float).astype(int).unique()]
        )
    except Exception:
        years = []
    return jsonify(
        {
            "total_students": int(len(DS1)),
            "departments": departments,
            "years": years,
        }
    )

@app.route("/api/student/search", methods=["POST"])
def api_student_search():
    data = request.get_json(silent=True) or {}
    rno = data.get("rno", "").strip()

    if not rno:
        return jsonify({"success": False, "message": "Please provide Register Number."}), 400

    df = DS1[DS1["RNO"].astype(str) == rno]

    if df.empty:
        return jsonify({"success": False, "message": "Student not found."}), 200

    student = df.iloc[0].to_dict()
    return jsonify({"success": True, "student": student})


@app.route("/api/student/predict", methods=["POST"])
def api_student_predict():
    student = request.get_json(silent=True) or {}
    feats = compute_features(student)
    preds = predict_student(feats)

    payload = {
        "success": True,
        "student": student,
        "features": feats,
        "predictions": preds,
        "need_alert": preds["risk_label"] == "high"
        or preds["dropout_label"] == "high",
    }
    return jsonify(to_py(payload))

@app.route("/api/department/analyze", methods=["POST"])
def api_dept():
    data = request.get_json(silent=True) or {}
    dept = data.get("dept", None)
    year = data.get("year", None)

    df = DS1.copy()
    if dept:
        df = df[df["DEPT"].astype(str) == str(dept)]

    if year not in (None, "", "all"):
        try:
            year_int = int(year)
            df = df[df["YEAR"].fillna(0).astype(int) == year_int]
        except Exception as e:
            print("[WARN] dept year filter:", e)

    res = analyze_subset(df)
    return jsonify(to_py({"success": True, **res}))

@app.route("/api/year/analyze", methods=["POST"])
def api_year():
    data = request.get_json(silent=True) or {}
    year = data.get("year", None)
    try:
        year_int = int(year)
    except Exception:
        return jsonify({"success": False, "message": "Invalid year."}), 400

    df = DS1.copy()
    try:
        df = df[df["YEAR"].fillna(0).astype(int) == year_int]
    except Exception as e:
        print("[WARN] year filter:", e)
        df = df.iloc[0:0]

    res = analyze_subset(df)
    return jsonify(to_py({"success": True, **res}))

@app.route("/api/college/analyze")
def api_college():
    df = DS1.copy()
    if len(df) > 500:
        df = df.sample(1500, random_state=42)

    res = analyze_subset(df)
    res["sample_size"] = int(len(df))
    return jsonify(to_py({"success": True, **res}))

@app.route("/api/send-alert", methods=["POST"])
def api_send_alert():
    data = request.get_json(silent=True) or {}
    to_email = data.get("email")
    subject = data.get("subject")
    body = data.get("body")

    if not (to_email and subject and body):
        return jsonify({"success": False, "message": "Missing email/subject/body"}), 400

    FROM = "ashokkumarboya93@gmail.com"
    PASS = "lubwbacntoubetxb"  # use env var in real project

    msg = MIMEMultipart()
    msg["From"] = FROM
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(FROM, PASS)
        server.send_message(msg)
        server.quit()
        return jsonify({"success": True})
    except Exception as e:
        print("[ERR] send alert:", e)
        return jsonify({"success": False, "message": str(e)}), 500

if __name__ == "__main__":
    # For your laptop development
    app.run(debug=True)
