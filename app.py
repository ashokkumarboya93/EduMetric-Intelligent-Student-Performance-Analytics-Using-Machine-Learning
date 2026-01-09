import os
from flask import Flask, jsonify, request, render_template
import requests
from dotenv import load_dotenv
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import re

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'fallback-key')

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

def get_supabase_data():
    try:
        url = f"{SUPABASE_URL}/rest/v1/students?select=*"
        headers = {
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
            'Accept': 'application/json'
        }
        
        response = requests.get(url, headers=headers, timeout=20)
        
        if response.status_code == 200:
            data = response.json()
            if data:
                # Convert to uppercase column names for consistency
                processed_data = []
                for row in data:
                    processed_row = {k.upper(): v for k, v in row.items()}
                    processed_data.append(processed_row)
                return processed_data
        
        return []
        
    except Exception as e:
        print(f"Error: {e}")
        return []

@app.route("/")
def index():
    try:
        data = get_supabase_data()
        departments = sorted(list(set([row['DEPT'] for row in data if 'DEPT' in row]))) if data else ['CSE', 'ECE', 'MECH', 'CIVIL', 'EEE', 'CSE(AI)', 'CDS']
        years = sorted(list(set([str(row['YEAR']) for row in data if 'YEAR' in row]))) if data else ['1', '2', '3', '4']
        
        return render_template('index.html', 
                             DEBUG=True,
                             departments=departments, 
                             years=years)
    except Exception as e:
        return render_template('index.html', DEBUG=True, departments=['CSE', 'ECE', 'MECH', 'CIVIL', 'EEE', 'CSE(AI)', 'CDS'], years=['1', '2', '3', '4'])

@app.route("/api/analytics", methods=["POST"])
def api_analytics():
    try:
        data = request.get_json(silent=True) or {}
        mode = data.get("mode", "batch")
        
        if mode == "batch":
            return handle_batch_analytics(data)
        elif mode == "department":
            return handle_department_analytics(data)
        elif mode == "year":
            return handle_year_analytics(data)
        elif mode == "college":
            return handle_college_analytics(data)
        else:
            return jsonify({"success": False, "message": "Invalid mode"}), 400
            
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

def handle_batch_analytics(data):
    try:
        students_data = get_supabase_data()
        if not students_data:
            return jsonify({"success": False, "message": "No data available"}), 500
        
        total_students = len(students_data)
        high_perf = len([s for s in students_data if str(s.get('PERFORMANCE_LABEL', '')).lower() == 'high'])
        medium_perf = len([s for s in students_data if str(s.get('PERFORMANCE_LABEL', '')).lower() == 'medium'])
        low_perf = len([s for s in students_data if str(s.get('PERFORMANCE_LABEL', '')).lower() in ['low', 'poor']])
        
        high_risk = len([s for s in students_data if str(s.get('RISK_LABEL', '')).lower() == 'high'])
        medium_risk = len([s for s in students_data if str(s.get('RISK_LABEL', '')).lower() == 'medium'])
        low_risk = len([s for s in students_data if str(s.get('RISK_LABEL', '')).lower() == 'low'])
        
        dropout_high = len([s for s in students_data if str(s.get('DROPOUT_LABEL', '')).lower() == 'high'])
        dropout_medium = len([s for s in students_data if str(s.get('DROPOUT_LABEL', '')).lower() == 'medium'])
        dropout_low = len([s for s in students_data if str(s.get('DROPOUT_LABEL', '')).lower() == 'low'])
        
        avg_attendance = sum([float(s.get('ATTENDANCE_PCT', 0)) for s in students_data]) / total_students if total_students > 0 else 0
        avg_performance = sum([float(s.get('PERFORMANCE_OVERALL', 0)) for s in students_data]) / total_students if total_students > 0 else 0
        
        stats = {
            "total_students": total_students,
            "avg_performance": round(avg_performance, 1),
            "avg_attendance": round(avg_attendance, 1),
            "high_performers": high_perf,
            "at_risk_students": high_risk
        }
        
        label_counts = {
            "performance": {"High": high_perf, "Medium": medium_perf, "Low": low_perf},
            "risk": {"High": high_risk, "Medium": medium_risk, "Low": low_risk},
            "dropout": {"High": dropout_high, "Medium": dropout_medium, "Low": dropout_low}
        }
        
        table_data = [{
            "RNO": s.get('RNO', ''),
            "NAME": s.get('NAME', ''),
            "DEPT": s.get('DEPT', ''),
            "YEAR": s.get('YEAR', ''),
            "PERFORMANCE_LABEL": s.get('PERFORMANCE_LABEL', ''),
            "RISK_LABEL": s.get('RISK_LABEL', ''),
            "DROPOUT_LABEL": s.get('DROPOUT_LABEL', '')
        } for s in students_data[:100]]  # Limit to first 100 for performance
        
        insights = [
            f"Total {total_students} students analyzed",
            f"Average performance: {avg_performance:.1f}%",
            f"High performers: {high_perf} students ({(high_perf/total_students*100):.1f}%)",
            f"At-risk students: {high_risk} students need attention"
        ]
        
        suggestions = [
            "Monitor at-risk students closely",
            "Implement targeted support programs",
            "Regular performance reviews recommended"
        ]
        
        return jsonify({
            "success": True,
            "stats": stats,
            "label_counts": label_counts,
            "table": table_data,
            "insights": insights,
            "suggestions": suggestions,
            "total_students": total_students
        })
        
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

def handle_department_analytics(data):
    try:
        department = data.get("department", "")
        if not department:
            return jsonify({"success": False, "message": "Department required"}), 400
            
        students_data = get_supabase_data()
        dept_students = [s for s in students_data if str(s.get('DEPT', '')).upper() == department.upper()]
        
        if not dept_students:
            return jsonify({"success": False, "message": f"No students found in {department}"}), 404
            
        total_students = len(dept_students)
        avg_performance = sum([float(s.get('PERFORMANCE_OVERALL', 0)) for s in dept_students]) / total_students
        
        stats = {
            "total_students": total_students,
            "avg_performance": round(avg_performance, 1),
            "department": department
        }
        
        return jsonify({"success": True, "stats": stats})
        
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

def handle_year_analytics(data):
    try:
        year = data.get("year", "")
        if not year:
            return jsonify({"success": False, "message": "Year required"}), 400
            
        students_data = get_supabase_data()
        year_students = [s for s in students_data if str(s.get('YEAR', '')) == str(year)]
        
        if not year_students:
            return jsonify({"success": False, "message": f"No students found in year {year}"}), 404
            
        total_students = len(year_students)
        avg_performance = sum([float(s.get('PERFORMANCE_OVERALL', 0)) for s in year_students]) / total_students
        
        stats = {
            "total_students": total_students,
            "avg_performance": round(avg_performance, 1),
            "year": year
        }
        
        return jsonify({"success": True, "stats": stats})
        
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

def handle_college_analytics(data):
    try:
        students_data = get_supabase_data()
        if not students_data:
            return jsonify({"success": False, "message": "No data available"}), 500
            
        total_students = len(students_data)
        avg_performance = sum([float(s.get('PERFORMANCE_OVERALL', 0)) for s in students_data]) / total_students
        
        stats = {
            "total_students": total_students,
            "avg_performance": round(avg_performance, 1)
        }
        
        return jsonify({"success": True, "stats": stats})
        
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/api/student/search", methods=["POST"])
def api_student_search():
    try:
        data = request.get_json(silent=True) or {}
        rno = data.get("rno", "").strip()

        if not rno:
            return jsonify({"success": False, "message": "Please provide Register Number"}), 400

        url = f"{SUPABASE_URL}/rest/v1/students?rno=eq.{rno}&select=*"
        headers = {
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
            'Accept': 'application/json'
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data:
                student = data[0]
                student_data = {
                    "NAME": str(student.get("name", "")),
                    "RNO": str(student.get("rno", "")),
                    "EMAIL": str(student.get("email", "")),
                    "DEPT": str(student.get("dept", "")),
                    "YEAR": int(student.get("year", 1)),
                    "CURR_SEM": int(student.get("curr_sem", 1)),
                    "PERFORMANCE_OVERALL": float(student.get("performance_overall", 50)),
                    "RISK_SCORE": float(student.get("risk_score", 50)),
                    "DROPOUT_SCORE": float(student.get("dropout_score", 50)),
                    "PERFORMANCE_LABEL": str(student.get("performance_label", "medium")),
                    "RISK_LABEL": str(student.get("risk_label", "medium")),
                    "DROPOUT_LABEL": str(student.get("dropout_label", "medium")),
                    "ATTENDANCE_PCT": float(student.get("attendance_pct", 75))
                }
                return jsonify({"success": True, "student": student_data})
        
        return jsonify({"success": False, "message": "Student not found"}), 404
        
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/api/student/predict", methods=["POST"])
def api_student_predict():
    try:
        student = request.get_json(silent=True) or {}
        
        behavior_score = float(student.get("BEHAVIOR_SCORE_10", 5))
        internal_marks = float(student.get("INTERNAL_MARKS", 15))
        attended_days = float(student.get("ATTENDED_DAYS_CURR", 45))
        total_days = float(student.get("TOTAL_DAYS_CURR", 90))
        
        behavior_pct = (behavior_score / 10.0) * 100
        internal_pct = (internal_marks / 30.0) * 100
        present_att = (attended_days / total_days) * 100 if total_days > 0 else 0
        
        perf_overall = (internal_pct * 0.4 + present_att * 0.4 + behavior_pct * 0.2)
        risk_score = 100 - perf_overall
        dropout_score = risk_score
        
        def get_performance_label(score):
            if score >= 75: return "high"
            elif score >= 50: return "medium"
            else: return "low"
        
        def get_risk_label(score):
            if score >= 70: return "high"
            elif score >= 40: return "medium"
            else: return "low"
        
        features = {
            "performance_overall": perf_overall,
            "risk_score": risk_score,
            "dropout_score": dropout_score,
            "attendance_pct": present_att,
            "behavior_pct": behavior_pct,
            "internal_pct": internal_pct
        }
        
        predictions = {
            "performance_label": get_performance_label(perf_overall),
            "risk_label": get_risk_label(risk_score),
            "dropout_label": get_risk_label(dropout_score)
        }
        
        need_alert = (predictions["performance_label"] == "low" or 
                     predictions["risk_label"] == "high" or 
                     predictions["dropout_label"] == "high")
        
        return jsonify({
            "success": True,
            "student": student,
            "features": features,
            "predictions": predictions,
            "need_alert": need_alert
        })
        
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/api/chat", methods=["POST"])
def api_chat():
    try:
        data = request.get_json(silent=True) or {}
        message = data.get('message', '').strip()
        
        if not message:
            return jsonify({"success": False, "message": "Please provide a message"}), 400
        
        rno_match = re.search(r'\b(\d{2}[gG]\d{2}[aA]\d{4})\b', message, re.IGNORECASE)
        
        if rno_match:
            found_rno = rno_match.group(1).upper()
            return handle_student_analytics_query(found_rno, message)
        else:
            return jsonify({
                "success": True,
                "response": "I'm your AI Analytics Assistant! Try asking about a specific student like '23G31A1014 analytics' or ask for help."
            })
            
    except Exception as e:
        return jsonify({"success": False, "message": f"Chat error: {str(e)}"}), 500

def handle_student_analytics_query(rno, original_message):
    try:
        url = f"{SUPABASE_URL}/rest/v1/students?rno=eq.{rno}&select=*"
        headers = {
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
            'Accept': 'application/json'
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 200 and response.json():
            student_data = response.json()[0]
            
            student_info = {
                "name": student_data.get("name", "Unknown"),
                "rno": student_data.get("rno", rno),
                "dept": student_data.get("dept", "Unknown"),
                "year": student_data.get("year", 1)
            }
            
            kpis = {
                "performance_score": float(student_data.get("performance_overall", 50)),
                "risk_score": float(student_data.get("risk_score", 50)),
                "attendance_rate": float(student_data.get("attendance_pct", 75))
            }
            
            predictions = {
                "performance_label": student_data.get("performance_label", "medium"),
                "risk_label": student_data.get("risk_label", "medium"),
                "dropout_label": student_data.get("dropout_label", "medium")
            }
            
            response_text = f"Here's the analytics for {student_info['name']} ({rno})."
            
            return jsonify({
                "success": True,
                "type": "analytics",
                "action": "student_analytics",
                "response": response_text,
                "data": {
                    "title": f"Analytics for {student_info['name']} ({rno})",
                    "student_info": student_info,
                    "kpis": kpis,
                    "predictions": predictions
                }
            })
        else:
            return jsonify({
                "success": True,
                "response": f"Student {rno} not found. Please check the register number."
            })
            
    except Exception as e:
        return jsonify({
            "success": False,
            "response": f"Error searching for student {rno}. Please try again."
        })



if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)