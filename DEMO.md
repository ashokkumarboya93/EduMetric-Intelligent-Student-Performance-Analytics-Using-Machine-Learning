# 🎮 EduMetric - Demo Guide

This guide provides steps to demonstrate the core functionality of the EduMetric platform.

## 🚀 Quick Start (Local)

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Environment Setup**:
   Ensure you have a `.env` file with the following variables:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `EMAIL_SENDER`
   - `EMAIL_PASSWORD`

3. **Run the App**:
   ```bash
   python app.py
   ```
   Visit `http://localhost:5000` in your browser.

## 📺 Demonstration Steps

### 1. Student Search & Analysis
- **Action**: Go to the "Student Search" section.
- **Input**: Enter a valid Register Number (e.g., from the Supabase dashboard).
- **Outcome**: View the real-time ML predictions for Performance, Risk, and Dropout. Observe the interactive Plotly charts (Radar, Gauge, and Semester Trend).

### 2. New Student Simulation
- **Action**: Switch to the "New Student" tab.
- **Input**: Enter hypothetical marks and attendance (e.g., set attendance to 40% and marks to 30%).
- **Outcome**: The AI will predict "High Risk" and "Poor Performance". A "Mentor Alert" button will appear.

### 3. Mentor Alert System
- **Action**: Click the "Send Alert" button for an at-risk student.
- **Outcome**: Check the mentor's email (configured in `.env`) for a professional HTML report detailing the student's metrics and recommended actions.

### 4. Analytics Dashboards
- **Action**: Navigate to Department, Year, or College analytics.
- **Outcome**: View aggregated data visualizations showing the distribution of performance and risk across the entire cohort.

## 💡 Key Talking Points
- **Early Intervention**: Highlight how the system predicts issues *before* the semester ends.
- **Data-Driven Decison Making**: Show how departments can identify which year or batch needs more resources.
- **Automation**: Emphasize that the alert system reduces the administrative burden on mentors.
