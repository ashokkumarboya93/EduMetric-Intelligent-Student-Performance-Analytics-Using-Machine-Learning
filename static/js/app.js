/* ===========================================================
   GLOBAL STATE
   =========================================================== */
let globalStats = {};
let currentStudent = null;
let currentStudentResult = null;

/* ===========================================================
   GLOBAL CHART CONFIGURATION
   =========================================================== */
window.defaultLayout = {
    font: { family: 'Poppins, sans-serif' },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { t: 40, r: 20, l: 40, b: 40 },
    showlegend: true,
    legend: { orientation: 'h', y: -0.2 }
};

window.defaultChartConfig = {
    responsive: true,
    displayModeBar: false,
    displaylogo: false
};

/* ===========================================================
   LOADING OVERLAY HELPERS
   =========================================================== */
function showLoading(message = "Processing...") {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) {
        overlay.style.display = "flex";
        const p = overlay.querySelector("p");
        if (p) p.innerText = message;
    }
}
function hideLoading() {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.style.display = "none";
}

/* ===========================================================
   UNIVERSAL API WRAPPER
   =========================================================== */
async function api(url, method = "GET", body = null) {
    const options = {
        method: method,
        headers: { "Content-Type": "application/json" }
    };

    if (body) {
        try {
            options.body = JSON.stringify(body);
        } catch (e) {
            console.error("JSON stringify failed:", e);
            throw new Error("Invalid request body");
        }
    }

    let response;
    try {
        response = await fetch(url, options);
    } catch (networkError) {
        console.error("Network Error:", networkError);
        throw new Error("NETWORK_ERROR");
    }

    let text = await response.text();

    try {
        return text ? JSON.parse(text) : {};
    } catch (e) {
        console.error("Invalid JSON Response:", text);
        throw new Error("INVALID_JSON");
    }
}

/* ===========================================================
   APP INITIALIZATION
   =========================================================== */
window.addEventListener("DOMContentLoaded", () => {
    // Initialize landing page first
    const landingPage = document.getElementById('landing-page');
    const appShell = document.getElementById('app-shell');

    if (landingPage) landingPage.style.display = 'block';
    if (appShell) appShell.style.display = 'none';

    // Set initial header text for dashboard
    const totalStatsEl = document.getElementById("total-stats");
    if (totalStatsEl) {
        totalStatsEl.innerText = "Dashboard Ready";
    }

    // Initialize UI components
    setupSidebarNav();
    setupSidebarToggle();
    setupStudentToggle();
    setupNormalizeUpload();
    setupResponsiveCharts();
    setupKeyboardShortcuts();

    // Load stats in background
    loadInitialStats();
});

// Keyboard shortcuts and global event handlers
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
        // ESC key to close modals
        if (e.key === 'Escape') {
            closeDrilldownModal();
            closeStudentModal();
            closeAlertModal();
        }

        // Ctrl/Cmd + number keys for quick navigation
        if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '7') {
            e.preventDefault();
            const modes = ['student', 'department', 'year', 'batch-analytics', 'college', 'batch', 'crud'];
            const modeIndex = parseInt(e.key) - 1;
            if (modes[modeIndex]) {
                const navBtn = document.querySelector(`[data-mode="${modes[modeIndex]}"]`);
                if (navBtn) navBtn.click();
            }
        }
    });

    // Global click handler for closing modals when clicking outside
    document.addEventListener('click', function (e) {
        // Close drill-down modal when clicking outside
        const drilldownModal = document.getElementById('drilldown-modal');
        if (drilldownModal && drilldownModal.classList.contains('show') && e.target === drilldownModal) {
            closeDrilldownModal();
        }

        // Close student modal when clicking outside
        const studentModal = document.getElementById('student-modal');
        if (studentModal && !studentModal.classList.contains('hidden') && e.target === studentModal) {
            closeStudentModal();
        }
    });
}

/* ===========================================================
   RESPONSIVE CHART HANDLING
   =========================================================== */
function setupResponsiveCharts() {
    // Handle window resize for all Plotly charts
    window.addEventListener('resize', debounce(() => {
        const chartElements = document.querySelectorAll('[id*="chart"]');
        chartElements.forEach(element => {
            if (element.data && element.layout) {
                Plotly.Plots.resize(element);
            }
        });
    }, 250));

    // Set default chart configuration
    window.defaultChartConfig = {
        displayModeBar: false,
        responsive: true,
        toImageButtonOptions: {
            format: 'png',
            filename: 'chart',
            height: 500,
            width: 700,
            scale: 1
        }
    };

    window.defaultLayout = {
        paper_bgcolor: "rgba(255,255,255,0)",
        plot_bgcolor: "rgba(255,245,245,0.6)",
        autosize: true,
        responsive: true,
        margin: { l: 60, r: 60, t: 80, b: 60 },
        font: { size: 14, family: 'Inter, sans-serif' }
    };
}

// Debounce function to limit resize events
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/* ===========================================================
   LOAD DASHBOARD STATS
   =========================================================== */
async function loadInitialStats() {
    try {
        const stats = await api("/api/stats");
        if (!stats) return;

        globalStats = stats;

        const totalStatsEl = document.getElementById("total-stats");
        if (totalStatsEl && stats.total_students) {
            totalStatsEl.innerText = `Total Students: ${stats.total_students} • Departments: ${stats.departments?.length || 0} • Years: ${stats.years?.length || 0}`;
        }

        if (stats.departments) {
            const deptSelects = [
                document.getElementById("s-dept"),
                document.getElementById("n-dept"),
                document.getElementById("d-dept")
            ];
            deptSelects.forEach(sel => {
                if (sel) {
                    sel.innerHTML = "";
                    stats.departments.forEach(d => {
                        const opt = document.createElement("option");
                        opt.value = d;
                        opt.textContent = d;
                        sel.appendChild(opt);
                    });
                }
            });
        }

        if (stats.years) {
            const yearSelects = [
                document.getElementById("s-year"),
                document.getElementById("n-year"),
                document.getElementById("y-year")
            ];
            yearSelects.forEach(sel => {
                if (sel) {
                    sel.innerHTML = "";
                    stats.years.forEach(y => {
                        const opt = document.createElement("option");
                        opt.value = y;
                        opt.textContent = y;
                        sel.appendChild(opt);
                    });
                }
            });
        }

        if (stats.years) {
            const dYear = document.getElementById("d-year");
            if (dYear) {
                stats.years.forEach(y => {
                    const opt = document.createElement("option");
                    opt.value = y;
                    opt.textContent = `Year ${y}`;
                    dYear.appendChild(opt);
                });
            }
        }
    } catch (error) {
        console.error("Failed to load stats:", error);
    }
}

/* ===========================================================
   SIDEBAR NAVIGATION
   =========================================================== */
function setupSidebarNav() {
    const buttons = document.querySelectorAll(".nav-btn");
    buttons.forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const mode = btn.getAttribute("data-mode");

            document.querySelectorAll(".mode-section").forEach(sec => {
                sec.classList.remove("active");
                sec.classList.add("hidden");
            });

            const target = document.getElementById(`mode-${mode}`);
            if (target) {
                target.classList.remove("hidden");
                target.classList.add("active");
            }
        });
    });
}

/* ===========================================================
   STUDENT TOGGLE
   =========================================================== */
function setupStudentToggle() {
    const btnExisting = document.getElementById("btn-existing");
    const btnNew = document.getElementById("btn-new");
    const existingForm = document.getElementById("existing-form");
    const newForm = document.getElementById("new-form");

    if (btnExisting && btnNew && existingForm && newForm) {
        btnExisting.addEventListener("click", () => {
            btnExisting.classList.add("pill-active");
            btnNew.classList.remove("pill-active");
            existingForm.classList.remove("hidden");
            newForm.classList.add("hidden");
        });

        btnNew.addEventListener("click", () => {
            btnNew.classList.add("pill-active");
            btnExisting.classList.remove("pill-active");
            newForm.classList.remove("hidden");
            existingForm.classList.add("hidden");
        });
    }
}

/* ===========================================================
   STUDENT SEARCH
   =========================================================== */
async function searchExistingStudent() {
    const rnoInput = document.getElementById("s-rno");
    if (!rnoInput) return;

    const payload = {
        rno: rnoInput.value.trim(),
        dept: document.getElementById("s-dept")?.value || "",
        year: document.getElementById("s-year")?.value || ""
    };

    if (!payload.rno) {
        alert("Please enter Register Number.");
        return;
    }

    showLoading("Searching student...");
    try {
        const result = await api("/api/student/search", "POST", payload);
        hideLoading();

        if (!result || !result.success) {
            alert(result?.message || "Student not found.");
            return;
        }

        currentStudent = result.student;
        await analyseStudent(currentStudent);
    } catch (err) {
        hideLoading();
        console.error("Error in searchExistingStudent:", err);
        alert("Error searching student. Please try again.");
    }
}

/* ===========================================================
   NEW STUDENT ANALYSIS
   =========================================================== */
async function analyseNewStudent() {
    const sems = {};
    for (let i = 1; i <= 8; i++) {
        const input = document.getElementById(`n-sem${i}`);
        if (input && input.value !== "") {
            sems[`SEM${i}`] = parseFloat(input.value);
        }
    }

    const student = {
        NAME: document.getElementById("n-name")?.value || "New Student",
        RNO: document.getElementById("n-rno")?.value || "NA",
        DEPT: document.getElementById("n-dept")?.value || "",
        YEAR: parseInt(document.getElementById("n-year")?.value || 1),
        CURR_SEM: parseInt(document.getElementById("n-curr-sem")?.value || 1),
        INTERNAL_MARKS: parseFloat(document.getElementById("n-internal")?.value || 0),
        TOTAL_DAYS_CURR: parseFloat(document.getElementById("n-total-days")?.value || 0),
        ATTENDED_DAYS_CURR: parseFloat(document.getElementById("n-attended-days")?.value || 0),
        PREV_ATTENDANCE_PERC: parseFloat(document.getElementById("n-prev-att")?.value || 0),
        BEHAVIOR_SCORE_10: parseFloat(document.getElementById("n-behavior")?.value || 0),
        MENTOR_EMAIL: document.getElementById("n-mentor-email")?.value || ""
    };

    Object.assign(student, sems);
    currentStudent = student;
    await analyseStudent(student);
}

/* ===========================================================
   STUDENT ANALYSIS
   =========================================================== */
async function analyseStudent(student) {
    showLoading("Analysing student...");
    try {
        const result = await api("/api/student/predict", "POST", student);
        hideLoading();

        if (!result.success) {
            alert(result.message || "Prediction failed");
            return;
        }

        currentStudentResult = result;
        const reportDiv = document.getElementById("student-report");
        if (reportDiv) {
            reportDiv.classList.remove("hidden");
            renderStudentHeader(result);
            renderStudentCharts(result);
            renderStudentSummary(result);
        }
    } catch (error) {
        hideLoading();
        console.error("Analysis error:", error);
        alert("Analysis failed. Please try again.");
    }
}

/* ===========================================================
   RENDER STUDENT HEADER
   =========================================================== */
function renderStudentHeader(result) {
    const s = result.student;
    const f = result.features;
    const p = result.predictions;

    const basicDiv = document.getElementById("student-basic");
    if (basicDiv) {
        basicDiv.innerHTML = `
            <h2>${s.NAME} (${s.RNO})</h2>
            <p>Dept: <b>${s.DEPT}</b> • Year: <b>${s.YEAR}</b> • Semester: <b>${s.CURR_SEM}</b></p>
            <p>Internal: ${f.internal_pct.toFixed(1)}% • Attendance: ${f.attendance_pct.toFixed(1)}% • Behavior: ${f.behavior_pct.toFixed(1)}%</p>
        `;
    }

    const perf = document.getElementById("kpi-performance");
    const risk = document.getElementById("kpi-risk");
    const drop = document.getElementById("kpi-dropout");

    function labelClass(label, reverse = false) {
        if (label === "high") return reverse ? "kpi-bad" : "kpi-good";
        if (label === "low") return reverse ? "kpi-good" : "kpi-bad";
        return "kpi-medium";
    }

    if (perf) {
        perf.className = `kpi-pill ${labelClass(p.performance_label, false)}`;
        perf.innerHTML = `<i class="fa-solid fa-chart-line" style="font-size: 20px; margin-bottom: 8px; color: #1976d2;"></i><br>PERFORMANCE<br><b>${p.performance_label.toUpperCase()}</b><br>${f.performance_overall.toFixed(1)}%`;
    }
    if (risk) {
        risk.className = `kpi-pill ${labelClass(p.risk_label, true)}`;
        risk.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="font-size: 20px; margin-bottom: 8px; color: #ff9800;"></i><br>RISK<br><b>${p.risk_label.toUpperCase()}</b><br>${f.risk_score.toFixed(1)}%`;
    }
    if (drop) {
        drop.className = `kpi-pill ${labelClass(p.dropout_label, true)}`;
        drop.innerHTML = `<i class="fa-solid fa-user-xmark" style="font-size: 20px; margin-bottom: 8px; color: #f44336;"></i><br>DROPOUT<br><b>${p.dropout_label.toUpperCase()}</b><br>${f.dropout_score.toFixed(1)}%`;
    }

    const alertBtn = document.getElementById("alert-button");
    if (alertBtn) {
        if (result.need_alert) alertBtn.classList.remove("hidden");
        else alertBtn.classList.add("hidden");
    }
}

/* ===========================================================
   RENDER STUDENT CHARTS
   =========================================================== */
function renderStudentCharts(result) {
    const s = result.student;
    const f = result.features;
    const p = result.predictions;

    // 1. Semester Performance Trend (Scatter/Line Chart)
    const marks = [];
    const semLabels = [];
    const currSem = parseInt(s.CURR_SEM || s.curr_sem || 1);
    // Include all semesters up to current semester to show full academic journey
    for (let i = 1; i <= 8; i++) {
        let k = `SEM${i}`;
        let val = parseFloat(s[k] || 0);
        // Include semester if it has marks > 0, OR if it's before current semester
        if (val > 0 || i < currSem) {
            marks.push(val);
            semLabels.push(`Sem ${i}`);
        }
    }

    if (document.getElementById("st-chart-marks")) {
        if (marks.length > 0) {
            const layout = {
                ...window.defaultLayout,
                title: { text: "Semester-wise Marks (Scatter Plot)", font: { size: 18, color: '#1976d2' }, x: 0.5 },
                yaxis: { range: [0, 100], title: { text: 'Marks (%)' } },
                xaxis: { title: { text: 'Semesters' } },
                height: 400
            };

            const traceMode = marks.length === 1 ? "markers+text" : "lines+markers";
            const traces = [{
                x: semLabels, y: marks, type: "scatter", mode: traceMode,
                line: { width: 4, color: '#1976d2', shape: 'spline' },
                marker: {
                    size: 14, color: '#1976d2', symbol: 'circle',
                    line: { width: 2, color: '#0d47a1' }
                },
                fill: 'tozeroy', fillcolor: 'rgba(25, 118, 210, 0.1)',
                text: marks.map(m => m.toFixed(1) + '%'),
                textposition: 'top center',
                textfont: { size: 12, color: '#1976d2' },
                hovertemplate: '<b>%{x}</b><br>Marks: %{y:.1f}%<extra></extra>'
            }];

            Plotly.newPlot("st-chart-marks", traces, layout, window.defaultChartConfig);
        } else {
            // No semester marks available - show a message
            document.getElementById("st-chart-marks").innerHTML = `
                <div style="display:flex;align-items:center;justify-content:center;height:400px;color:#999;font-size:16px;">
                    <div style="text-align:center;">
                        <i class="fa-solid fa-chart-line" style="font-size:48px;margin-bottom:12px;color:#ccc;"></i>
                        <p>No semester marks available yet</p>
                    </div>
                </div>`;
        }
    }

    // 2. Performance Breakdown (Donut Chart)
    if (document.getElementById("st-chart-donut")) {
        const layout = {
            ...window.defaultLayout,
            title: { text: "Performance Factor Analysis", font: { size: 18, color: '#1976d2' }, x: 0.5 },
            showlegend: true, height: 400
        };

        Plotly.newPlot("st-chart-donut", [{
            values: [f.past_avg, f.internal_pct, f.attendance_pct, f.behavior_pct],
            labels: ["Academic History", "Current Internals", "Attendance Rate", "Behavior Score"],
            type: "pie", hole: 0.5,
            marker: { colors: ['#2196F3', '#4CAF50', '#FF9800', '#9C27B0'] },
            textinfo: 'label+percent',
            hovertemplate: '<b>%{label}</b><br>Score: %{value:.1f}%<br>Share: %{percent}<extra></extra>'
        }], layout, window.defaultChartConfig);
    }

    // 3. Risk Assessment Radar
    if (document.getElementById("st-chart-radar")) {
        const layout = {
            ...window.defaultLayout,
            title: { text: "Multi-Dimensional Risk Profile", font: { size: 18, color: '#1976d2' }, x: 0.5 },
            polar: { radialaxis: { visible: true, range: [0, 100] } },
            height: 400
        };

        Plotly.newPlot("st-chart-radar", [{
            type: "scatterpolar",
            r: [f.performance_overall, 100 - f.risk_score, f.attendance_pct, f.behavior_pct, f.internal_pct],
            theta: ["Academic Performance", "Stability Index", "Attendance", "Behavior", "Current Progress"],
            fill: "toself", fillcolor: 'rgba(25, 118, 210, 0.2)',
            line: { color: '#1976d2', width: 3 },
            marker: { color: '#1976d2', size: 8 }
        }], layout, window.defaultChartConfig);
    }

    // 4. Comparative Metrics (Horizontal Bar)
    if (document.getElementById("st-chart-scores")) {
        const layout = {
            ...window.defaultLayout,
            title: { text: "Performance vs Risk Indicators", font: { size: 18, color: '#1976d2' }, x: 0.5 },
            xaxis: { range: [0, 100], title: { text: 'Score (%)' } },
            yaxis: { title: { text: 'Metrics' } },
            height: 400
        };

        Plotly.newPlot("st-chart-scores", [{
            y: ["Performance", "Attendance", "Behavior", "Risk Level", "Dropout Risk"],
            x: [f.performance_overall, f.attendance_pct, f.behavior_pct, 100 - f.risk_score, 100 - f.dropout_score],
            type: "bar", orientation: 'h',
            marker: { color: ['#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#F44336'] },
            hovertemplate: '<b>%{y}</b><br>Score: %{x:.1f}%<extra></extra>'
        }], layout, window.defaultChartConfig);
    }

    // 5. Performance Gauge
    if (document.getElementById("st-chart-gauge-perf")) {
        const layout = {
            ...window.defaultLayout,
            title: { text: "Overall Performance Gauge", font: { size: 18, color: '#1976d2' }, x: 0.5 },
            height: 400
        };

        Plotly.newPlot("st-chart-gauge-perf", [{
            type: "indicator", mode: "gauge+number+delta",
            value: f.performance_overall,
            delta: { reference: 70 },
            gauge: {
                axis: { range: [0, 100] },
                steps: [
                    { range: [0, 40], color: "#ffcdd2" },
                    { range: [40, 70], color: "#fff9c4" },
                    { range: [70, 100], color: "#c8e6c9" }
                ],
                bar: { color: "#1976d2" },
                threshold: { line: { color: "red", width: 4 }, thickness: 0.75, value: 70 }
            }
        }], layout, window.defaultChartConfig);
    }

    // 6. Attendance Gauge
    if (document.getElementById("st-chart-gauge-att")) {
        const layout = {
            ...window.defaultLayout,
            title: { text: "Attendance Performance", font: { size: 18, color: '#1976d2' }, x: 0.5 },
            height: 400
        };

        Plotly.newPlot("st-chart-gauge-att", [{
            type: "indicator", mode: "gauge+number",
            value: f.attendance_pct,
            gauge: {
                axis: { range: [0, 100] },
                steps: [
                    { range: [0, 75], color: "#ffcdd2" },
                    { range: [75, 100], color: "#c8e6c9" }
                ],
                bar: { color: "#00897b" },
                threshold: { line: { color: "orange", width: 4 }, thickness: 0.75, value: 75 }
            }
        }], layout, window.defaultChartConfig);
    }
}

/* ===========================================================
   RENDER STUDENT SUMMARY
   =========================================================== */
function renderStudentSummary(result) {
    const f = result.features;
    const p = result.predictions;
    const s = result.student;

    const summaryDiv = document.getElementById("st-summary-text");
    const suggUl = document.getElementById("st-suggestions");

    if (!summaryDiv || !suggUl) return;

    suggUl.innerHTML = "";

    let alertNotice = "";
    if (result.need_alert) {
        alertNotice = `<div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 12px; border-radius: 8px; margin-bottom: 16px; color: #856404;">
            <strong><i class="fa-solid fa-triangle-exclamation"></i> Mentor Alert Required:</strong> This student needs immediate attention and support.
        </div>`;
    }

    // Enhanced AI-powered summary
    const performanceInsight = f.performance_overall >= 80 ? "exceptional academic performance" :
        f.performance_overall >= 70 ? "good academic standing" :
            f.performance_overall >= 60 ? "moderate performance with room for improvement" :
                "concerning academic performance requiring immediate intervention";

    const attendanceInsight = f.attendance_pct >= 90 ? "excellent attendance record" :
        f.attendance_pct >= 80 ? "good attendance pattern" :
            f.attendance_pct >= 70 ? "irregular attendance needing attention" :
                "poor attendance requiring urgent intervention";

    const riskAssessment = p.risk_label === 'high' ? "high-risk student requiring comprehensive support" :
        p.risk_label === 'medium' ? "moderate risk with preventive measures needed" :
            "low-risk student with stable academic trajectory";

    summaryDiv.innerHTML = `
        ${alertNotice}
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <h4 style="color: #1976d2; margin: 0 0 10px 0;"><i class="fa-solid fa-brain"></i> AI-Powered Analysis</h4>
            <p><strong>${s.NAME}</strong> demonstrates ${performanceInsight} with ${attendanceInsight}. 
            Current assessment indicates this is a ${riskAssessment}.</p>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 15px;">
            <div style="background: #e3f2fd; padding: 12px; border-radius: 8px; text-align: center;">
                <i class="fa-solid fa-chart-line" style="font-size: 24px; color: #1976d2; margin-bottom: 8px;"></i>
                <div><strong>Performance Score</strong></div>
                <div style="font-size: 18px; font-weight: bold; color: #1976d2;">${f.performance_overall.toFixed(1)}%</div>
            </div>
            <div style="background: #fff3e0; padding: 12px; border-radius: 8px; text-align: center;">
                <i class="fa-solid fa-calendar-check" style="font-size: 24px; color: #ff9800; margin-bottom: 8px;"></i>
                <div><strong>Attendance Rate</strong></div>
                <div style="font-size: 18px; font-weight: bold; color: #ff9800;">${f.attendance_pct.toFixed(1)}%</div>
            </div>
            <div style="background: #f3e5f5; padding: 12px; border-radius: 8px; text-align: center;">
                <i class="fa-solid fa-user-check" style="font-size: 24px; color: #9c27b0; margin-bottom: 8px;"></i>
                <div><strong>Behavior Score</strong></div>
                <div style="font-size: 18px; font-weight: bold; color: #9c27b0;">${f.behavior_pct.toFixed(1)}%</div>
            </div>
        </div>
    `;

    function addSuggestion(icon, text, priority = 'normal') {
        const li = document.createElement("li");
        const priorityColor = priority === 'critical' ? '#f44336' : priority === 'high' ? '#ff9800' : '#1976d2';
        li.innerHTML = `<i class="fa-solid ${icon}" style="color: ${priorityColor}; margin-right: 8px;"></i>${text}`;
        li.style.marginBottom = '8px';
        suggUl.appendChild(li);
    }

    // Enhanced AI-driven suggestions
    if (p.performance_label === "poor") {
        addSuggestion('fa-exclamation-triangle', '<strong>CRITICAL INTERVENTION:</strong> Schedule emergency academic counseling within 24 hours', 'critical');
        addSuggestion('fa-user-graduate', 'Implement intensive 1-on-1 tutoring program with subject matter experts', 'critical');
        addSuggestion('fa-users', 'Arrange peer mentoring with top-performing students from same department', 'high');
        addSuggestion('fa-phone', 'Contact parents/guardians immediately to discuss comprehensive support plan', 'critical');
    } else if (p.performance_label === "medium") {
        addSuggestion('fa-calendar-alt', 'Schedule bi-weekly progress monitoring sessions with academic advisor', 'high');
        addSuggestion('fa-book', 'Provide targeted study materials and practice resources for weak areas', 'normal');
        addSuggestion('fa-clock', 'Create structured study schedule with specific daily and weekly goals', 'normal');
    } else {
        addSuggestion('fa-trophy', '<strong>Excellent Performance!</strong> Consider advanced learning opportunities and leadership roles', 'normal');
        addSuggestion('fa-star', 'Nominate for academic excellence programs and scholarship opportunities', 'normal');
    }

    if (p.risk_label === "high") {
        addSuggestion('fa-shield-alt', 'Assign dedicated mentor for weekly one-on-one support sessions', 'high');
        addSuggestion('fa-brain', 'Conduct comprehensive learning style assessment for personalized approach', 'high');
        addSuggestion('fa-chart-line', 'Implement daily progress tracking with immediate feedback mechanisms', 'high');
    }

    if (p.dropout_label === "high") {
        addSuggestion('fa-life-ring', '<strong>DROPOUT PREVENTION:</strong> Activate comprehensive retention strategy immediately', 'critical');
        addSuggestion('fa-home', 'Engage family support system - schedule parent conference within 48 hours', 'critical');
        addSuggestion('fa-heart', 'Connect with student counseling services for emotional and motivational support', 'high');
    }

    if (f.attendance_pct < 60) {
        addSuggestion('fa-calendar-times', '<strong>ATTENDANCE CRISIS:</strong> Investigate underlying causes (health, transport, family)', 'critical');
        addSuggestion('fa-bell', 'Implement daily attendance monitoring with immediate absence follow-up', 'high');
    } else if (f.attendance_pct < 75) {
        addSuggestion('fa-calendar-plus', 'Create attendance improvement plan with weekly targets and incentives', 'high');
        addSuggestion('fa-mobile-alt', 'Set up automated attendance alerts for parents/guardians', 'normal');
    }

    if (f.internal_pct < 40) {
        addSuggestion('fa-search', 'Conduct diagnostic assessment to identify specific knowledge gaps', 'high');
        addSuggestion('fa-chalkboard-teacher', 'Provide intensive subject-specific tutoring with qualified instructors', 'high');
    } else if (f.internal_pct < 60) {
        addSuggestion('fa-clipboard-check', 'Increase frequency of formative assessments with immediate feedback', 'normal');
        addSuggestion('fa-lightbulb', 'Focus on concept clarity through visual aids and practical examples', 'normal');
    }

    // Positive reinforcement
    if (f.performance_overall >= 80) {
        addSuggestion('fa-medal', 'Recognize outstanding performance - consider for academic awards and honors', 'normal');
        addSuggestion('fa-hands-helping', 'Encourage peer mentoring role to help struggling classmates', 'normal');
    }

    // Behavioral insights
    if (f.behavior_pct >= 80) {
        addSuggestion('fa-thumbs-up', 'Excellent behavior - consider for leadership and responsibility roles', 'normal');
    } else if (f.behavior_pct < 60) {
        addSuggestion('fa-comments', 'Address behavioral concerns through counseling and mentorship', 'high');
    }
}

/* ===========================================================
   MENTOR ALERT EMAIL
   =========================================================== */
async function triggerAlertEmail() {
    if (!currentStudentResult) return;
    await sendAlertEmailDirect();
}

function showAlertModal() {
    const s = currentStudentResult.student;
    const p = currentStudentResult.predictions;
    const f = currentStudentResult.features;

    const modal = createAlertModal();

    // Populate student info
    modal.querySelector('.student-name').textContent = s.NAME;
    modal.querySelector('.student-rno').textContent = s.RNO;
    modal.querySelector('.student-dept').textContent = s.DEPT;
    modal.querySelector('.student-year').textContent = `Year ${s.YEAR}, Semester ${s.CURR_SEM}`;

    // Populate metrics
    modal.querySelector('.perf-value').textContent = `${f.performance_overall.toFixed(1)}%`;
    modal.querySelector('.perf-label-text').textContent = p.performance_label.toUpperCase();
    modal.querySelector('.risk-value').textContent = `${f.risk_score.toFixed(1)}%`;
    modal.querySelector('.risk-label-text').textContent = p.risk_label.toUpperCase();
    modal.querySelector('.dropout-value').textContent = `${f.dropout_score.toFixed(1)}%`;
    modal.querySelector('.dropout-label-text').textContent = p.dropout_label.toUpperCase();

    document.body.appendChild(modal);
    modal.classList.add('show');
}

function createAlertModal() {
    const modal = document.createElement('div');
    modal.className = 'alert-modal';
    modal.innerHTML = `
        <div class="alert-card">
            <div class="alert-header">
                <button class="alert-close" onclick="closeAlertModal()">&times;</button>
                <h2>Student Alert Notification</h2>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">Immediate Mentor Attention Required</p>
            </div>
            <div class="alert-body">
                <div class="student-info-card">
                    <div class="student-info-row">
                        <span class="student-info-label"><i class="fa-solid fa-user"></i> Student Name:</span>
                        <span class="student-info-value student-name"></span>
                    </div>
                    <div class="student-info-row">
                        <span class="student-info-label"><i class="fa-solid fa-id-card"></i> Register Number:</span>
                        <span class="student-info-value student-rno"></span>
                    </div>
                    <div class="student-info-row">
                        <span class="student-info-label"><i class="fa-solid fa-building-columns"></i> Department:</span>
                        <span class="student-info-value student-dept"></span>
                    </div>
                    <div class="student-info-row">
                        <span class="student-info-label"><i class="fa-solid fa-graduation-cap"></i> Academic Level:</span>
                        <span class="student-info-value student-year"></span>
                    </div>
                </div>
                
                <div class="alert-metrics">
                    <div class="metric-card performance">
                        <div class="metric-icon"><i class="fa-solid fa-bullseye"></i></div>
                        <div class="metric-label">Performance</div>
                        <div class="metric-value perf-value"></div>
                        <div class="metric-label perf-label-text"></div>
                    </div>
                    <div class="metric-card risk">
                        <div class="metric-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
                        <div class="metric-label">Risk Level</div>
                        <div class="metric-value risk-value"></div>
                        <div class="metric-label risk-label-text"></div>
                    </div>
                    <div class="metric-card dropout">
                        <div class="metric-icon"><i class="fa-solid fa-exclamation-triangle"></i></div>
                        <div class="metric-label">Dropout Risk</div>
                        <div class="metric-value dropout-value"></div>
                        <div class="metric-label dropout-label-text"></div>
                    </div>
                </div>
                
                <div class="alert-actions">
                    <button class="alert-btn primary" onclick="sendAlertEmail()">
                        <i class="fa-solid fa-paper-plane"></i>
                        Send Alert Email
                    </button>
                    <button class="alert-btn secondary" onclick="closeAlertModal()">
                        <i class="fa-solid fa-times"></i>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;
    return modal;
}



async function sendAlertEmailDirect() {
    const s = currentStudentResult.student;
    const p = currentStudentResult.predictions;
    const f = currentStudentResult.features;

    const email = "ashokkumarboya999@gmail.com";

    const payload = {
        email: email,
        student: s,
        predictions: p,
        features: f
    };

    showLoading("Sending mentor alert...");
    try {
        const res = await api("/api/send-alert", "POST", payload);
        hideLoading();

        if (res.success) {
            alert("✅ Mentor alert sent successfully!");
        } else {
            alert("❌ Failed to send alert: " + (res.message || "Unknown error"));
        }
    } catch (error) {
        hideLoading();
        alert("❌ Failed to send alert due to network error.");
    }
}

function getAlertLevel(predictions, features) {
    const p = predictions;
    const f = features;

    if (p.performance_label === 'poor' || p.risk_label === 'high' || p.dropout_label === 'high' || f.attendance_pct < 60) {
        return {
            level: 'critical',
            title: 'CRITICAL ALERT',
            urgency: 'IMMEDIATE ACTION REQUIRED',
            icon: '🚨'
        };
    } else if (p.performance_label === 'medium' || p.risk_label === 'medium' || f.attendance_pct < 75) {
        return {
            level: 'high',
            title: 'HIGH PRIORITY ALERT',
            urgency: 'URGENT ATTENTION NEEDED',
            icon: '⚠️'
        };
    } else {
        return {
            level: 'medium',
            title: 'MONITORING ALERT',
            urgency: 'REGULAR FOLLOW-UP',
            icon: '📋'
        };
    }
}

function getActionItems(predictions, features, level) {
    const p = predictions;
    const f = features;
    const items = [];

    if (level === 'critical') {
        items.push(
            { icon: '🚨', text: 'Schedule EMERGENCY counseling session within 12 hours' },
            { icon: '📞', text: 'Contact parents/guardians immediately' },
            { icon: '👥', text: 'Assign dedicated mentor for daily check-ins' },
            { icon: '📋', text: 'Develop intensive intervention strategy' }
        );
    } else if (level === 'high') {
        items.push(
            { icon: '⚠️', text: 'Schedule counseling session within 24 hours' },
            { icon: '📊', text: 'Conduct comprehensive academic assessment' },
            { icon: '🎯', text: 'Implement personalized support plan' },
            { icon: '📈', text: 'Establish weekly progress monitoring' }
        );
    } else if (level === 'medium') {
        items.push(
            { icon: '📅', text: 'Schedule bi-weekly mentoring sessions' },
            { icon: '📚', text: 'Provide targeted academic resources' },
            { icon: '🔍', text: 'Monitor attendance and performance trends' },
            { icon: '💡', text: 'Offer study skills workshops' }
        );
    } else {
        items.push(
            { icon: '✅', text: 'Continue regular monitoring schedule' },
            { icon: '🎉', text: 'Acknowledge positive performance' },
            { icon: '🚀', text: 'Explore advanced learning opportunities' },
            { icon: '👨‍🏫', text: 'Consider peer mentoring roles' }
        );
    }

    if (f.attendance_pct < 75) {
        items.push({ icon: '📅', text: 'Address attendance issues immediately' });
    }
    if (f.internal_pct < 60) {
        items.push({ icon: '📝', text: 'Provide intensive academic support' });
    }

    return items;
}

function getTimelineMessage(level) {
    switch (level) {
        case 'critical':
            return 'IMMEDIATE RESPONSE REQUIRED - Contact student within 12 hours and report back within 24 hours';
        case 'high':
            return 'URGENT RESPONSE REQUIRED - Initial contact within 24 hours, intervention plan within 48 hours';
        case 'medium':
            return 'TIMELY RESPONSE REQUIRED - Contact within 48 hours, assessment within 1 week';
        default:
            return 'ROUTINE FOLLOW-UP - Schedule check-in within 1 week, continue regular monitoring';
    }
}

/* ===========================================================
   UTILITY FUNCTIONS
   =========================================================== */
function exportStudentCSV() {
    if (!currentStudentResult) return;

    const s = currentStudentResult.student;
    const f = currentStudentResult.features;
    const p = currentStudentResult.predictions;

    const data = {
        Name: s.NAME,
        RNO: s.RNO,
        Dept: s.DEPT,
        Year: s.YEAR,
        Semester: s.CURR_SEM,
        Internal: f.internal_pct,
        Attendance: f.attendance_pct,
        Behavior: f.behavior_pct,
        Performance: f.performance_overall,
        Risk: f.risk_score,
        Dropout: f.dropout_score,
        PerformanceLabel: p.performance_label,
        RiskLabel: p.risk_label,
        DropoutLabel: p.dropout_label
    };

    const csv = Object.keys(data).join(",") + "\n" + Object.values(data).join(",");
    downloadCSV(csv, `student_${s.RNO}.csv`);
}

function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function resetStudentMode() {
    const reportDiv = document.getElementById("student-report");
    if (reportDiv) reportDiv.classList.add("hidden");
}

/* ===========================================================
   GROUP ANALYTICS FUNCTIONS
   =========================================================== */
function fillGroupTable(tableId, rows, includeDept = false) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody) {
        console.warn(`Table tbody not found for ${tableId}`);
        return;
    }

    tbody.innerHTML = "";

    if (!rows || rows.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="${includeDept ? 12 : 11}" style="text-align: center; padding: 30px; color: #666;">
            <i class="fa-solid fa-database" style="font-size: 24px; margin-bottom: 10px; display: block;"></i>
            No data available for this selection
        </td>`;
        tbody.appendChild(tr);
        return;
    }

    rows.forEach(r => {
        try {
            const tr = document.createElement("tr");

            // Create enhanced label spans with colors
            const perfLabel = `<span class="label-${r.performance_label || 'unknown'}">${(r.performance_label || 'unknown').toUpperCase()}</span>`;
            const riskLabel = `<span class="label-${r.risk_label || 'unknown'}">${(r.risk_label || 'unknown').toUpperCase()}</span>`;
            const dropLabel = `<span class="label-${r.dropout_label || 'unknown'}">${(r.dropout_label || 'unknown').toUpperCase()}</span>`;

            tr.innerHTML = `
                <td class="student-rno">${r.RNO || ''}</td>
                <td class="student-name">${r.NAME || ''}</td>
                ${includeDept ? `<td><span class="student-dept">${r.DEPT || ''}</span></td>` : ""}
                <td>${r.YEAR || 0}</td>
                <td>${r.CURR_SEM || 0}</td>
                <td>${perfLabel}</td>
                <td>${riskLabel}</td>
                <td>${dropLabel}</td>
                <td>${(r.performance_overall || 0).toFixed(1)}%</td>
                <td>${(r.risk_score || 0).toFixed(1)}%</td>
                <td>${(r.dropout_score || 0).toFixed(1)}%</td>
                <td>
                    <button class="view-btn" onclick="viewStudentFromTable('${r.RNO}')" style="padding: 6px 12px; font-size: 11px;">
                        <i class="fa-solid fa-eye"></i> View
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        } catch (error) {
            console.warn(`Error rendering table row:`, error);
        }
    });
}

async function viewStudentFromTable(rno) {
    try {
        showLoading('Loading student analytics...');
        const result = await api('/api/student/search', 'POST', { rno });
        hideLoading();

        if (result.success) {
            currentStudent = result.student;
            await analyseStudent(currentStudent);

            // Switch to student mode
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            const studentBtn = document.querySelector('[data-mode="student"]');
            if (studentBtn) studentBtn.classList.add('active');

            document.querySelectorAll('.mode-section').forEach(sec => {
                sec.classList.remove('active');
                sec.classList.add('hidden');
            });

            const studentMode = document.getElementById('mode-student');
            if (studentMode) {
                studentMode.classList.remove('hidden');
                studentMode.classList.add('active');
            }

            // Scroll to top smoothly
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            alert('Failed to load student details: ' + result.message);
        }
    } catch (error) {
        hideLoading();
        console.error('Error loading student:', error);
        alert('Failed to load student analytics.');
    }
}

function renderLabelDonut(elementId, counts, title) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const labels = Object.keys(counts || {});
    const values = Object.values(counts || {});

    if (labels.length === 0 || values.every(v => v === 0)) {
        element.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 400px; color: #666; font-size: 16px;">No data available</div>`;
        return;
    }

    const layout = {
        ...window.defaultLayout,
        title: {
            text: title,
            font: { size: 18, color: '#1976d2' },
            x: 0.5
        },
        showlegend: true,
        legend: {
            orientation: 'h',
            y: -0.1,
            x: 0.5,
            xanchor: 'center'
        },
        height: 450
    };

    Plotly.newPlot(elementId, [{
        labels: labels,
        values: values,
        type: "pie",
        hole: 0.4,
        marker: {
            colors: ['#4CAF50', '#FF9800', '#F44336', '#2196F3', '#9C27B0'],
            line: { color: '#fff', width: 2 }
        },
        textinfo: 'label+percent',
        textposition: 'auto',
        hovertemplate: '<b>%{label}</b><br>Count: %{value}<br>Percentage: %{percent}<extra></extra>'
    }], layout, window.defaultChartConfig);
}

function render3DScatter(elementId, scores, title) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const perfScores = scores?.performance || [];
    const riskScores = scores?.risk || [];
    const dropScores = scores?.dropout || [];

    if (perfScores.length === 0) {
        element.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 400px; color: #666; font-size: 16px;">No data available</div>`;
        return;
    }

    const layout = {
        ...window.defaultLayout,
        title: {
            text: title,
            font: { size: 18, color: '#1976d2' },
            x: 0.5
        },
        scene: {
            xaxis: {
                title: { text: "Performance Score", font: { size: 14 } },
                backgroundcolor: "rgba(255,255,255,0.8)",
                gridcolor: "rgba(255,255,255,0.8)",
                showbackground: true,
                zerolinecolor: "rgba(255,255,255,0.8)"
            },
            yaxis: {
                title: { text: "Risk Score", font: { size: 14 } },
                backgroundcolor: "rgba(255,255,255,0.8)",
                gridcolor: "rgba(255,255,255,0.8)",
                showbackground: true,
                zerolinecolor: "rgba(255,255,255,0.8)"
            },
            zaxis: {
                title: { text: "Dropout Score", font: { size: 14 } },
                backgroundcolor: "rgba(255,255,255,0.8)",
                gridcolor: "rgba(255,255,255,0.8)",
                showbackground: true,
                zerolinecolor: "rgba(255,255,255,0.8)"
            },
            camera: {
                eye: { x: 1.5, y: 1.5, z: 1.5 }
            }
        },
        height: 500
    };

    Plotly.newPlot(elementId, [{
        x: perfScores,
        y: riskScores,
        z: dropScores,
        mode: "markers",
        type: "scatter3d",
        marker: {
            size: 6,
            color: perfScores,
            colorscale: 'Viridis',
            showscale: true,
            colorbar: {
                title: "Performance",
                titleside: "right",
                titlefont: { size: 14 }
            },
            line: { color: 'rgba(255,255,255,0.8)', width: 1 }
        },
        hovertemplate: '<b>Student Data</b><br>Performance: %{x:.1f}<br>Risk: %{y:.1f}<br>Dropout: %{z:.1f}<extra></extra>'
    }], layout, window.defaultChartConfig);
}

async function analyseDepartment() {
    const deptSelect = document.getElementById("d-dept");
    const yearSelect = document.getElementById("d-year");

    if (!deptSelect || !yearSelect) {
        alert("Department and year selection not found");
        return;
    }

    const dept = deptSelect.value;
    const year = yearSelect.value;

    if (!dept) {
        alert("Please select a department");
        return;
    }

    showLoading("Analysing department...");

    try {
        // Get department-specific data
        const res = await api("/api/department/analyze", "POST", { dept: dept, year: year });
        // Get aggregated data for proper plots
        const aggRes = await api("/api/analytics/aggregated", "POST", { type: "department" });

        hideLoading();

        if (!res || !res.success) {
            alert(res?.message || "Department analysis failed. Please try again.");
            return;
        }

        const reportDiv = document.getElementById("dept-report");
        if (reportDiv) reportDiv.classList.remove("hidden");

        const st = res.stats || {};
        const elements = {
            "dept-kpi-total": `<i class="fa-solid fa-users"></i> Total Students<br><b>${st.total_students || 0}</b>`,
            "dept-kpi-high-perf": `<i class="fa-solid fa-graduation-cap"></i> High Performers<br><b>${st.high_performers || 0}</b>`,
            "dept-kpi-high-risk": `<i class="fa-solid fa-triangle-exclamation"></i> High Risk<br><b>${st.high_risk || 0}</b>`,
            "dept-kpi-high-drop": `<i class="fa-solid fa-user-xmark"></i> High Dropout<br><b>${st.high_dropout || 0}</b>`
        };

        Object.entries(elements).forEach(([id, html]) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = html;
        });

        fillGroupTable("dept-table", (res.table || []).slice(0, 120));

        // Use aggregated data for correct plots
        if (aggRes && aggRes.success) {
            renderDepartmentCharts(aggRes.data, res, dept);
        } else {
            // Fallback to basic charts
            renderLabelDonut("dept-chart-perf-donut", res.label_counts?.performance || {}, "Performance Distribution");
            renderLabelDonut("dept-chart-risk-donut", res.label_counts?.risk || {}, "Risk Distribution");
            renderLabelDonut("dept-chart-drop-donut", res.label_counts?.dropout || {}, "Dropout Distribution");
        }

        render3DScatter("dept-chart-3d", res.scores || { performance: [], risk: [], dropout: [] }, "3D Performance-Risk-Dropout");

        setTimeout(() => {
            addDepartmentDrilldownHandlers(dept, year);
        }, 1000);

        const summaryEl = document.getElementById("dept-summary");
        if (summaryEl) {
            summaryEl.innerHTML = `
                <p>Total students analysed: <b>${st.total_students || 0}</b></p>
                <p>Avg Performance: <b>${st.avg_performance || 0}%</b></p>
                <p>High performers: <b>${st.high_performers || 0}</b> • High risk: <b>${st.high_risk || 0}</b> • High dropout: <b>${st.high_dropout || 0}</b></p>`;
        }
    } catch (error) {
        hideLoading();
        console.error("Department analysis error:", error);
        alert("Department analysis failed due to network error. Please try again.");
    }
}

function renderDepartmentCharts(aggData, localData, selectedDept) {
    const students = localData.table || [];

    // 1. Sunburst Chart: Year -> Performance Label
    if (document.getElementById("dept-chart-perf-donut")) {
        // Aggregating data for Sunburst
        const hierarchy = {};
        students.forEach(s => {
            const y = `Year ${s.YEAR}`;
            const p = s.performance_label || 'Unknown';
            if (!hierarchy[y]) hierarchy[y] = {};
            if (!hierarchy[y][p]) hierarchy[y][p] = 0;
            hierarchy[y][p]++;
        });

        const labels = ["Department"];
        const parents = [""];
        const values = [students.length];
        const colors = ["#E3F2FD"]; // Root color

        Object.keys(hierarchy).forEach(year => {
            labels.push(year);
            parents.push("Department");
            let yearTotal = 0;
            Object.values(hierarchy[year]).forEach(v => yearTotal += v);
            values.push(yearTotal);
            colors.push("#64B5F6"); // Year color

            Object.keys(hierarchy[year]).forEach(perf => {
                labels.push(`${perf} (${year})`);
                parents.push(year);
                values.push(hierarchy[year][perf]);
                // Color mapping for labels
                if (perf.includes('high')) colors.push("#4CAF50");
                else if (perf.includes('medium') || perf.includes('normal')) colors.push("#FF9800");
                else colors.push("#F44336");
            });
        });

        const layout = {
            ...window.defaultLayout,
            title: { text: "Performance Hierarchy (Year -> Label)", font: { size: 16, color: '#1976d2' } },
            margin: { l: 0, r: 0, b: 0, t: 40 }
        };

        try {
            Plotly.newPlot("dept-chart-perf-donut", [{
                type: "sunburst",
                labels: labels, parents: parents, values: values,
                branchvalues: "total",
                marker: { line: { width: 2 } },
                hovertemplate: '<b>%{label}</b><br>Count: %{value}<br>Ratio: %{percentRoot:.1%}<extra></extra>'
            }], layout, window.defaultChartConfig);
        } catch (e) {
            console.error("Sunburst Error:", e);
            alert("Error rendering Sunburst chart: " + e.message);
        }
    }

    // 2. Heatmap: Attendance vs Performance
    if (document.getElementById("dept-chart-risk-donut")) {
        const x = students.map(s => s.attendance_pct || 0);
        const y = students.map(s => s.performance_overall || 0);

        const layout = {
            ...window.defaultLayout,
            title: { text: "Attendance vs Performance Density", font: { size: 16, color: '#1976d2' } },
            xaxis: { title: "Attendance (%)" },
            yaxis: { title: "Performance (%)" }
        };

        Plotly.newPlot("dept-chart-risk-donut", [{
            x: x, y: y,
            type: 'histogram2dcontour',
            colorscale: 'Blues',
            ncontours: 20,
            showscale: false
        }, {
            x: x, y: y,
            mode: 'markers',
            type: 'scatter',
            marker: { color: 'rgba(0,0,0,0.3)', size: 4 },
            showlegend: false
        }], layout, window.defaultChartConfig);
    }

    // 3. Funnel Chart: Assessment Stages
    if (document.getElementById("dept-chart-drop-donut")) {
        const total = students.length;
        const passedInternal = students.filter(s => (s.performance_overall || 0) > 40).length;
        const lowRisk = students.filter(s => (s.risk_label === 'low')).length;
        const highPerf = students.filter(s => (s.performance_label === 'high')).length;

        const layout = {
            ...window.defaultLayout,
            title: { text: "Student Success Funnel", font: { size: 16, color: '#1976d2' } },
            margin: { l: 80, r: 40 }
        };

        Plotly.newPlot("dept-chart-drop-donut", [{
            type: 'funnel',
            y: ['Total Students', 'Passed (>40%)', 'Low Risk', 'High Performers'],
            x: [total, passedInternal, lowRisk, highPerf],
            textinfo: "value+percent initial",
            marker: { color: ["#2196F3", "#4CAF50", "#8BC34A", "#1E88E5"] }
        }], layout, window.defaultChartConfig);
    }

    // 4. Box Plot: Performance by Year
    if (document.getElementById("dept-chart-3d")) {
        const traces = [];
        const years = [...new Set(students.map(s => s.YEAR))].sort();

        years.forEach(year => {
            const yearScores = students.filter(s => s.YEAR === year).map(s => s.performance_overall || 0);
            traces.push({
                y: yearScores,
                type: 'box',
                name: `Year ${year}`,
                boxpoints: false,
                marker: { color: '#1976d2' }
            });
        });

        const layout = {
            ...window.defaultLayout,
            title: { text: "Performance Spread by Year", font: { size: 16, color: '#1976d2' } },
            yaxis: { title: "Score (%)" },
            showlegend: false
        };

        Plotly.newPlot("dept-chart-3d", traces, layout, window.defaultChartConfig);
    }
}

async function analyseYear() {
    const yearSelect = document.getElementById("y-year");
    if (!yearSelect) {
        alert("Year selection not found");
        return;
    }

    const year = yearSelect.value;
    if (!year) {
        alert("Please select a year");
        return;
    }

    showLoading("Analysing year...");

    try {
        // Get year-specific data
        const res = await api("/api/year/analyze", "POST", { year: year });
        // Get aggregated data for proper plots
        const aggRes = await api("/api/analytics/aggregated", "POST", { type: "year" });

        hideLoading();

        if (!res || !res.success) {
            alert(res?.message || "Year analysis failed. Please try again.");
            return;
        }

        const reportDiv = document.getElementById("year-report");
        if (reportDiv) reportDiv.classList.remove("hidden");

        const st = res.stats || {};
        const elements = {
            "year-kpi-total": `<i class="fa-solid fa-users"></i> Total Students<br><b>${st.total_students || 0}</b>`,
            "year-kpi-avg-perf": `<i class="fa-solid fa-chart-line"></i> Avg Performance<br><b>${st.avg_performance || 0}%</b>`,
            "year-kpi-high-risk": `<i class="fa-solid fa-triangle-exclamation"></i> High Risk<br><b>${st.high_risk || 0}</b>`,
            "year-kpi-high-drop": `<i class="fa-solid fa-user-xmark"></i> High Dropout<br><b>${st.high_dropout || 0}</b>`
        };

        Object.entries(elements).forEach(([id, html]) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = html;
        });

        fillGroupTable("year-table", (res.table || []).slice(0, 120), true);

        // Use aggregated data for correct plots
        if (aggRes && aggRes.success) {
            renderYearCharts(aggRes.data, res, year);
        } else {
            // Fallback to basic charts
            renderLabelDonut("year-chart-perf-donut", res.label_counts?.performance || {}, "Performance Labels");
        }

        render3DScatter("year-chart-3d", res.scores || { performance: [], risk: [], dropout: [] }, "3D Performance-Risk-Dropout");

        setTimeout(() => {
            addYearDrilldownHandlers(year);
        }, 1000);

        // Performance spread analysis
        if (document.getElementById("year-chart-hist")) {
            // Use Violin Plot instead
            // Logic moved to renderYearCharts
        }

        const summaryEl = document.getElementById("year-summary");
        if (summaryEl) {
            summaryEl.innerHTML = `
                <p>Total students: <b>${st.total_students || 0}</b></p>
                <p>Avg Performance: <b>${st.avg_performance || 0}%</b></p>`;
        }
    } catch (error) {
        hideLoading();
        console.error("Year analysis error:", error);
        alert("Year analysis failed due to network error. Please try again.");
    }
}

function renderYearCharts(aggData, localData, selectedYear) {
    const students = localData.table || [];

    // 1. Top 5 Performers (Horizontal Bar)
    if (document.getElementById("year-rank-top")) {
        const topStudents = [...students]
            .sort((a, b) => b.performance_overall - a.performance_overall)
            .slice(0, 5)
            .reverse(); // For horizontal bar bottom-up

        const layout = {
            ...window.defaultLayout,
            title: { text: "🏆 Top 5 High Performers", font: { size: 16, color: '#2E7D32' } },
            margin: { l: 100, r: 20, t: 40, b: 40 },
            xaxis: { title: "Performance Score" }
        };

        try {
            Plotly.newPlot("year-rank-top", [{
                type: 'bar', orientation: 'h',
                x: topStudents.map(s => s.performance_overall),
                y: topStudents.map(s => s.NAME),
                marker: { color: '#66BB6A' },
                text: topStudents.map(s => s.performance_overall + "%"),
                textposition: 'auto',
                hovertemplate: '<b>%{y}</b><br>Score: %{x}%<br>Dept: ' + topStudents.map(s => s.DEPT) + '<extra></extra>'
            }], layout, window.defaultChartConfig);
        } catch (e) { console.error("Top 5 Error", e); }
    }

    // 2. Top 5 At-Risk Students (Horizontal Bar)
    if (document.getElementById("year-rank-risk")) {
        const riskStudents = [...students]
            .sort((a, b) => b.risk_score - a.risk_score)
            .slice(0, 5)
            .reverse();

        const layout = {
            ...window.defaultLayout,
            title: { text: "⚠️ Top 5 At-Risk Students", font: { size: 16, color: '#c62828' } },
            margin: { l: 100, r: 20, t: 40, b: 40 },
            xaxis: { title: "Risk Score" }
        };

        try {
            Plotly.newPlot("year-rank-risk", [{
                type: 'bar', orientation: 'h',
                x: riskStudents.map(s => s.risk_score),
                y: riskStudents.map(s => s.NAME),
                marker: { color: '#EF5350' },
                text: riskStudents.map(s => s.risk_score),
                textposition: 'auto',
                hovertemplate: '<b>%{y}</b><br>Risk Score: %{x}<br>Dept: ' + riskStudents.map(s => s.DEPT) + '<extra></extra>'
            }], layout, window.defaultChartConfig);
        } catch (e) { console.error("Risk 5 Error", e); }
    }

    // 3. Risk Composition (Donut) - Reusing 'year-chart-perf-donut'
    if (document.getElementById("year-chart-perf-donut")) {
        const riskCounts = localData.label_counts.risk || {};
        const labels = Object.keys(riskCounts);
        const values = Object.values(riskCounts);
        const colors = { 'low': '#66BB6A', 'medium': '#FFCA28', 'high': '#EF5350' };

        const layout = {
            ...window.defaultLayout,
            title: { text: "Overall Risk Distribution", font: { size: 16, color: '#1976d2' } }
        };

        try {
            Plotly.newPlot("year-chart-perf-donut", [{
                labels: labels, values: values, type: "pie", hole: 0.4,
                marker: { colors: labels.map(l => colors[l] || 'grey') },
                hovertemplate: '<b>%{label}</b>: %{value} students<extra></extra>'
            }], layout, window.defaultChartConfig);
        } catch (e) { console.error("Risk Donut Error", e); }
    }

    // 4. Magic Quadrant Scatter (Attendance vs Performance) - Reusing 'year-chart-scores'
    if (document.getElementById("year-chart-scores")) {
        const trace = {
            x: students.map(s => s.attendance_pct),
            y: students.map(s => s.performance_overall),
            text: students.map(s => s.NAME),
            mode: 'markers',
            marker: {
                size: 8,
                color: students.map(s => {
                    const depts = ["CSE", "ECE", "MECH", "CIVIL", "EEE", "IT"];
                    const colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b'];
                    return colors[depts.indexOf(s.DEPT) % colors.length] || '#333';
                }),
                opacity: 0.7
            },
            hovertemplate: '<b>%{text}</b><br>Att: %{x}%<br>Perf: %{y}%<extra></extra>'
        };

        const layout = {
            ...window.defaultLayout,
            title: { text: "Magic Quadrant (Attendance vs Marks)", font: { size: 16, color: '#1976d2' } },
            xaxis: { title: "Attendance %", range: [0, 100] },
            yaxis: { title: "Performance %", range: [0, 100] },
            shapes: [
                { type: 'line', x0: 75, x1: 75, y0: 0, y1: 100, line: { color: 'gray', dash: 'dot' } }, // Att Threshold
                { type: 'line', x0: 0, x1: 100, y0: 50, y1: 50, line: { color: 'gray', dash: 'dot' } }  // Perf Threshold
            ]
        };

        try {
            Plotly.newPlot("year-chart-scores", [trace], layout, window.defaultChartConfig);
        } catch (e) { console.error("Scatter Error", e); }
    }

    // 5. Dept Performance Comparison (Bar) - Reusing 'year-chart-3d'
    if (document.getElementById("year-chart-3d")) {
        const deptPerf = {};
        students.forEach(s => {
            if (!deptPerf[s.DEPT]) deptPerf[s.DEPT] = [];
            deptPerf[s.DEPT].push(s.performance_overall);
        });

        const depts = Object.keys(deptPerf);
        const avgPerf = depts.map(d => {
            const scores = deptPerf[d];
            return scores.reduce((a, b) => a + b, 0) / scores.length;
        });

        const layout = {
            ...window.defaultLayout,
            title: { text: "Avg Performance by Department", font: { size: 16, color: '#1976d2' } },
            xaxis: { title: "Department" },
            yaxis: { title: "Avg Score", range: [0, 100] }
        };

        try {
            Plotly.newPlot("year-chart-3d", [{
                x: depts, y: avgPerf, type: 'bar',
                marker: { color: '#42A5F5' },
                text: avgPerf.map(v => v.toFixed(1) + "%"),
                textposition: 'auto'
            }], layout, window.defaultChartConfig);
        } catch (e) { console.error("Dept Bar Error", e); }
    }

    // Clear unused chart container if exists
    if (document.getElementById("year-chart-hist")) {
        Plotly.purge("year-chart-hist");
        document.getElementById("year-chart-hist").innerHTML = "";
    }
}


async function analyseCollege() {
    showLoading("Analysing college...");

    try {
        // Get college data
        const res = await api("/api/college/analyze", "GET");
        // Get aggregated data for proper plots
        const aggRes = await api("/api/analytics/aggregated", "POST", { type: "college" });

        hideLoading();

        if (!res || !res.success) {
            alert(res?.message || "College analysis failed. Please try again.");
            return;
        }

        const reportDiv = document.getElementById("college-report");
        if (reportDiv) reportDiv.classList.remove("hidden");

        const st = res.stats || {};
        const elements = {
            "clg-kpi-total": `<i class="fa-solid fa-users"></i> Sample Size<br><b>${res.sample_size || 0}</b>`,
            "clg-kpi-avg-perf": `<i class="fa-solid fa-chart-line"></i> Avg Performance<br><b>${st.avg_performance || 0}%</b>`,
            "clg-kpi-high-risk": `<i class="fa-solid fa-triangle-exclamation"></i> High Risk<br><b>${st.high_risk || 0}</b>`,
            "clg-kpi-high-drop": `<i class="fa-solid fa-user-xmark"></i> High Dropout<br><b>${st.high_dropout || 0}</b>`
        };

        Object.entries(elements).forEach(([id, html]) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = html;
        });
        fillGroupTable("clg-table", (res.table || []).slice(0, 150), true);

        // Use aggregated data for correct plots
        if (aggRes && aggRes.success) {
            renderCollegeCharts(aggRes.data, res);
        } else {
            // Fallback to basic charts
            renderLabelDonut("clg-chart-perf-donut", res.label_counts?.performance || {}, "Performance");
            renderLabelDonut("clg-chart-risk-donut", res.label_counts?.risk || {}, "Risk");
        }

        render3DScatter("clg-chart-3d", res.scores || { performance: [], risk: [], dropout: [] }, "3D College Analysis");

        setTimeout(() => {
            addCollegeDrilldownHandlers();
        }, 1000);

        if (document.getElementById("clg-chart-box")) {
            // Box plot logic handled in renderCollegeCharts now
        }

        const summaryEl = document.getElementById("clg-summary");
        if (summaryEl) {
            summaryEl.innerHTML = `
                <p>Sample students: <b>${res.sample_size || 0}</b></p>
                <p>Total students: <b>${res.total_size || res.sample_size || 0}</b></p>
                <p>Avg performance: <b>${st.avg_performance || 0}%</b></p>`;
        }
    } catch (error) {
        hideLoading();
        console.error("College analysis error:", error);
        alert("College analysis failed due to network error. Please try again.");
    }
}

function renderCollegeCharts(aggData, localData) {
    const students = localData.table || [];

    // 1. Sankey Diagram: Dept -> Risk -> Dropout
    if (document.getElementById("clg-chart-perf-donut")) {
        // Prepare data for Sankey
        const depts = [...new Set(students.map(s => s.DEPT))];
        const risks = ['Low Risk', 'Normal Risk', 'High Risk'];

        // Nodes: Depts + Risks
        const labelList = [...depts, ...risks];
        const linkSource = [];
        const linkTarget = [];
        const linkValue = [];
        const linkColor = [];

        depts.forEach((dept, deptIdx) => {
            risks.forEach((risk, riskIdx) => {
                const count = students.filter(s => s.DEPT === dept && s.risk_label.toLowerCase().includes(risk.split(' ')[0].toLowerCase())).length;
                if (count > 0) {
                    linkSource.push(deptIdx);
                    linkTarget.push(depts.length + riskIdx);
                    linkValue.push(count);
                    linkColor.push(risk.includes('High') ? 'rgba(244, 67, 54, 0.4)' : 'rgba(76, 175, 80, 0.4)');
                }
            });
        });

        const layout = {
            ...window.defaultLayout,
            title: { text: "Student Flow: Dept → Risk Level", font: { size: 16, color: '#1976d2' } },
            font: { size: 10 }
        };

        Plotly.newPlot("clg-chart-perf-donut", [{
            type: "sankey",
            orientation: "h",
            node: {
                pad: 15, thickness: 20, line: { color: "black", width: 0.5 },
                label: labelList, color: "#90CAF9"
            },
            link: {
                source: linkSource, target: linkTarget, value: linkValue, color: linkColor
            }
        }], layout, window.defaultChartConfig);
    }

    // 2. Bubble Chart: Dept Size vs Performance vs Risk
    if (document.getElementById("clg-chart-risk-donut")) {
        const depts = Object.keys(aggData.dept_performance || {});
        const sizes = depts.map(d => aggData.risk_distribution?.[d]?.low + aggData.risk_distribution?.[d]?.normal + aggData.risk_distribution?.[d]?.high || 10);
        const perfs = depts.map(d => aggData.dept_performance?.[d] || 0);
        const risks = depts.map(d => aggData.dept_dropout_pct?.[d] || 0);

        const layout = {
            ...window.defaultLayout,
            title: { text: "Dept Health (Size vs Perf vs Dropout)", font: { size: 16, color: '#1976d2' } },
            xaxis: { title: "Avg Performance (%)" },
            yaxis: { title: "Dropout Risk (%)" }
        };

        Plotly.newPlot("clg-chart-risk-donut", [{
            x: perfs, y: risks,
            mode: 'markers',
            marker: {
                size: sizes, sizemode: 'area', sizeref: 2,
                color: perfs, colorscale: 'Viridis', showscale: true
            },
            text: depts,
            hovertemplate: '<b>%{text}</b><br>Perf: %{x}%<br>Dropout: %{y}%<br>Size: %{marker.size}<extra></extra>'
        }], layout, window.defaultChartConfig);
    }

    // 3. Parallel Categories
    if (document.getElementById("clg-chart-box")) {
        // Replacing the Box plot with ParCats
        // Need to enable ParCats in Plotly or use simple ParCoords
        // Let's use ParCats for Dept -> Year -> Perf Label

        const dims = [
            { label: 'Dept', values: students.map(s => s.DEPT) },
            { label: 'Year', values: students.map(s => `Year ${s.YEAR}`) },
            { label: 'Risk', values: students.map(s => s.risk_label) }
        ];

        const layout = {
            ...window.defaultLayout,
            title: { text: "Multi-dimensional Analysis", font: { size: 16, color: '#1976d2' } }
        };

        Plotly.newPlot("clg-chart-box", [{
            type: 'parcats',
            dimensions: dims,
            line: { color: 'blue' } // simplified coloring
        }], layout, window.defaultChartConfig);
    }
}




async function showStudentDrilldown(filterType, filterValue, scope, scopeValue) {
    showLoading("Loading student details...");

    try {
        const res = await api("/api/analytics/drilldown", "POST", {
            filter_type: filterType,
            filter_value: filterValue,
            scope: scope,
            scope_value: scopeValue
        });

        hideLoading();

        if (res.success) {
            displayStudentModal(res);
        } else {
            alert(res.message || "Failed to load student details");
        }
    } catch (error) {
        hideLoading();
        console.error("Drilldown error:", error);
        alert("Failed to load student details due to network error.");
    }
}

function displayStudentModal(res) {
    const modal = document.getElementById("student-modal");
    const title = document.getElementById("modal-title");
    const tbody = document.querySelector("#modal-student-table tbody");

    if (!modal || !title || !tbody) return;

    title.textContent = `${res.filter_info.value.toUpperCase()} ${res.filter_info.type.replace('_', ' ').toUpperCase()} Students (${res.count})`;

    tbody.innerHTML = "";

    res.students.forEach(student => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${student.RNO}</td>
            <td>${student.NAME}</td>
            <td>${student.DEPT}</td>
            <td>${student.YEAR}</td>
            <td><span class="label-${student.performance_label}">${student.performance_label}</span></td>
            <td><span class="label-${student.risk_label}">${student.risk_label}</span></td>
            <td><span class="label-${student.dropout_label}">${student.dropout_label}</span></td>
            <td><button class="secondary-btn" onclick="viewStudentFromModal('${student.RNO}')" style="padding: 4px 8px; font-size: 12px;">View Details</button></td>
        `;
        tbody.appendChild(tr);
    });

    modal.classList.remove("hidden");
}

function closeStudentModal() {
    const modal = document.getElementById("student-modal");
    if (modal) modal.classList.add("hidden");
}

async function viewStudentFromModal(rno) {
    closeStudentModal();

    try {
        const result = await api("/api/student/search", "POST", { rno });
        if (result.success) {
            currentStudent = result.student;
            await analyseStudent(currentStudent);

            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            const studentBtn = document.querySelector('[data-mode="student"]');
            if (studentBtn) studentBtn.classList.add('active');

            document.querySelectorAll('.mode-section').forEach(sec => {
                sec.classList.remove('active');
                sec.classList.add('hidden');
            });

            const studentMode = document.getElementById('mode-student');
            if (studentMode) {
                studentMode.classList.remove('hidden');
                studentMode.classList.add('active');
            }
        }
    } catch (error) {
        alert("Failed to load student details.");
    }
}

function exportDeptCSV() {
    exportTableToCSV("dept-table", "Department_Analytics_Report.csv");
}

function exportYearCSV() {
    exportTableToCSV("year-table", "Year_Analytics_Report.csv");
}

function exportCollegeCSV() {
    exportTableToCSV("clg-table", "College_Analytics_Report.csv");
}

/* ===========================================================
   BATCH UPLOAD FUNCTIONS
   =========================================================== */
let currentBatchMode = 'normalize';
let selectedFileNormalize = null;

function switchBatchMode(mode) {
    currentBatchMode = mode;

    const btnNormalize = document.getElementById('btn-normalize');
    const btnAnalytics = document.getElementById('btn-analytics');
    const normalizeContent = document.getElementById('normalize-content');
    const analyticsContent = document.getElementById('analytics-content');

    if (btnNormalize) btnNormalize.classList.toggle('active', mode === 'normalize');
    if (btnAnalytics) btnAnalytics.classList.toggle('active', mode === 'analytics');
    if (normalizeContent) normalizeContent.classList.toggle('hidden', mode !== 'normalize');
    if (analyticsContent) analyticsContent.classList.toggle('hidden', mode !== 'analytics');

    resetBatchUpload();
}

function resetBatchUpload() {
    selectedFileNormalize = null;
    const fileInput = document.getElementById('batch-file-normalize');
    const uploadBtn = document.getElementById('upload-btn-normalize');
    const statusDiv = document.getElementById('upload-status-normalize');
    const resultDiv = document.getElementById('batch-result');
    const previewDiv = document.getElementById('analytics-preview');

    if (fileInput) fileInput.value = '';
    if (uploadBtn) uploadBtn.disabled = true;
    if (statusDiv) statusDiv.classList.add('hidden');
    if (resultDiv) resultDiv.classList.add('hidden');
    if (previewDiv) previewDiv.classList.add('hidden');
}

function setupNormalizeUpload() {
    const uploadArea = document.getElementById('upload-area-normalize');
    const fileInput = document.getElementById('batch-file-normalize');

    if (!uploadArea || !fileInput) return;

    uploadArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadArea.classList.add("dragover");
    });

    uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("dragover"));

    uploadArea.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadArea.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) handleNormalizeFileSelection(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) handleNormalizeFileSelection(e.target.files[0]);
    });
}

function handleNormalizeFileSelection(file) {
    const statusDiv = document.getElementById('upload-status-normalize');
    const statusText = document.getElementById('status-text-normalize');
    const uploadBtn = document.getElementById('upload-btn-normalize');

    if (!statusDiv || !statusText || !uploadBtn) return;

    if (!file.name.endsWith(".csv") && !file.name.endsWith(".xlsx")) {
        statusDiv.classList.remove("hidden");
        statusText.textContent = "Invalid file type. Please select CSV or XLSX file.";
        statusDiv.style.background = "#ffebee";
        statusDiv.style.color = "#c62828";
        uploadBtn.disabled = true;
        return;
    }

    selectedFileNormalize = file;
    statusDiv.classList.remove("hidden");
    statusText.textContent = `File selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    statusDiv.style.background = "#e3f2fd";
    statusDiv.style.color = "#0d47a1";
    uploadBtn.disabled = false;
}

async function uploadBatchFile(mode) {
    if (!selectedFileNormalize) {
        alert("Please select a file first.");
        return;
    }

    const formData = new FormData();
    formData.append("file", selectedFileNormalize);
    formData.append("mode", mode);

    showLoading("Normalizing data and generating predictions...");

    try {
        const response = await fetch("/api/batch-upload", { method: "POST", body: formData });
        const result = await response.json();
        hideLoading();

        if (result.success) {
            const resultDiv = document.getElementById("batch-result");
            if (resultDiv) resultDiv.classList.remove("hidden");

            const elements = {
                "batch-processed-count": mode === 'normalize' ? `<i class="fa-solid fa-chart-bar"></i> Added<br><b>${result.added || 0}</b>` : `<i class="fa-solid fa-chart-bar"></i> Processed<br><b>${result.processed_rows || 0}</b>`,
                "batch-total-count": mode === 'normalize' ? `<i class="fa-solid fa-users"></i> Total Records<br><b>${result.total_records || 0}</b>` : `<i class="fa-solid fa-users"></i> Total Students<br><b>${result.total_students || 0}</b>`,
                "batch-alerts-sent": mode === 'normalize' ? `<i class="fa-solid fa-envelope"></i> Updated<br><b>${result.updated || 0}</b>` : `<i class="fa-solid fa-check-circle"></i> Success<br><b>Complete</b>`
            };

            Object.entries(elements).forEach(([id, html]) => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = html;
            });

            const messageEl = document.getElementById("batch-message-text");
            if (messageEl) messageEl.textContent = result.message;

            if (mode === 'normalize') {
                alert(`SUCCESS: Normalization Complete! Added ${result.added || 0} new students, updated ${result.updated || 0} existing students.`);
            } else {
                alert(`SUCCESS: Analytics Processing Complete! Processed ${result.processed_rows || 0} records.`);
            }

            await loadInitialStats();
            resetBatchUpload();
        } else {
            alert(`ERROR: Upload failed: ${result.message}`);
        }
    } catch (error) {
        hideLoading();
        console.error("Upload error:", error);
        alert("ERROR: Upload failed due to network error.");
    }
}

function showAnalyticsAfterNormalize() {
    switchBatchMode('analytics');
    loadAnalyticsDashboard();
}

async function loadAnalyticsDashboard() {
    showLoading("Loading analytics dashboard...");

    try {
        const result = await api("/api/analytics/preview", "GET");
        hideLoading();

        if (result.success) {
            const previewDiv = document.getElementById('analytics-preview');
            if (previewDiv) previewDiv.classList.remove('hidden');

            const elements = {
                'analytics-total-students': `<i class="fa-solid fa-users"></i> Total Students<br><b>${result.stats.total_students}</b>`,
                'analytics-high-risk': `<i class="fa-solid fa-triangle-exclamation"></i> High Risk<br><b>${result.stats.high_risk}</b>`,
                'analytics-high-dropout': `<i class="fa-solid fa-user-xmark"></i> High Dropout<br><b>${result.stats.high_dropout}</b>`
            };

            Object.entries(elements).forEach(([id, html]) => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = html;
            });

            const tbody = document.querySelector('#analytics-table tbody');
            if (tbody) {
                tbody.innerHTML = '';
                result.students.slice(0, 50).forEach(student => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${student.RNO}</td><td>${student.NAME}</td><td>${student.DEPT}</td><td>${student.YEAR}</td>
                        <td><span class="label-${student.performance_label}">${student.performance_label}</span></td>
                        <td><span class="label-${student.risk_label}">${student.risk_label}</span></td>
                        <td><span class="label-${student.dropout_label}">${student.dropout_label}</span></td>
                        <td><button class="secondary-btn" onclick="viewStudentAnalytics('${student.RNO}')" style="padding: 4px 8px; font-size: 12px;">View Analytics</button></td>`;
                    tbody.appendChild(tr);
                });
            }
        } else {
            const previewDiv = document.getElementById('analytics-preview');
            if (previewDiv) previewDiv.classList.add('hidden');
            alert(result.message || "No analytics data available");
        }
    } catch (error) {
        hideLoading();
        console.error("Analytics dashboard error:", error);
        alert("Failed to load analytics dashboard.");
    }
}

async function viewStudentAnalytics(rno) {
    try {
        const result = await api("/api/student/search", "POST", { rno });
        if (result.success) {
            currentStudent = result.student;
            await analyseStudent(currentStudent);

            // Switch to student mode
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            const studentBtn = document.querySelector('[data-mode="student"]');
            if (studentBtn) studentBtn.classList.add('active');

            document.querySelectorAll('.mode-section').forEach(sec => {
                sec.classList.remove('active');
                sec.classList.add('hidden');
            });

            const studentMode = document.getElementById('mode-student');
            if (studentMode) {
                studentMode.classList.remove('hidden');
                studentMode.classList.add('active');
            }
        }
    } catch (error) {
        alert("Failed to load student analytics.");
    }
}

/* ===========================================================
   CRUD OPERATIONS
   =========================================================== */
let currentCrudMode = 'create';
let currentStudentForUpdate = null;

function switchCrudMode(mode) {
    currentCrudMode = mode;

    // Update button states
    const buttons = ['create', 'read', 'update', 'delete'];
    buttons.forEach(btn => {
        const element = document.getElementById(`btn-${btn}`);
        if (element) {
            element.classList.toggle('active', btn === mode);
        }
    });

    // Show/hide content sections
    buttons.forEach(btn => {
        const content = document.getElementById(`crud-${btn}`);
        if (content) {
            content.classList.toggle('hidden', btn !== mode);
        }
    });

    // Hide results
    const resultsDiv = document.getElementById('crud-results');
    if (resultsDiv) resultsDiv.classList.add('hidden');

    // Reset forms
    resetCrudForms();
}

function resetCrudForms() {
    // Reset create form
    const createInputs = document.querySelectorAll('#crud-create input, #crud-create select');
    createInputs.forEach(input => {
        if (input.type === 'number') {
            input.value = input.getAttribute('value') || '';
        } else {
            input.value = '';
        }
    });

    // Reset read form
    const readInputs = document.querySelectorAll('#crud-read input');
    readInputs.forEach(input => input.value = '');

    // Reset update form
    const updateInputs = document.querySelectorAll('#crud-update input, #crud-update select');
    updateInputs.forEach(input => input.value = '');

    // Reset delete form
    const deleteInputs = document.querySelectorAll('#crud-delete input');
    deleteInputs.forEach(input => input.value = '');

    // Hide dynamic sections
    const dynamicSections = ['read-results', 'update-form', 'delete-preview'];
    dynamicSections.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.classList.add('hidden');
    });

    currentStudentForUpdate = null;
}

// CREATE STUDENT
async function createStudent() {
    const requiredFields = {
        'create-name': 'Name',
        'create-rno': 'Register Number',
        'create-email': 'Email',
        'create-dept': 'Department',
        'create-year': 'Year',
        'create-sem': 'Current Semester'
    };

    // Validate required fields
    for (const [fieldId, fieldName] of Object.entries(requiredFields)) {
        const element = document.getElementById(fieldId);
        if (!element || !element.value.trim()) {
            alert(`${fieldName} is required`);
            if (element) element.focus();
            return;
        }
    }

    // Collect semester marks
    const semesterMarks = {};
    for (let i = 1; i <= 8; i++) {
        const semInput = document.getElementById(`create-sem${i}`);
        if (semInput && semInput.value) {
            semesterMarks[`SEM${i}`] = parseFloat(semInput.value);
        }
    }

    const studentData = {
        NAME: document.getElementById('create-name').value.trim(),
        RNO: document.getElementById('create-rno').value.trim(),
        EMAIL: document.getElementById('create-email').value.trim(),
        DEPT: document.getElementById('create-dept').value,
        YEAR: parseInt(document.getElementById('create-year').value),
        CURR_SEM: parseInt(document.getElementById('create-sem').value),
        MENTOR: document.getElementById('create-mentor').value.trim(),
        MENTOR_EMAIL: document.getElementById('create-mentor-email').value.trim(),
        INTERNAL_MARKS: parseFloat(document.getElementById('create-internal').value || 20),
        TOTAL_DAYS_CURR: parseFloat(document.getElementById('create-total-days').value || 90),
        ATTENDED_DAYS_CURR: parseFloat(document.getElementById('create-attended-days').value || 80),
        PREV_ATTENDANCE_PERC: parseFloat(document.getElementById('create-prev-att').value || 85),
        BEHAVIOR_SCORE_10: parseFloat(document.getElementById('create-behavior').value || 7),
        ...semesterMarks
    };

    showLoading('Creating student...');

    try {
        const result = await api('/api/student/create', 'POST', studentData);
        hideLoading();

        if (result.success) {
            showCrudResults('Student Created Successfully', `
                <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <h4 style="color: #2e7d32; margin: 0 0 10px 0;"><i class="fa-solid fa-check-circle"></i> Student Created Successfully</h4>
                    <p><strong>Name:</strong> ${result.student.NAME}</p>
                    <p><strong>RNO:</strong> ${result.student.RNO}</p>
                    <p><strong>Department:</strong> ${result.student.DEPT}</p>
                    <p><strong>Year:</strong> ${result.student.YEAR}</p>
                    <p><strong>Performance:</strong> <span class="label-${result.student.performance_label}">${result.student.performance_label}</span></p>
                    <p><strong>Risk:</strong> <span class="label-${result.student.risk_label}">${result.student.risk_label}</span></p>
                </div>
                <button class="primary-btn" onclick="resetCrudForms()" style="margin-top: 10px;">
                    <i class="fa-solid fa-plus"></i> Create Another Student
                </button>
            `);
            resetCrudForms();
            await loadInitialStats(); // Refresh stats
        } else {
            alert(`ERROR: Failed to create student: ${result.message}`);
        }
    } catch (error) {
        hideLoading();
        console.error('Create student error:', error);
        alert('ERROR: Failed to create student due to network error.');
    }
}

// READ STUDENT
async function readStudent() {
    const rno = document.getElementById('read-rno').value.trim();
    const name = document.getElementById('read-name').value.trim();

    if (!rno && !name) {
        alert('Please enter either Register Number or Name to search');
        return;
    }

    showLoading('Searching students...');

    try {
        const result = await api('/api/student/read', 'POST', { rno, name });
        hideLoading();

        if (result.success) {
            const resultsDiv = document.getElementById('read-results');
            if (resultsDiv) resultsDiv.classList.remove('hidden');

            const tbody = document.querySelector('#read-table tbody');
            if (tbody) {
                tbody.innerHTML = '';

                result.students.forEach(student => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${student.RNO}</td>
                        <td>${student.NAME}</td>
                        <td>${student.DEPT}</td>
                        <td>${student.YEAR}</td>
                        <td>${student.CURR_SEM}</td>
                        <td><span class="label-${student.performance_label}">${student.performance_label}</span></td>
                        <td><span class="label-${student.risk_label}">${student.risk_label}</span></td>
                        <td><span class="label-${student.dropout_label}">${student.dropout_label}</span></td>
                        <td>
                            <button class="secondary-btn" onclick="editStudent('${student.RNO}')" style="padding: 4px 8px; font-size: 12px; margin-right: 5px;">
                                <i class="fa-solid fa-edit"></i> Edit
                            </button>
                            <button class="alert-btn" onclick="deleteStudentFromRead('${student.RNO}')" style="padding: 4px 8px; font-size: 12px; background: #dc3545;">
                                <i class="fa-solid fa-trash"></i> Delete
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            showCrudResults(`Search Results (${result.count} found)`, `
                <p style="color: #2e7d32;"><i class="fa-solid fa-check-circle"></i> Found ${result.count} student(s) matching your search criteria.</p>
            `);
        } else {
            const resultsDiv = document.getElementById('read-results');
            if (resultsDiv) resultsDiv.classList.add('hidden');
            alert(`❌ ${result.message}`);
        }
    } catch (error) {
        hideLoading();
        console.error('Read student error:', error);
        alert('ERROR: Failed to search students due to network error.');
    }
}

// UPDATE STUDENT
async function fetchStudentForUpdate() {
    const rno = document.getElementById('update-search-rno').value.trim();

    if (!rno) {
        alert('Please enter Register Number');
        return;
    }

    showLoading('Fetching student details...');

    try {
        const result = await api('/api/student/search', 'POST', { rno });
        hideLoading();

        if (result.success) {
            currentStudentForUpdate = result.student;
            const updateForm = document.getElementById('update-form');
            if (updateForm) updateForm.classList.remove('hidden');

            // Populate form with current data
            const fields = {
                'update-name': result.student.NAME,
                'update-email': result.student.EMAIL,
                'update-dept': result.student.DEPT,
                'update-year': result.student.YEAR,
                'update-sem': result.student.CURR_SEM,
                'update-internal': result.student.INTERNAL_MARKS || 20
            };

            Object.entries(fields).forEach(([fieldId, value]) => {
                const element = document.getElementById(fieldId);
                if (element) element.value = value || '';
            });

            // Populate semester marks
            for (let i = 1; i <= 8; i++) {
                const semInput = document.getElementById(`update-sem${i}`);
                if (semInput) {
                    semInput.value = result.student[`SEM${i}`] || '';
                }
            }
        } else {
            alert(`❌ ${result.message}`);
        }
    } catch (error) {
        hideLoading();
        console.error('Fetch student error:', error);
        alert('❌ Failed to fetch student details.');
    }
}

async function updateStudent() {
    if (!currentStudentForUpdate) {
        alert('Please fetch student details first');
        return;
    }

    // Collect semester marks
    const semesterMarks = {};
    for (let i = 1; i <= 8; i++) {
        const semInput = document.getElementById(`update-sem${i}`);
        if (semInput && semInput.value) {
            semesterMarks[`SEM${i}`] = parseFloat(semInput.value);
        }
    }

    const updateData = {
        RNO: currentStudentForUpdate.RNO,
        NAME: document.getElementById('update-name').value.trim(),
        EMAIL: document.getElementById('update-email').value.trim(),
        DEPT: document.getElementById('update-dept').value,
        YEAR: parseInt(document.getElementById('update-year').value),
        CURR_SEM: parseInt(document.getElementById('update-sem').value),
        INTERNAL_MARKS: parseFloat(document.getElementById('update-internal').value || 20),
        ...semesterMarks
    };

    showLoading('Updating student...');

    try {
        const result = await api('/api/student/update', 'POST', updateData);
        hideLoading();

        if (result.success) {
            showCrudResults('Student Updated Successfully', `
                <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <h4 style="color: #2e7d32; margin: 0 0 10px 0;"><i class="fa-solid fa-check-circle"></i> Student Updated Successfully</h4>
                    <p><strong>Name:</strong> ${result.student.NAME}</p>
                    <p><strong>RNO:</strong> ${result.student.RNO}</p>
                    <p><strong>Department:</strong> ${result.student.DEPT}</p>
                    <p><strong>Updated Performance:</strong> <span class="label-${result.student.performance_label}">${result.student.performance_label}</span></p>
                </div>
                <button class="primary-btn" onclick="resetCrudForms()" style="margin-top: 10px;">
                    <i class="fa-solid fa-edit"></i> Update Another Student
                </button>
            `);
            resetCrudForms();
            await loadInitialStats(); // Refresh stats
        } else {
            alert(`ERROR: Failed to update student: ${result.message}`);
        }
    } catch (error) {
        hideLoading();
        console.error('Update student error:', error);
        alert('ERROR: Failed to update student due to network error.');
    }
}

function cancelUpdate() {
    resetCrudForms();
}

// DELETE STUDENT
async function fetchStudentForDelete() {
    const rno = document.getElementById('delete-search-rno').value.trim();

    if (!rno) {
        alert('Please enter Register Number');
        return;
    }

    showLoading('Fetching student details...');

    try {
        const result = await api('/api/student/search', 'POST', { rno });
        hideLoading();

        if (result.success) {
            const previewDiv = document.getElementById('delete-preview');
            const infoDiv = document.getElementById('delete-student-info');

            if (previewDiv && infoDiv) {
                previewDiv.classList.remove('hidden');
                infoDiv.innerHTML = `
                    <p><strong>Name:</strong> ${result.student.NAME}</p>
                    <p><strong>RNO:</strong> ${result.student.RNO}</p>
                    <p><strong>Email:</strong> ${result.student.EMAIL}</p>
                    <p><strong>Department:</strong> ${result.student.DEPT}</p>
                    <p><strong>Year:</strong> ${result.student.YEAR}</p>
                    <p><strong>Current Semester:</strong> ${result.student.CURR_SEM}</p>
                `;
            }
        } else {
            alert(`❌ ${result.message}`);
        }
    } catch (error) {
        hideLoading();
        console.error('Fetch student error:', error);
        alert('❌ Failed to fetch student details.');
    }
}

async function confirmDeleteStudent() {
    const rno = document.getElementById('delete-search-rno').value.trim();

    if (!rno) {
        alert('No student selected for deletion');
        return;
    }

    if (!confirm('Are you sure you want to delete this student? This action cannot be undone.')) {
        return;
    }

    showLoading('Deleting student...');

    try {
        const result = await api('/api/student/delete', 'POST', { rno });
        hideLoading();

        if (result.success) {
            showCrudResults('Student Deleted Successfully', `
                <div style="background: #ffebee; padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #f44336;">
                    <h4 style="color: #c62828; margin: 0 0 10px 0;"><i class="fa-solid fa-trash"></i> Student Deleted Successfully</h4>
                    <p><strong>Name:</strong> ${result.deleted_student.NAME}</p>
                    <p><strong>RNO:</strong> ${result.deleted_student.RNO}</p>
                    <p><strong>Department:</strong> ${result.deleted_student.DEPT}</p>
                    <p style="color: #666; font-style: italic;">This student has been permanently removed from the system.</p>
                </div>
                <button class="primary-btn" onclick="resetCrudForms()" style="margin-top: 10px;">
                    <i class="fa-solid fa-trash"></i> Delete Another Student
                </button>
            `);
            resetCrudForms();
            await loadInitialStats(); // Refresh stats
        } else {
            alert(`ERROR: Failed to delete student: ${result.message}`);
        }
    } catch (error) {
        hideLoading();
        console.error('Delete student error:', error);
        alert('ERROR: Failed to delete student due to network error.');
    }
}

function cancelDelete() {
    resetCrudForms();
}

// HELPER FUNCTIONS FOR CRUD
function showCrudResults(title, content) {
    const resultsDiv = document.getElementById('crud-results');
    const titleEl = document.getElementById('crud-results-title');
    const contentEl = document.getElementById('crud-results-content');

    if (resultsDiv && titleEl && contentEl) {
        resultsDiv.classList.remove('hidden');
        titleEl.textContent = title;
        contentEl.innerHTML = content;

        // Scroll to results
        resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Quick actions from read table
function editStudent(rno) {
    switchCrudMode('update');
    document.getElementById('update-search-rno').value = rno;
    fetchStudentForUpdate();
}

function deleteStudentFromRead(rno) {
    switchCrudMode('delete');
    document.getElementById('delete-search-rno').value = rno;
    fetchStudentForDelete();
}

/* ===========================================================
   BATCH-WISE ANALYTICS
   =========================================================== */
let currentBatchYear = null;
let currentBatchData = null;

async function analyseBatch() {
    const batchSelect = document.getElementById('batch-year-select');
    if (!batchSelect) {
        console.error('Batch year select not found');
        return;
    }

    const batchYear = batchSelect.value;
    if (!batchYear) {
        alert('Please select a batch year');
        return;
    }

    currentBatchYear = batchYear;
    showLoading('Analyzing batch...');

    try {
        const result = await api('/api/batch/analyze', 'POST', { batch_year: batchYear });
        hideLoading();

        if (!result || !result.success) {
            alert(result?.message || 'Batch analysis failed');
            return;
        }

        currentBatchData = result;
        const reportDiv = document.getElementById('batch-report');
        if (reportDiv) {
            reportDiv.classList.remove('hidden');
            console.log('Batch report shown');
        }

        renderBatchKPIs(result);
        renderBatchCharts(result);
        renderBatchSummary(result);

        // Add drill-down handlers for batch charts
        setTimeout(() => {
            addBatchDrilldownHandlers(currentBatchYear);
        }, 1000);

    } catch (error) {
        hideLoading();
        console.error('Batch analysis error:', error);
        alert('Batch analysis failed: ' + error.message);
    }
}

function renderBatchKPIs(data) {
    const stats = data.stats;
    const elements = {
        'batch-kpi-total': `<i class="fa-solid fa-users"></i> Total Students<br><b>${stats.total_students}</b>`,
        'batch-kpi-avg-perf': `<i class="fa-solid fa-chart-bar"></i> Avg Performance<br><b>${stats.avg_performance}%</b>`,
        'batch-kpi-high-risk': `<i class="fa-solid fa-triangle-exclamation"></i> High Risk<br><b>${stats.high_risk_pct}%</b>`,
        'batch-kpi-avg-dropout': `<i class="fa-solid fa-user-xmark"></i> Avg Dropout Risk<br><b>${stats.avg_dropout}%</b>`,
        'batch-kpi-top-performers': `<i class="fa-solid fa-trophy"></i> Top Performers<br><b>${stats.top_performers_pct}%</b>`
    };

    Object.entries(elements).forEach(([id, html]) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    });
}

function renderBatchCharts(data) {
    // Performance Distribution
    if (document.getElementById('batch-chart-performance')) {
        const perfData = data.distributions.performance;
        const layout = {
            ...window.defaultLayout,
            title: { text: 'Performance Distribution', font: { size: 18, color: '#1976d2' }, x: 0.5 },
            xaxis: { title: 'Performance Level' },
            yaxis: { title: 'Number of Students' }
        };

        const trace = {
            x: Object.keys(perfData),
            y: Object.values(perfData),
            type: 'bar',
            marker: { color: ['#4CAF50', '#FF9800', '#F44336'] },
            hovertemplate: '<b>%{x}</b><br>Students: %{y}<extra></extra>'
        };

        Plotly.newPlot('batch-chart-performance', [trace], layout, window.defaultChartConfig);

        // Add click event
        document.getElementById('batch-chart-performance').on('plotly_click', function (eventData) {
            if (eventData.points.length > 0) {
                const point = eventData.points[0];
                performDrilldown('performance_label', point.x, 'batch', currentBatchYear);
            }
        });
    }

    // Risk Level Breakdown
    if (document.getElementById('batch-chart-risk')) {
        const riskData = data.distributions.risk;
        const layout = {
            ...window.defaultLayout,
            title: { text: 'Risk Level Breakdown', font: { size: 18, color: '#1976d2' }, x: 0.5 }
        };

        const trace = {
            labels: Object.keys(riskData),
            values: Object.values(riskData),
            type: 'pie',
            hole: 0.4,
            marker: { colors: ['#4CAF50', '#FF9800', '#F44336'] },
            hovertemplate: '<b>%{label}</b><br>Students: %{value}<br>%{percent}<extra></extra>'
        };

        Plotly.newPlot('batch-chart-risk', [trace], layout, window.defaultChartConfig);

        // Add click event
        document.getElementById('batch-chart-risk').on('plotly_click', function (eventData) {
            if (eventData.points.length > 0) {
                const point = eventData.points[0];
                performDrilldown('risk_label', point.label, 'batch', currentBatchYear);
            }
        });
    }

    // Dropout Distribution
    if (document.getElementById('batch-chart-dropout')) {
        const dropoutData = data.distributions.dropout;
        const layout = {
            ...window.defaultLayout,
            title: { text: 'Dropout Probability Distribution', font: { size: 18, color: '#1976d2' }, x: 0.5 }
        };

        const trace = {
            labels: Object.keys(dropoutData),
            values: Object.values(dropoutData),
            type: 'pie',
            marker: { colors: ['#4CAF50', '#FF9800', '#F44336'] },
            hovertemplate: '<b>%{label}</b><br>Students: %{value}<br>%{percent}<extra></extra>'
        };

        Plotly.newPlot('batch-chart-dropout', [trace], layout, window.defaultChartConfig);

        // Add click event
        document.getElementById('batch-chart-dropout').on('plotly_click', function (eventData) {
            if (eventData.points.length > 0) {
                const point = eventData.points[0];
                performDrilldown('dropout_label', point.label, 'batch', currentBatchYear);
            }
        });
    }

    // Semester Trend Analysis
    if (document.getElementById('batch-chart-semester-trend')) {
        const semesterData = data.semester_trend;
        const semesters = semesterData.map((_, i) => `SEM${i + 1}`);
        const validData = semesterData.filter(val => val !== null && val > 0);
        const validSemesters = semesters.filter((_, i) => semesterData[i] !== null && semesterData[i] > 0);

        const layout = {
            ...window.defaultLayout,
            title: { text: 'Semester Trend Analysis', font: { size: 18, color: '#1976d2' }, x: 0.5 },
            xaxis: { title: 'Semester' },
            yaxis: { title: 'Average Marks (%)' }
        };

        const trace = {
            x: validSemesters,
            y: validData,
            type: 'scatter',
            mode: 'lines+markers',
            line: { width: 4, color: '#1976d2' },
            marker: { size: 10, color: '#1976d2' },
            hovertemplate: '<b>%{x}</b><br>Average: %{y:.1f}%<extra></extra>'
        };

        Plotly.newPlot('batch-chart-semester-trend', [trace], layout, window.defaultChartConfig);
    }
}

function renderBatchSummary(data) {
    const summaryEl = document.getElementById('batch-summary');
    if (!summaryEl) return;

    const insights = data.insights;
    let html = `<p><strong>${insights.summary}</strong></p>`;

    if (insights.insights && insights.insights.length > 0) {
        html += '<h4>Key Insights:</h4><ul>';
        insights.insights.forEach(insight => {
            html += `<li>${insight}</li>`;
        });
        html += '</ul>';
    }

    if (insights.recommendations && insights.recommendations.length > 0) {
        html += '<h4>Recommendations:</h4><ul>';
        insights.recommendations.forEach(rec => {
            html += `<li>${rec}</li>`;
        });
        html += '</ul>';
    }

    summaryEl.innerHTML = html;
}

// ===========================
// ENHANCED UNIVERSAL DRILL-DOWN SYSTEM
// ===========================
function populateDrilldownModal(modal, students, filterInfo) {
    const tbody = modal.querySelector('.drilldown-table tbody');
    const title = modal.querySelector('.drilldown-title');
    const count = modal.querySelector('.student-count');

    // Set title and count
    const filterTypeDisplay = filterInfo.filter_type.replace('_label', '').replace('_', ' ').toUpperCase();
    title.textContent = `${filterInfo.filter_value.toUpperCase()} ${filterTypeDisplay} STUDENTS`;
    count.textContent = `${students.length} students`;

    // Clear and populate table
    tbody.innerHTML = '';

    if (students.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="drilldown-empty">
                    <i class="fa-solid fa-users-slash"></i>
                    <p>No students found for this filter</p>
                </td>
            </tr>
        `;
    } else {
        students.forEach(student => {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td class="student-rno">${student.RNO}</td>
                <td class="student-name">${student.NAME}</td>
                <td><span class="student-dept">${student.DEPT}</span></td>
                <td>${student.YEAR}</td>
                <td><span class="label-${student.performance_label}">${student.performance_label}</span></td>
                <td><span class="label-${student.risk_label}">${student.risk_label}</span></td>
                <td><span class="label-${student.dropout_label}">${student.dropout_label}</span></td>
                <td>
                    <button class="view-btn" onclick="viewStudentFromDrilldown('${student.RNO}')">
                        <i class="fa-solid fa-eye"></i> View Analytics
                    </button>
                </td>
            `;
        });
    }
}

function createDrilldownModal() {
    const modal = document.createElement('div');
    modal.id = 'drilldown-modal';
    modal.className = 'drilldown-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <div>
                    <h3 class="drilldown-title">Student Details</h3>
                    <span class="student-count">0 students</span>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="secondary-btn" onclick="exportDrilldownCSV()" style="padding: 5px 10px; font-size: 12px;">
                        <i class="fa-solid fa-download"></i> Export
                    </button>
                    <button class="modal-close" onclick="closeDrilldownModal()">&times;</button>
                </div>
            </div>
            <div class="modal-body">
                <div class="drilldown-table-container">
                    <table class="drilldown-table" id="drilldown-table">
                        <thead>
                            <tr>
                                <th>Register No</th>
                                <th>Student Name</th>
                                <th>Department</th>
                                <th>Year</th>
                                <th>Performance</th>
                                <th>Risk Level</th>
                                <th>Dropout Risk</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    // Add click outside to close
    modal.addEventListener('click', function (e) {
        if (e.target === modal) {
            closeDrilldownModal();
        }
    });

    document.body.appendChild(modal);
    return modal;
}

function closeDrilldownModal() {
    const modal = document.getElementById('drilldown-modal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

async function viewStudentFromDrilldown(rno) {
    closeDrilldownModal();

    try {
        showLoading('Loading student analytics...');
        const result = await api('/api/student/search', 'POST', { rno });
        hideLoading();

        if (result.success) {
            currentStudent = result.student;
            await analyseStudent(currentStudent);

            // Switch to student mode
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            const studentBtn = document.querySelector('[data-mode="student"]');
            if (studentBtn) studentBtn.classList.add('active');

            document.querySelectorAll('.mode-section').forEach(sec => {
                sec.classList.remove('active');
                sec.classList.add('hidden');
            });

            const studentMode = document.getElementById('mode-student');
            if (studentMode) {
                studentMode.classList.remove('hidden');
                studentMode.classList.add('active');
            }

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            alert('Failed to load student details: ' + result.message);
        }
    } catch (error) {
        hideLoading();
        console.error('Error loading student:', error);
        alert('Failed to load student analytics.');
    }
}

function performDrilldown(filterType, filterValue, scope, scopeValue) {
    let modal = document.getElementById('drilldown-modal');
    if (!modal) {
        modal = createDrilldownModal();
    }

    const tbody = modal.querySelector('.drilldown-table tbody');
    const title = modal.querySelector('.drilldown-title');
    const count = modal.querySelector('.student-count');

    // Reset modal state
    modal.classList.remove('show');
    modal.style.display = 'none';

    // Set loading state
    title.textContent = 'LOADING STUDENT DETAILS';
    count.textContent = 'Please wait...';
    tbody.innerHTML = `
        <tr>
            <td colspan="8" class="drilldown-loading">
                <div class="spinner"></div>
                Loading student details...
            </td>
        </tr>
    `;

    // Show modal
    modal.style.display = 'flex';
    modal.classList.add('show');

    api('/api/analytics/drilldown', 'POST', {
        filter_type: filterType,
        filter_value: filterValue,
        scope: scope,
        scope_value: scopeValue
    })
        .then(data => {
            if (data.success) {
                populateDrilldownModal(modal, data.students, data.filter_info);
            } else {
                title.textContent = 'ERROR LOADING DATA';
                count.textContent = 'Failed to load';
                tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="drilldown-empty">
                        <i class="fa-solid fa-exclamation-triangle"></i>
                        <p>Failed to load student details: ${data.message || 'Unknown error'}</p>
                        <button class="secondary-btn" onclick="closeDrilldownModal()" style="margin-top: 10px;">
                            <i class="fa-solid fa-times"></i> Close
                        </button>
                    </td>
                </tr>
            `;
            }
        })
        .catch(error => {
            console.error('Drilldown error:', error);
            title.textContent = 'NETWORK ERROR';
            count.textContent = 'Connection failed';
            tbody.innerHTML = `
            <tr>
                <td colspan="8" class="drilldown-empty">
                    <i class="fa-solid fa-wifi" style="color: #f44336;"></i>
                    <p>Network error occurred. Please check your connection and try again.</p>
                    <button class="secondary-btn" onclick="closeDrilldownModal()" style="margin-top: 10px;">
                        <i class="fa-solid fa-times"></i> Close
                    </button>
                </td>
            </tr>
        `;
        });
}

function addUniversalDrilldownHandlers(chartIds, scope, scopeValue) {
    chartIds.forEach(chartId => {
        const chartElement = document.getElementById(chartId);
        if (chartElement) {
            // Remove existing handlers
            chartElement.removeAllListeners && chartElement.removeAllListeners('plotly_click');

            if (chartElement.on) {
                chartElement.on('plotly_click', function (data) {
                    const point = data.points[0];
                    let filterType, filterValue;

                    if (chartId.includes('perf')) {
                        filterType = 'performance_label';
                        filterValue = (point.label || point.x || 'high').toLowerCase();
                    } else if (chartId.includes('risk')) {
                        filterType = 'risk_label';
                        filterValue = (point.label || point.x || 'high').toLowerCase();
                    } else if (chartId.includes('drop')) {
                        filterType = 'dropout_label';
                        filterValue = (point.label || point.x || 'high').toLowerCase();
                    } else {
                        filterType = 'performance_label';
                        filterValue = 'high';
                    }

                    performDrilldown(filterType, filterValue, scope, scopeValue);
                });
            }
        }
    });
}

async function showStudentList(filterType, filterValue, title) {
    if (!currentBatchYear) return;

    performDrilldown(filterType, filterValue, 'batch', currentBatchYear);
}

function displayStudentModal(students, title) {
    const modal = document.getElementById('student-modal');
    const modalTitle = document.getElementById('modal-title');
    const tbody = document.querySelector('#modal-student-table tbody');

    if (!modal || !modalTitle || !tbody) return;

    modalTitle.textContent = `${title} (${students.length} students)`;
    tbody.innerHTML = '';

    students.forEach(student => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${student.RNO}</td>
            <td>${student.NAME}</td>
            <td>${student.DEPT}</td>
            <td>${student.YEAR}</td>
            <td>${student.batch_year}</td>
            <td><span class="label-${student.performance_label}">${student.performance_label}</span></td>
            <td><span class="label-${student.risk_label}">${student.risk_label}</span></td>
            <td><span class="label-${student.dropout_label}">${student.dropout_label}</span></td>
        `;
        tbody.appendChild(tr);
    });

    modal.classList.remove('hidden');
}

function addDepartmentDrilldownHandlers(dept, year) {
    const charts = ['dept-chart-perf-donut', 'dept-chart-risk-donut', 'dept-chart-drop-donut', 'dept-chart-3d'];
    addUniversalDrilldownHandlers(charts, 'dept', dept);
}

function addYearDrilldownHandlers(year) {
    const charts = ['year-chart-perf-donut', 'year-chart-3d', 'year-chart-box', 'year-chart-hist'];
    addUniversalDrilldownHandlers(charts, 'year', year);
}

function addCollegeDrilldownHandlers() {
    const charts = ['clg-chart-perf-donut', 'clg-chart-risk-donut', 'clg-chart-3d', 'clg-chart-box'];
    addUniversalDrilldownHandlers(charts, 'college', 'all');
}

function addBatchDrilldownHandlers(batchYear) {
    const charts = ['batch-chart-performance', 'batch-chart-risk', 'batch-chart-dropout', 'batch-chart-semester-trend'];
    addUniversalDrilldownHandlers(charts, 'batch', batchYear);
}

function closeStudentModal() {
    const modal = document.getElementById('student-modal');
    if (modal) modal.classList.add('hidden');
}
/* ===========================================================
   SIDEBAR TOGGLE FUNCTIONALITY
   =========================================================== */
function setupSidebarToggle() {
    const toggleBtn = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const miniSidebar = document.getElementById('mini-sidebar');
    const mainContent = document.querySelector('.main-content');

    if (!toggleBtn || !sidebar || !miniSidebar) return;

    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    let isOpen = true;

    // Setup mini-sidebar navigation
    const miniNavBtns = miniSidebar.querySelectorAll('.mini-nav-btn');
    miniNavBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            miniNavBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const mode = btn.getAttribute('data-mode');
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelector(`[data-mode="${mode}"]`).classList.add('active');

            document.querySelectorAll('.mode-section').forEach(sec => {
                sec.classList.remove('active');
                sec.classList.add('hidden');
            });

            const target = document.getElementById(`mode-${mode}`);
            if (target) {
                target.classList.remove('hidden');
                target.classList.add('active');
            }
        });
    });

    toggleBtn.addEventListener('click', () => {
        isOpen = !isOpen;

        if (window.innerWidth <= 900) {
            if (isOpen) {
                sidebar.classList.add('open');
                overlay.classList.add('active');
                miniSidebar.classList.remove('active');
            } else {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
                miniSidebar.classList.add('active');
            }
        } else {
            if (isOpen) {
                sidebar.classList.remove('collapsed');
                mainContent.classList.remove('expanded');
                miniSidebar.classList.remove('active');
            } else {
                sidebar.classList.add('collapsed');
                mainContent.classList.add('expanded');
                miniSidebar.classList.add('active');
            }
        }
    });

    overlay.addEventListener('click', () => {
        if (window.innerWidth <= 900) {
            isOpen = false;
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
            miniSidebar.classList.add('active');
        }
    });

    let clickTimeout;

    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 900) return;

        // Close sidebar if clicking outside when open
        if (!sidebar.contains(e.target) && !miniSidebar.contains(e.target) && !toggleBtn.contains(e.target) && isOpen) {
            isOpen = false;
            sidebar.classList.add('collapsed');
            mainContent.classList.add('expanded');
            miniSidebar.classList.add('active');
        }
    });

    document.addEventListener('dblclick', (e) => {
        if (window.innerWidth <= 900) return;

        // Open sidebar on double-click anywhere when closed
        if (!sidebar.contains(e.target) && !miniSidebar.contains(e.target) && !isOpen) {
            isOpen = true;
            sidebar.classList.remove('collapsed');
            mainContent.classList.remove('expanded');
            miniSidebar.classList.remove('active');
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 900) {
            overlay.classList.remove('active');
            sidebar.classList.remove('open');
            if (isOpen) {
                sidebar.classList.remove('collapsed');
                mainContent.classList.remove('expanded');
                miniSidebar.classList.remove('active');
            } else {
                sidebar.classList.add('collapsed');
                mainContent.classList.add('expanded');
                miniSidebar.classList.add('active');
            }
        } else {
            sidebar.classList.remove('collapsed');
            mainContent.classList.remove('expanded');
            miniSidebar.classList.remove('active');
        }
    });
}
function showSuccessAlert(message) {
    const alert = document.createElement('div');
    alert.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 2000;
        background: linear-gradient(135deg, #4caf50, #66bb6a);
        color: white; padding: 15px 20px; border-radius: 10px;
        box-shadow: 0 4px 15px rgba(76, 175, 80, 0.4);
        animation: slideIn 0.3s ease;
    `;
    alert.textContent = message;
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 4000);
}

function showErrorAlert(message) {
    const alert = document.createElement('div');
    alert.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 2000;
        background: linear-gradient(135deg, #f44336, #ef5350);
        color: white; padding: 15px 20px; border-radius: 10px;
        box-shadow: 0 4px 15px rgba(244, 67, 54, 0.4);
        animation: slideIn 0.3s ease;
    `;
    alert.textContent = message;
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 4000);
}

/* ===========================================================
   LANDING PAGE & LOGIN FUNCTIONALITY
   =========================================================== */
let isLoggedIn = false;
let currentUser = null;
let pendingNavigation = null;

function showLogin() {
    const modal = document.getElementById('login-modal');
    if (modal) {
        modal.classList.add('show');
        document.getElementById('login-username').focus();
    }
}

function hideLogin() {
    const modal = document.getElementById('login-modal');
    if (modal) {
        modal.classList.remove('show');
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
    }
}

function loginAndNavigate(mode) {
    pendingNavigation = mode;
    showLogin();
}

function performLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (!username || !password) {
        alert('Please enter both username and password');
        return;
    }

    // Simple authentication (in production, this should be server-side)
    if (username === 'admin' && password === 'admin123') {
        isLoggedIn = true;
        currentUser = { username: 'admin', name: 'Administrator' };

        hideLogin();
        showDashboard();

        if (pendingNavigation) {
            setTimeout(() => {
                navigateToMode(pendingNavigation);
                pendingNavigation = null;
            }, 500);
        }

        showSuccessAlert('Login successful! Welcome to EduMetric Dashboard.');
    } else {
        showErrorAlert('Invalid credentials. Please try again.');
        document.getElementById('login-password').value = '';
        document.getElementById('login-password').focus();
    }
}

function showDashboard() {
    const landingPage = document.getElementById('landing-page');
    const appShell = document.getElementById('app-shell');
    const profileName = document.getElementById('profile-name');

    if (landingPage) landingPage.style.display = 'none';
    if (appShell) appShell.style.display = 'block';
    if (profileName && currentUser) profileName.textContent = currentUser.name;
}

function navigateToMode(mode) {
    // Activate the corresponding navigation button
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.querySelector(`[data-mode="${mode}"]`);
    if (targetBtn) targetBtn.classList.add('active');

    // Show the corresponding mode section
    document.querySelectorAll('.mode-section').forEach(sec => {
        sec.classList.remove('active');
        sec.classList.add('hidden');
    });

    const targetSection = document.getElementById(`mode-${mode}`);
    if (targetSection) {
        targetSection.classList.remove('hidden');
        targetSection.classList.add('active');
    }
}

function toggleProfile() {
    const menu = document.getElementById('profile-menu');
    if (menu) {
        menu.classList.toggle('show');
    }
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        isLoggedIn = false;
        currentUser = null;
        pendingNavigation = null;

        const landingPage = document.getElementById('landing-page');
        const appShell = document.getElementById('app-shell');
        const profileMenu = document.getElementById('profile-menu');

        if (landingPage) landingPage.style.display = 'block';
        if (appShell) appShell.style.display = 'none';
        if (profileMenu) profileMenu.classList.remove('show');

        showSuccessAlert('Logged out successfully!');
    }
}

// Close profile menu when clicking outside
document.addEventListener('click', function (e) {
    const profileDropdown = document.querySelector('.profile-dropdown');
    const profileMenu = document.getElementById('profile-menu');

    if (profileDropdown && profileMenu && !profileDropdown.contains(e.target)) {
        profileMenu.classList.remove('show');
    }
});

// Handle Enter key in login form
document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
        const loginModal = document.getElementById('login-modal');
        if (loginModal && loginModal.classList.contains('show')) {
            performLogin();
        }
    }
});

// Initialize landing page on load
window.addEventListener('DOMContentLoaded', () => {
    // Show landing page by default
    const landingPage = document.getElementById('landing-page');
    const appShell = document.getElementById('app-shell');

    if (landingPage) landingPage.style.display = 'block';
    if (appShell) appShell.style.display = 'none';
});

/* ===========================================================
   EXPORT FUNCTIONALITY
   =========================================================== */

function exportTableToCSV(tableId, filename) {
    const table = document.getElementById(tableId);
    if (!table) {
        alert("Table not found to export!");
        return;
    }

    let csv = [];
    const rows = table.querySelectorAll("tr");

    for (let i = 0; i < rows.length; i++) {
        const row = [], cols = rows[i].querySelectorAll("td, th");

        // Skip rows that say "No students found"
        if (cols.length === 1 && cols[0].innerText.includes("No students")) continue;

        for (let j = 0; j < cols.length; j++) {
            // Clean inner text to remove newlines and commas
            let data = cols[j].innerText.replace(/(\r\n|\n|\r)/gm, " ").replace(/(\s\s)/gm, " ");
            data = data.replace(/"/g, '""'); // Escape double quotes
            row.push('"' + data + '"');
        }
        csv.push(row.join(","));
    }

    downloadCSV(csv.join("\n"), filename);
}

function downloadCSV(csv, filename) {
    const csvFile = new Blob([csv], { type: "text/csv" });
    const downloadLink = document.createElement("a");

    downloadLink.download = filename;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

function exportDeptCSV() {
    const dept = document.getElementById("d-dept").value || "Department";
    exportTableToCSV("dept-table", `EduMetric_${dept}_Analysis.csv`);
}

function exportYearCSV() {
    const year = document.getElementById("y-year").value || "Year";
    exportTableToCSV("year-table", `EduMetric_Year_${year}_Analysis.csv`);
}

function exportCollegeCSV() {
    exportTableToCSV("clg-table", "EduMetric_College_Analysis.csv");
}

function exportDrilldownCSV() {
    exportTableToCSV("drilldown-table", "EduMetric_Drilldown_Data.csv");
}

function exportStudentCSV() {
    // For single student, we create a CSV from the displayed data or currentStudent object
    // Assuming currentStudent object is available globally or we can grab from DOM

    // Check if we have currentStudent data (it's usually set in analyseStudent)
    // If not, we scrape the basic info

    try {
        let data = [];
        // Header
        data.push(['Attribute', 'Value'].join(","));

        // Basic Info
        const basicInfo = document.getElementById("student-basic");
        if (basicInfo) {
            const text = basicInfo.innerText;
            // Parse text roughly if needed, or just dump it
            // Better to use currentStudent if available
            if (typeof currentStudent !== 'undefined' && currentStudent) {
                for (const [key, value] of Object.entries(currentStudent)) {
                    data.push(`"${key}","${value}"`);
                }
            } else {
                data.push(`"Report Content","${text.replace(/\n/g, ' ')}"`);
            }
        }

        // Add Summary
        const summary = document.getElementById("st-summary-text");
        if (summary) {
            data.push(`"AI Summary","${summary.innerText.replace(/\n/g, ' ')}"`);
        }

        downloadCSV(data.join("\n"), "EduMetric_Student_Report.csv");

    } catch (e) {
        console.error("Export error:", e);
        alert("Failed to export student data.");
    }
}