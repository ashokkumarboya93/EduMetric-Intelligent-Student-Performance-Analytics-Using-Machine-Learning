import os
import pandas as pd
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
                df = pd.DataFrame(data)
                df.columns = df.columns.str.upper()
                return df
        
        return pd.DataFrame()
        
    except Exception as e:
        print(f"Error: {e}")
        return pd.DataFrame()

@app.route("/")
def index():
    try:
        df = get_supabase_data()
        departments = sorted(df['DEPT'].unique().tolist()) if not df.empty and 'DEPT' in df.columns else ['CSE', 'ECE', 'MECH', 'CIVIL', 'EEE', 'CSE(AI)', 'CDS']
        years = sorted(df['YEAR'].unique().tolist()) if not df.empty and 'YEAR' in df.columns else ['1', '2', '3', '4']
        
        return render_template('index.html', 
                             DEBUG=True,
                             departments=departments, 
                             years=years)
    except Exception as e:
        return render_template('index.html', DEBUG=True, departments=['CSE', 'ECE', 'MECH', 'CIVIL', 'EEE', 'CSE(AI)', 'CDS'], years=['1', '2', '3', '4'])

@app.route("/api/chat", methods=["POST"])
def api_chat():
    """AI Chat Assistant for dynamic analytics queries"""
    try:
        data = request.get_json(silent=True) or {}
        message = data.get('message', '').strip()
        
        if not message:
            return jsonify({"success": False, "message": "Please provide a message"}), 400
        
        # Simple register number detection
        import re
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
    """Handle individual student analytics queries"""
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
                "year": student_data.get("year", 1),
                "semester": student_data.get("curr_sem", 1),
                "email": student_data.get("email", "N/A"),
                "mentor": student_data.get("mentor", "N/A")
            }
            
            kpis = {
                "performance_score": float(student_data.get("performance_overall", 50)),
                "risk_score": float(student_data.get("risk_score", 50)),
                "dropout_score": float(student_data.get("dropout_score", 50)),
                "attendance_rate": float(student_data.get("attendance_pct", 75)),
                "internal_marks": float(student_data.get("internal_pct", 66)),
                "behavior_score": float(student_data.get("behavior_pct", 70))
            }
            
            predictions = {
                "performance_label": student_data.get("performance_label", "medium"),
                "risk_label": student_data.get("risk_label", "medium"),
                "dropout_label": student_data.get("dropout_label", "medium")
            }
            
            semester_data = {}
            for i in range(1, 9):
                sem_value = student_data.get(f"sem{i}")
                if sem_value and float(sem_value) > 0:
                    semester_data[f"SEM{i}"] = float(sem_value)
            
            insight = f"{student_info['name']} shows {predictions['performance_label']} performance with {kpis['performance_score']:.1f}% overall score."
            recommendations = ["Regular monitoring recommended", "Continue current support"]
            
            response_text = f"Here's the complete analytics for {student_info['name']} ({rno}). I've loaded their performance dashboard with detailed insights and recommendations."
            
            return jsonify({
                "success": True,
                "type": "analytics",
                "action": "student_analytics",
                "response": response_text,
                "data": {
                    "title": f"Analytics for {student_info['name']} ({rno})",
                    "student_info": student_info,
                    "kpis": kpis,
                    "predictions": predictions,
                    "semester_data": semester_data,
                    "insight": insight,
                    "recommendations": recommendations
                }
            })
        else:
            return jsonify({
                "success": True,
                "response": f"I couldn't find a student with register number {rno}. Please check the register number and try again."
            })
            
    except Exception as e:
        return jsonify({
            "success": False,
            "response": f"I encountered an error while searching for student {rno}. Please try again."
        })

def handle_department_analytics_query(message):
    """Handle department-wise analytics queries"""
    try:
        dept_mapping = {
            'cse': 'CSE', 'computer science': 'CSE', 'cs': 'CSE',
            'ece': 'ECE', 'electronics': 'ECE', 'ec': 'ECE',
            'mech': 'MECH', 'mechanical': 'MECH',
            'civil': 'CIVIL', 'ce': 'CIVIL',
            'eee': 'EEE', 'electrical': 'EEE'
        }
        
        detected_dept = None
        for key, value in dept_mapping.items():
            if key in message:
                detected_dept = value
                break
        
        if not detected_dept:
            return jsonify({
                "success": True,
                "response": "I can analyze department performance! Please specify which department: CSE, ECE, MECH, CIVIL, or EEE."
            })
        
        df = get_supabase_data()
        if df.empty:
            return jsonify({
                "success": True,
                "response": "I'm unable to access the student database right now. Please try again later."
            })
        
        dept_df = df[df['DEPT'].astype(str).str.upper() == detected_dept]
        
        if dept_df.empty:
            return jsonify({
                "success": True,
                "response": f"No students found in {detected_dept} department."
            })
        
        total_students = len(dept_df)
        high_performers = len(dept_df[dept_df['PERFORMANCE_LABEL'].astype(str).str.lower() == 'high'])
        avg_performance = dept_df['PERFORMANCE_OVERALL'].astype(float).mean()
        
        stats = {
            "total_students": total_students,
            "high_performers": high_performers,
            "avg_performance": round(avg_performance, 1)
        }
        
        top_students = dept_df.nlargest(10, 'PERFORMANCE_OVERALL')[['RNO', 'NAME', 'DEPT', 'YEAR', 'PERFORMANCE_OVERALL']].to_dict('records')
        
        insight = f"The {detected_dept} department has {total_students} students with an average performance of {avg_performance:.1f}%."
        
        response_text = f"Here's the complete analytics for {detected_dept} department with {total_students} students."
        
        return jsonify({
            "success": True,
            "type": "analytics",
            "action": "department_analysis",
            "response": response_text,
            "data": {
                "title": f"{detected_dept} Department Analytics",
                "stats": stats,
                "students": top_students,
                "insight": insight,
                "department": detected_dept
            }
        })
        
    except Exception as e:
        return jsonify({
            "success": True,
            "response": "I encountered an error while analyzing the department. Please try again."
        })

def handle_top_performers_query(message):
    """Handle top performers queries"""
    try:
        df = get_supabase_data()
        if df.empty:
            return jsonify({
                "success": True,
                "response": "I'm unable to access the student database right now."
            })
        
        top_performers = df[df['PERFORMANCE_LABEL'].astype(str).str.lower() == 'high']
        
        if top_performers.empty:
            return jsonify({
                "success": True,
                "response": "No high-performing students found in the current dataset."
            })
        
        top_students = top_performers.nlargest(20, 'PERFORMANCE_OVERALL')[['RNO', 'NAME', 'DEPT', 'YEAR', 'PERFORMANCE_OVERALL']].to_dict('records')
        
        stats = {
            "total_high_performers": len(top_performers),
            "avg_performance": round(top_performers['PERFORMANCE_OVERALL'].astype(float).mean(), 1)
        }
        
        insight = f"Found {len(top_performers)} high-performing students with an average performance of {stats['avg_performance']}%."
        
        response_text = f"Here are the top {len(top_students)} high-performing students!"
        
        return jsonify({
            "success": True,
            "type": "analytics",
            "action": "top_performers",
            "response": response_text,
            "data": {
                "title": "Top Performing Students",
                "stats": stats,
                "students": top_students,
                "insight": insight
            }
        })
        
    except Exception as e:
        return jsonify({
            "success": True,
            "response": "I encountered an error while finding top performers."
        })

def handle_high_risk_query(message):
    """Handle high risk students queries"""
    try:
        df = get_supabase_data()
        if df.empty:
            return jsonify({
                "success": True,
                "response": "I'm unable to access the student database right now."
            })
        
        high_risk_students = df[df['RISK_LABEL'].astype(str).str.lower() == 'high']
        
        if high_risk_students.empty:
            return jsonify({
                "success": True,
                "response": "Great news! No students are currently classified as high-risk."
            })
        
        risk_students = high_risk_students.nlargest(20, 'RISK_SCORE')[['RNO', 'NAME', 'DEPT', 'YEAR', 'RISK_SCORE']].to_dict('records')
        
        stats = {
            "total_high_risk": len(high_risk_students),
            "avg_risk_score": round(high_risk_students['RISK_SCORE'].astype(float).mean(), 1)
        }
        
        insight = f"⚠️ URGENT: {len(high_risk_students)} students are at high risk with an average risk score of {stats['avg_risk_score']}%."
        
        response_text = f"⚠️ I found {len(risk_students)} high-risk students who need immediate attention!"
        
        return jsonify({
            "success": True,
            "type": "analytics",
            "action": "high_risk_students",
            "response": response_text,
            "data": {
                "title": "High-Risk Students - Immediate Attention Required",
                "stats": stats,
                "students": risk_students,
                "insight": insight
            }
        })
        
    except Exception as e:
        return jsonify({
            "success": True,
            "response": "I encountered an error while finding high-risk students."
        })

def handle_attendance_query(message):
    """Handle attendance analysis queries"""
    try:
        df = get_supabase_data()
        if df.empty:
            return jsonify({
                "success": True,
                "response": "I'm unable to access the student database right now."
            })
        
        if 'ATTENDANCE_PCT' in df.columns:
            avg_attendance = df['ATTENDANCE_PCT'].astype(float).mean()
            low_attendance = df[df['ATTENDANCE_PCT'].astype(float) < 75]
            
            stats = {
                "avg_attendance": round(avg_attendance, 1),
                "low_attendance_count": len(low_attendance),
                "total_students": len(df)
            }
            
            insight = f"College-wide attendance analysis shows {avg_attendance:.1f}% average attendance."
            
            response_text = f"Here's the comprehensive attendance analysis! Average attendance is {avg_attendance:.1f}%."
            
            return jsonify({
                "success": True,
                "type": "analytics",
                "action": "attendance_analysis",
                "response": response_text,
                "data": {
                    "title": "Attendance Analysis",
                    "stats": stats,
                    "students": low_attendance[['RNO', 'NAME', 'DEPT', 'ATTENDANCE_PCT']].to_dict('records')[:20],
                    "insight": insight
                }
            })
        else:
            return jsonify({
                "success": True,
                "response": "Attendance data is not available in the current dataset."
            })
            
    except Exception as e:
        return jsonify({
            "success": True,
            "response": "I encountered an error while analyzing attendance."
        })

def handle_year_analytics_query(message):
    """Handle year-wise analytics queries"""
    try:
        year_patterns = [
            (r'\b1st\b|\bfirst\b|\byear 1\b', '1'),
            (r'\b2nd\b|\bsecond\b|\byear 2\b', '2'),
            (r'\b3rd\b|\bthird\b|\byear 3\b', '3'),
            (r'\b4th\b|\bfourth\b|\byear 4\b', '4')
        ]
        
        detected_year = None
        for pattern, year in year_patterns:
            if re.search(pattern, message):
                detected_year = year
                break
        
        if not detected_year:
            return jsonify({
                "success": True,
                "response": "I can analyze year-wise performance! Please specify: 1st year, 2nd year, 3rd year, or 4th year."
            })
        
        df = get_supabase_data()
        if df.empty:
            return jsonify({
                "success": True,
                "response": "I'm unable to access the student database right now."
            })
        
        year_df = df[df['YEAR'].astype(str) == detected_year]
        
        if year_df.empty:
            return jsonify({
                "success": True,
                "response": f"No students found in {detected_year} year."
            })
        
        total_students = len(year_df)
        avg_performance = year_df['PERFORMANCE_OVERALL'].astype(float).mean()
        
        stats = {
            "total_students": total_students,
            "avg_performance": round(avg_performance, 1)
        }
        
        sample_students = year_df.nlargest(15, 'PERFORMANCE_OVERALL')[['RNO', 'NAME', 'DEPT', 'PERFORMANCE_OVERALL']].to_dict('records')
        
        year_suffix = {"1": "st", "2": "nd", "3": "rd", "4": "th"}[detected_year]
        insight = f"Year {detected_year} analysis shows {total_students} students with {avg_performance:.1f}% average performance."
        
        response_text = f"Here's the complete {detected_year}{year_suffix} year analytics for {total_students} students."
        
        return jsonify({
            "success": True,
            "type": "analytics",
            "action": "year_analysis",
            "response": response_text,
            "data": {
                "title": f"{detected_year}{year_suffix} Year Analytics",
                "stats": stats,
                "students": sample_students,
                "insight": insight,
                "year": detected_year
            }
        })
        
    except Exception as e:
        return jsonify({
            "success": True,
            "response": "I encountered an error while analyzing year data."
        })

def handle_general_query(message):
    """Handle general queries and provide help"""
    help_examples = [
        "🎓 **Individual Student**: '23G31A1014 analytics' or 'show me CSE2021001'",
        "🏢 **Department Analysis**: 'CSE department analytics' or 'ECE performance'",
        "🏆 **Top Performers**: 'show top performers' or 'best students'",
        "⚠️ **High Risk Students**: 'high risk students' or 'students at risk'",
        "📅 **Attendance Analysis**: 'attendance analysis' or 'attendance vs performance'",
        "📊 **Year-wise Analytics**: '2nd year analytics' or '3rd year performance'"
    ]
    
    response_text = f"I'm your AI Analytics Assistant! Here are some things you can ask me:\n\n" + "\n".join(help_examples) + "\n\nJust type your question naturally!"
    
    return jsonify({
        "success": True,
        "response": response_text
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)