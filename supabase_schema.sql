-- EduMetric Supabase/PostgreSQL Database Setup
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)

CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    rno VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    dept VARCHAR(50),
    year INT,
    curr_sem INT,
    mentor VARCHAR(100),
    mentor_email VARCHAR(100),
    
    -- Semester marks
    sem1 FLOAT DEFAULT 0,
    sem2 FLOAT DEFAULT 0,
    sem3 FLOAT DEFAULT 0,
    sem4 FLOAT DEFAULT 0,
    sem5 FLOAT DEFAULT 0,
    sem6 FLOAT DEFAULT 0,
    sem7 FLOAT DEFAULT 0,
    sem8 FLOAT DEFAULT 0,
    
    -- Current semester data
    internal_marks FLOAT DEFAULT 20,
    total_days_curr FLOAT DEFAULT 90,
    attended_days_curr FLOAT DEFAULT 80,
    prev_attendance_perc FLOAT DEFAULT 85,
    behavior_score_10 FLOAT DEFAULT 7,
    
    -- Computed features
    past_avg FLOAT DEFAULT 0,
    past_count INT DEFAULT 0,
    internal_pct FLOAT DEFAULT 0,
    attendance_pct FLOAT DEFAULT 0,
    behavior_pct FLOAT DEFAULT 0,
    performance_trend FLOAT DEFAULT 0,
    performance_overall FLOAT DEFAULT 0,
    risk_score FLOAT DEFAULT 0,
    dropout_score FLOAT DEFAULT 0,
    present_att FLOAT DEFAULT 0,
    prev_att FLOAT DEFAULT 0,
    
    -- ML predictions
    performance_label VARCHAR(20) DEFAULT 'unknown',
    risk_label VARCHAR(20) DEFAULT 'unknown',
    dropout_label VARCHAR(20) DEFAULT 'unknown',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_students_rno ON students(rno);
CREATE INDEX IF NOT EXISTS idx_students_dept ON students(dept);
CREATE INDEX IF NOT EXISTS idx_students_year ON students(year);
CREATE INDEX IF NOT EXISTS idx_students_performance ON students(performance_label);
CREATE INDEX IF NOT EXISTS idx_students_risk ON students(risk_label);
CREATE INDEX IF NOT EXISTS idx_students_dropout ON students(dropout_label);

-- Enable Row Level Security (RLS)
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow all access (public access for now)
CREATE POLICY "Allow all access" ON students FOR ALL USING (true);

-- Sample data insert (optional - for testing)
INSERT INTO students (rno, name, email, dept, year, curr_sem, sem1, sem2, sem3, internal_marks, total_days_curr, attended_days_curr, prev_attendance_perc, behavior_score_10) VALUES
('21CSE001', 'John Doe', 'john@example.com', 'CSE', 2, 4, 85, 78, 82, 25, 90, 85, 88, 8),
('21CSE002', 'Jane Smith', 'jane@example.com', 'CSE', 2, 4, 92, 89, 91, 28, 90, 88, 92, 9),
('21ECE001', 'Bob Johnson', 'bob@example.com', 'ECE', 2, 4, 75, 72, 70, 20, 90, 70, 75, 6)
ON CONFLICT (rno) DO NOTHING;
