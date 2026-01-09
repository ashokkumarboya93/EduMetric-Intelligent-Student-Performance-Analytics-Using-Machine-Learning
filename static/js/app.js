/* ===========================================================
   GLOBAL STATE
   =========================================================== */
let globalStats = {};
let currentStudent = null;
let currentStudentResult = null;

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

    // Check if response is ok
    if (!response.ok) {
        console.error(`HTTP Error: ${response.status} ${response.statusText}`);
        throw new Error(`HTTP_ERROR_${response.status}`);
    }

    let text = await response.text();
    
    // Handle empty response
    if (!text || text.trim() === '') {
        console.warn("Empty response received");
        return { success: false, message: "Empty response from server" };
    }

    try {
        return JSON.parse(text);
    } catch (e) {
        console.error("Invalid JSON Response:", text.substring(0, 200));
        console.error("JSON Parse Error:", e);
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
    
    // Show landing by default; if running in development/debug, auto-open dashboard
    const isDebug = (window.EDUMETRIC_DEBUG === true || window.EDUMETRIC_DEBUG === 'true');
    if (landingPage) landingPage.style.display = isDebug ? 'none' : 'block';
    if (appShell) appShell.style.display = isDebug ? 'block' : 'none';
    
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
    document.addEventListener('keydown', function(e) {
        // ESC key to close modals
        if (e.key === 'Escape') {
            closeDrilldownModal();
            closeStudentModal();
            closeAlertModal();
        }
        
        // Ctrl/Cmd + number keys for quick navigation
        if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '6') {
            e.preventDefault();
            const modes = ['student', 'department', 'year', 'college', 'batch', 'crud'];
            const modeIndex = parseInt(e.key) - 1;
            if (modes[modeIndex]) {
                const navBtn = document.querySelector(`[data-mode="${modes[modeIndex]}"]`);
                if (navBtn) navBtn.click();
            }
        }
    });
    
    // Global click handler for closing modals when clicking outside
    document.addEventListener('click', function(e) {
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
                    // Keep existing options and add new ones
                    const existingOptions = Array.from(sel.options).map(opt => opt.value);
                    stats.departments.forEach(d => {
                        if (!existingOptions.includes(d)) {
                            const opt = document.createElement("option");
                            opt.value = d;
                            // Format department names properly
                            let displayName = d;
                            if (d === 'cse') displayName = 'Computer Science & Engineering';
                            else if (d === 'cse(ai)') displayName = 'CSE (Artificial Intelligence)';
                            else if (d === 'ece') displayName = 'Electronics & Communication';
                            else if (d === 'eee') displayName = 'Electrical & Electronics';
                            else if (d === 'mech') displayName = 'Mechanical Engineering';
                            else if (d === 'civil') displayName = 'Civil Engineering';
                            else if (d === 'cds') displayName = 'Computer & Data Science';
                            else displayName = d.toUpperCase();
                            opt.textContent = displayName;
                            sel.appendChild(opt);
                        }
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
                    // Keep existing options and add new ones
                    const existingOptions = Array.from(sel.options).map(opt => opt.value);
                    stats.years.forEach(y => {
                        if (!existingOptions.includes(y.toString())) {
                            const opt = document.createElement("option");
                            opt.value = y;
                            // Format year display properly
                            let yearSuffix = 'st';
                            if (y === 2) yearSuffix = 'nd';
                            else if (y === 3) yearSuffix = 'rd';
                            else if (y === 4) yearSuffix = 'th';
                            opt.textContent = `${y}${yearSuffix} Year`;
                            sel.appendChild(opt);
                        }
                    });
                }
            });
        }
        
        if (stats.years) {
            const dYear = document.getElementById("d-year");
            if (dYear) {
                // Keep existing "All Years" option
                const existingOptions = Array.from(dYear.options).map(opt => opt.value);
                stats.years.forEach(y => {
                    if (!existingOptions.includes(y.toString())) {
                        const opt = document.createElement("option");
                        opt.value = y;
                        // Format year display properly
                        let yearSuffix = 'st';
                        if (y === 2) yearSuffix = 'nd';
                        else if (y === 3) yearSuffix = 'rd';
                        else if (y === 4) yearSuffix = 'th';
                        opt.textContent = `${y}${yearSuffix} Year`;
                        dYear.appendChild(opt);
                    }
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
// Update navigation to initialize chat mode
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
                
                // Initialize chat mode if switching to chat
                if (mode === 'chat') {
                    setTimeout(initializeChatMode, 100);
                }
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

    console.log("Searching for student with payload:", payload);
    showLoading("Searching student...");
    
    try {
        const result = await api("/api/student/search", "POST", payload);
        console.log("Search result:", result);
        hideLoading();

        if (!result || !result.success) {
            const message = result?.message || "Student not found.";
            console.warn("Student search failed:", message);
            alert(message);
            return;
        }

        console.log("Student found successfully:", result.student);
        currentStudent = result.student;
        await analyseStudent(currentStudent);
    } catch (err) {
        hideLoading();
        console.error("Error in searchExistingStudent:", err);
        
        // Provide more specific error messages
        let errorMessage = "Error searching student. Please try again.";
        if (err.message === "NETWORK_ERROR") {
            errorMessage = "Network connection failed. Please check your internet connection.";
        } else if (err.message === "INVALID_JSON") {
            errorMessage = "Server response error. Please try again or contact support.";
        } else if (err.message.startsWith("HTTP_ERROR_")) {
            const statusCode = err.message.replace("HTTP_ERROR_", "");
            errorMessage = `Server error (${statusCode}). Please try again.`;
        }
        
        alert(errorMessage);
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

    // 1. SCATTER PLOT WITH LINE - Semester Marks Trend
    const marks = [];
    const semLabels = [];
    for (let i = 1; i <= 8; i++) {
        let k = `SEM${i}`;
        if (s[k] !== undefined && s[k] !== "" && s[k] !== null && parseFloat(s[k]) > 0) {
            marks.push(parseFloat(s[k]));
            semLabels.push(`Sem ${i}`);
        }
    }
    
    if (document.getElementById("st-chart-marks")) {
        const layout = {
            ...window.defaultLayout,
            title: { text: "Semester Performance Trend", font: { size: 16, color: '#1976d2' } },
            height: 300
        };
        
        Plotly.newPlot("st-chart-marks", [{
            x: semLabels, y: marks, type: "scatter", mode: "lines+markers",
            line: { width: 3, color: '#1976d2' },
            marker: { size: 8, color: '#1976d2' }
        }], layout, window.defaultChartConfig);
    }

    // 2. PIE CHART - Performance/Risk/Dropout Combined
    if (document.getElementById("st-chart-perf-pie")) {
        const layout = {
            ...window.defaultLayout,
            title: { text: "Performance Analysis", font: { size: 16, color: '#1976d2' } },
            height: 300
        };
        
        Plotly.newPlot("st-chart-perf-pie", [{
            labels: ["Performance", "Risk", "Dropout"],
            values: [f.performance_overall, f.risk_score, f.dropout_score],
            type: "pie",
            marker: { colors: ['#4CAF50', '#FF9800', '#F44336'] }
        }], layout, window.defaultChartConfig);
    }

    // 3. BAR CHART - Key Metrics
    if (document.getElementById("st-chart-metrics-bar")) {
        const layout = {
            ...window.defaultLayout,
            title: { text: "Key Metrics", font: { size: 16, color: '#1976d2' } },
            height: 300
        };
        
        Plotly.newPlot("st-chart-metrics-bar", [{
            x: ["Attendance", "Internal", "Behavior", "Performance"],
            y: [f.attendance_pct, f.internal_pct, f.behavior_pct, f.performance_overall],
            type: "bar",
            marker: { color: ['#00897b', '#4CAF50', '#9C27B0', '#1976d2'] }
        }], layout, window.defaultChartConfig);
    }

    // 4. 3D PLOT - Multi-dimensional Analysis
    if (document.getElementById("st-chart-3d-plot")) {
        const layout = {
            ...window.defaultLayout,
            title: { text: "3D Analysis", font: { size: 16, color: '#1976d2' } },
            scene: {
                xaxis: { title: "Attendance" }, yaxis: { title: "Performance" }, zaxis: { title: "Risk" }
            },
            height: 300
        };
        
        Plotly.newPlot("st-chart-3d-plot", [{
            x: [f.attendance_pct], y: [f.performance_overall], z: [f.risk_score],
            mode: "markers", type: "scatter3d",
            marker: { size: 12, color: f.performance_overall, colorscale: 'RdYlGn' }
        }], layout, window.defaultChartConfig);
    }

    // 5. RADAR CHART - Multi-dimensional Performance
    if (document.getElementById("st-chart-radar")) {
        const layout = {
            ...window.defaultLayout,
            title: { text: "Performance Radar", font: { size: 16, color: '#1976d2' } },
            polar: {
                radialaxis: { visible: true, range: [0, 100] }
            },
            height: 300
        };
        
        Plotly.newPlot("st-chart-radar", [{
            type: "scatterpolar",
            r: [f.performance_overall, f.attendance_pct, f.internal_pct, f.behavior_pct, 100-f.risk_score, 100-f.dropout_score],
            theta: ["Performance", "Attendance", "Internal", "Behavior", "Safety", "Retention"],
            fill: "toself",
            marker: { color: '#1976d2' },
            line: { color: '#1976d2' }
        }], layout, window.defaultChartConfig);
    }

    // 6. HEATMAP - Performance Matrix
    if (document.getElementById("st-chart-heatmap")) {
        const layout = {
            ...window.defaultLayout,
            title: { text: "Performance Heatmap", font: { size: 16, color: '#1976d2' } },
            height: 300
        };
        
        const heatmapData = [
            [f.performance_overall, f.attendance_pct],
            [f.internal_pct, f.behavior_pct],
            [100-f.risk_score, 100-f.dropout_score]
        ];
        
        Plotly.newPlot("st-chart-heatmap", [{
            z: heatmapData,
            x: ["Primary", "Secondary"],
            y: ["Performance", "Academics", "Risk Factors"],
            type: "heatmap",
            colorscale: "RdYlGn",
            showscale: true
        }], layout, window.defaultChartConfig);
    }

    // GAUGES ROW - Performance, Attendance, Risk
    if (document.getElementById("st-chart-gauge-perf")) {
        const layout = { title: { text: "Performance", font: { size: 14 } }, height: 200, margin: { l: 20, r: 20, t: 50, b: 20 } };
        Plotly.newPlot("st-chart-gauge-perf", [{
            type: "indicator", mode: "gauge+number", value: f.performance_overall,
            gauge: { axis: { range: [0, 100] }, bar: { color: "#1976d2" },
                steps: [{ range: [0, 50], color: "#ffcdd2" }, { range: [50, 75], color: "#fff9c4" }, { range: [75, 100], color: "#c8e6c9" }] }
        }], layout, window.defaultChartConfig);
    }

    if (document.getElementById("st-chart-gauge-att")) {
        const layout = { title: { text: "Attendance", font: { size: 14 } }, height: 200, margin: { l: 20, r: 20, t: 50, b: 20 } };
        Plotly.newPlot("st-chart-gauge-att", [{
            type: "indicator", mode: "gauge+number", value: f.attendance_pct,
            gauge: { axis: { range: [0, 100] }, bar: { color: "#00897b" },
                steps: [{ range: [0, 75], color: "#ffcdd2" }, { range: [75, 100], color: "#c8e6c9" }] }
        }], layout, window.defaultChartConfig);
    }

    if (document.getElementById("st-chart-gauge-risk")) {
        const layout = { title: { text: "Risk Level", font: { size: 14 } }, height: 200, margin: { l: 20, r: 20, t: 50, b: 20 } };
        Plotly.newPlot("st-chart-gauge-risk", [{
            type: "indicator", mode: "gauge+number", value: f.risk_score,
            gauge: { axis: { range: [0, 100] }, bar: { color: "#FF5722" },
                steps: [{ range: [0, 30], color: "#c8e6c9" }, { range: [30, 70], color: "#fff9c4" }, { range: [70, 100], color: "#ffcdd2" }] }
        }], layout, window.defaultChartConfig);
    }
}

/* ===========================================================
   RENDER STUDENT SUMMARY
   =========================================================== */
function renderStudentSummary(result) {
    const f = result.features;
    const p = result.predictions;

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

    // MANDATORY: Deterministic Summary Generation
    let trendAnalysis = "stable";
    const marks = [];
    for (let i = 1; i <= 8; i++) {
        const sem = result.student[`SEM${i}`];
        if (sem && parseFloat(sem) > 0) marks.push(parseFloat(sem));
    }
    if (marks.length >= 2) {
        const trend = marks[marks.length - 1] - marks[0];
        trendAnalysis = trend > 5 ? "improving" : trend < -5 ? "declining" : "stable";
    }

    let attendanceStatus = f.attendance_pct >= 85 ? "excellent" : f.attendance_pct >= 75 ? "adequate" : f.attendance_pct >= 60 ? "below optimal" : "critically low";
    let performanceLevel = p.performance_label === "high" ? "excellent" : p.performance_label === "medium" ? "moderate" : p.performance_label === "low" ? "concerning" : "critical";
    
    const summaryText = `The student shows ${performanceLevel} academic performance with ${trendAnalysis} semester trend. Attendance is ${attendanceStatus} level (${f.attendance_pct.toFixed(1)}%), contributing to ${p.risk_label} academic risk. Internal assessment performance is ${f.internal_pct >= 80 ? "strong" : f.internal_pct >= 60 ? "satisfactory" : "needs improvement"} at ${f.internal_pct.toFixed(1)}%.`;

    summaryDiv.innerHTML = `
        ${alertNotice}
        <p><i class="fa-solid fa-chart-bar"></i> <strong>Performance Summary:</strong> ${summaryText}</p>
        <p><i class="fa-solid fa-triangle-exclamation"></i> <strong>Risk Assessment:</strong> ${p.risk_label.toUpperCase()} risk (${f.risk_score.toFixed(1)}%), Dropout risk: ${p.dropout_label.toUpperCase()} (${f.dropout_score.toFixed(1)}%)</p>
        <p><i class="fa-solid fa-calendar-check"></i> <strong>Attendance Analysis:</strong> Current: ${f.attendance_pct.toFixed(1)}%, Previous: ${f.prev_att.toFixed(1)}%, Behavior: ${f.behavior_pct.toFixed(1)}%</p>
    `;

    function addSuggestion(t) {
        const li = document.createElement("li");
        li.innerHTML = `<i class="fa-solid fa-lightbulb" style="color: #1976d2; margin-right: 8px;"></i>${t}`;
        suggUl.appendChild(li);
    }

    // MANDATORY: Rule-based Suggestions (Not AI-generated)
    if (p.performance_label === "poor") {
        addSuggestion("<strong>CRITICAL:</strong> Immediate intervention required - schedule emergency counseling session within 24 hours.");
        addSuggestion("Implement intensive remedial program with daily 1-hour sessions for 2 weeks.");
        addSuggestion("Arrange peer tutoring with high-performing students in the same department.");
        addSuggestion("Contact parents/guardians immediately to discuss academic support strategies.");
    } else if (p.performance_label === "low") {
        addSuggestion("Schedule weekly mentoring sessions to monitor progress and provide support.");
        addSuggestion("Provide targeted practice materials focusing on weak subject areas.");
        addSuggestion("Implement structured study plan with specific milestones.");
    } else if (p.performance_label === "medium") {
        addSuggestion("Schedule bi-weekly mentoring sessions to monitor progress and prevent decline.");
        addSuggestion("Provide targeted practice materials focusing on weak subject areas.");
        addSuggestion("Create personalized study schedule with specific milestones and deadlines.");
    } else if (p.performance_label === "high") {
        addSuggestion("<strong>Excellent performance!</strong> Consider advanced learning opportunities and leadership roles.");
        addSuggestion("Encourage participation in academic competitions and research projects.");
    }
    
    // Risk-based suggestions
    if (p.risk_label === "high") {
        addSuggestion("Assign dedicated mentor for weekly one-on-one sessions to identify and address learning barriers.");
        addSuggestion("Conduct learning style assessment to customize teaching approach.");
        addSuggestion("Implement weekly progress tracking with specific, measurable goals.");
    }
    
    // Dropout prevention strategies
    if (p.dropout_label === "high") {
        addSuggestion("<strong>HIGH DROPOUT RISK:</strong> Implement comprehensive retention strategy immediately.");
        addSuggestion("Engage family support system - schedule parent-teacher conference within 48 hours.");
        addSuggestion("Connect with student counseling services for emotional and academic support.");
    } else if (p.dropout_label === "medium") {
        addSuggestion("Monitor closely for early warning signs and maintain regular check-ins.");
        addSuggestion("Highlight student's strengths and celebrate small wins to boost motivation.");
    }
    
    // Attendance-specific interventions
    if (f.attendance_pct < 60) {
        addSuggestion("<strong>CRITICAL ATTENDANCE ISSUE:</strong> Investigate underlying causes (health, transportation, family issues).");
        addSuggestion("Implement daily attendance monitoring with immediate follow-up for absences.");
    } else if (f.attendance_pct < 75) {
        addSuggestion("Create structured attendance improvement plan with weekly targets and rewards.");
        addSuggestion("Set up automated attendance alerts for parents/guardians.");
    }
    
    // Internal marks improvement
    if (f.internal_pct < 40) {
        addSuggestion("<strong>URGENT:</strong> Conduct diagnostic assessment to identify specific knowledge gaps.");
        addSuggestion("Provide intensive subject-specific tutoring with qualified instructors.");
    } else if (f.internal_pct < 60) {
        addSuggestion("Increase frequency of internal assessments and provide immediate feedback.");
        addSuggestion("Focus on concept clarity through visual aids and practical examples.");
    }
    
    // Positive reinforcement for good performance
    if (f.performance_overall >= 80) {
        addSuggestion("<strong>Outstanding performance!</strong> Consider nominating for academic excellence awards.");
        addSuggestion("Encourage student to mentor struggling peers - benefits both parties.");
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

    const email = "ashokkumarboya93@gmail.com";
    
    const payload = {
        mentor_email: email,
        student_name: s.NAME,
        student_rno: s.RNO,
        performance: p.performance_label,
        risk: p.risk_label,
        dropout: p.dropout_label
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
    
    const payload = { dept: dept, year: year };
    showLoading("Analysing department...");
    
    try {
        const res = await api("/api/department/analyze", "POST", payload);
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
        
        // 1. PIE CHART - Performance Levels + Risk + Dropout (4-5 segments)
        if (document.getElementById("dept-chart-1")) {
            const perfCounts = res.label_counts?.performance || {};
            const highRisk = res.stats?.high_risk || 0;
            const highDrop = res.stats?.high_dropout || 0;
            const labels = [];
            const values = [];
            const colors = [];
            
            if (perfCounts.high) { labels.push('High Performance'); values.push(perfCounts.high); colors.push('#4CAF50'); }
            if (perfCounts.medium) { labels.push('Medium Performance'); values.push(perfCounts.medium); colors.push('#FF9800'); }
            if (perfCounts.low) { labels.push('Low Performance'); values.push(perfCounts.low); colors.push('#F44336'); }
            labels.push('High Risk'); values.push(highRisk); colors.push('#E91E63');
            labels.push('High Dropout'); values.push(highDrop); colors.push('#9C27B0');
            
            const layout = {
                title: { text: "Department Overview", font: { size: 16, color: '#1976d2' } },
                height: 380,
                margin: { l: 40, r: 40, t: 60, b: 40 },
                showlegend: true,
                legend: { orientation: 'v', x: 1, y: 0.5 }
            };
            Plotly.newPlot("dept-chart-1", [{
                labels: labels, values: values, type: "pie",
                marker: { colors: colors },
                textinfo: 'label+value', textposition: 'auto',
                hovertemplate: '<b>%{label}</b><br>Count: %{value}<br>%{percent}<extra></extra>'
            }], layout, window.defaultChartConfig);
        }
        
        // 2. BAR CHART - Year-wise Performance Ranking
        if (document.getElementById("dept-chart-2")) {
            const yearPerf = {};
            (res.table || []).forEach(s => {
                const year = s.YEAR || 0;
                if (!yearPerf[year]) yearPerf[year] = [];
                yearPerf[year].push(s.performance_overall || 0);
            });
            const years = Object.keys(yearPerf).sort();
            const avgPerfs = years.map(y => yearPerf[y].reduce((a,b) => a+b, 0) / yearPerf[y].length);
            const layout = {
                title: { text: "Year-wise Performance Ranking", font: { size: 16, color: '#1976d2' } },
                xaxis: { title: "Year" }, yaxis: { title: "Average Performance %" },
                height: 380, margin: { l: 60, r: 40, t: 60, b: 60 }
            };
            Plotly.newPlot("dept-chart-2", [{
                x: years.map(y => `Year ${y}`), y: avgPerfs, type: "bar",
                marker: { color: avgPerfs, colorscale: 'RdYlGn', showscale: true },
                text: avgPerfs.map(v => v.toFixed(1) + '%'), textposition: 'outside',
                hovertemplate: '<b>%{x}</b><br>Avg Performance: %{y:.1f}%<extra></extra>'
            }], layout, window.defaultChartConfig);
        }
        
        // 3. SCATTER 3D PLOT
        if (document.getElementById("dept-chart-3")) {
            const perfScores = res.scores?.performance || [];
            const riskScores = res.scores?.risk || [];
            const dropScores = res.scores?.dropout || [];
            const layout = {
                title: { text: "3D Performance-Risk-Dropout", font: { size: 16, color: '#1976d2' } },
                scene: { xaxis: { title: "Performance" }, yaxis: { title: "Risk" }, zaxis: { title: "Dropout" } },
                height: 380, margin: { l: 40, r: 40, t: 60, b: 40 }
            };
            Plotly.newPlot("dept-chart-3", [{
                x: perfScores, y: riskScores, z: dropScores,
                mode: "markers", type: "scatter3d",
                marker: { size: 5, color: perfScores, colorscale: 'Viridis', showscale: true }
            }], layout, window.defaultChartConfig);
        }
        
        // 4. HEATMAP - Student Metrics Correlation
        if (document.getElementById("dept-chart-4")) {
            const students = (res.table || []).slice(0, 20);
            const perfData = students.map(s => s.performance_overall || 0);
            const attData = students.map(s => s.attendance_pct || 0);
            const riskData = students.map(s => s.risk_score || 0);
            const heatData = [perfData, attData, riskData];
            const layout = {
                title: { text: "Student Metrics Heatmap", font: { size: 16, color: '#1976d2' } },
                xaxis: { title: "Students (Sample)" },
                yaxis: { ticktext: ['Performance', 'Attendance', 'Risk'], tickvals: [0, 1, 2] },
                height: 380, margin: { l: 60, r: 40, t: 60, b: 60 }
            };
            Plotly.newPlot("dept-chart-4", [{
                z: heatData, type: "heatmap", colorscale: 'RdYlGn', showscale: true,
                hovertemplate: 'Student %{x}<br>%{y}: %{z:.1f}%<extra></extra>'
            }], layout, window.defaultChartConfig);
        }
        
        // 5. RADAR CHART - Department Strengths
        if (document.getElementById("dept-chart-5")) {
            const avgPerf = res.stats?.avg_performance || 0;
            const avgAtt = ((res.table || []).reduce((sum, s) => sum + (s.attendance_pct || 0), 0) / (res.table || []).length) || 0;
            const avgInt = ((res.table || []).reduce((sum, s) => sum + (s.internal_pct || 0), 0) / (res.table || []).length) || 0;
            const avgBeh = ((res.table || []).reduce((sum, s) => sum + (s.behavior_pct || 0), 0) / (res.table || []).length) || 0;
            const avgRisk = ((res.table || []).reduce((sum, s) => sum + (s.risk_score || 0), 0) / (res.table || []).length) || 0;
            const layout = {
                title: { text: "Department Strengths Radar", font: { size: 16, color: '#1976d2' } },
                polar: { radialaxis: { visible: true, range: [0, 100] } },
                height: 400, margin: { l: 60, r: 60, t: 80, b: 60 }
            };
            Plotly.newPlot("dept-chart-5", [{
                type: "scatterpolar",
                r: [avgPerf, avgAtt, avgInt, avgBeh, 100-avgRisk],
                theta: ["Performance", "Attendance", "Internal", "Behavior", "Safety"],
                fill: "toself", marker: { color: '#1976d2' }, line: { color: '#1976d2', width: 2 },
                hovertemplate: '<b>%{theta}</b><br>Score: %{r:.1f}%<extra></extra>'
            }], layout, window.defaultChartConfig);
        }
        
        // Add drill-down handlers for department charts
        setTimeout(() => {
            addDepartmentDrilldownHandlers(dept, year);
            addChartClickHandlers('department', dept, year);
        }, 1000);
        
        const summaryEl = document.getElementById("dept-summary");
        const suggestionsEl = document.getElementById("dept-suggestions");
        
        if (summaryEl) {
            const avgPerf = st.avg_performance || 0;
            const avgRisk = ((res.table || []).reduce((sum, s) => sum + (s.risk_score || 0), 0) / (res.table || []).length) || 0;
            const avgDrop = ((res.table || []).reduce((sum, s) => sum + (s.dropout_score || 0), 0) / (res.table || []).length) || 0;
            const avgAtt = ((res.table || []).reduce((sum, s) => sum + (s.attendance_pct || 0), 0) / (res.table || []).length) || 0;
            
            const perfLevel = avgPerf >= 75 ? "excellent" : avgPerf >= 60 ? "good" : avgPerf >= 50 ? "moderate" : "concerning";
            const riskLevel = avgRisk >= 70 ? "high" : avgRisk >= 40 ? "moderate" : "low";
            const attLevel = avgAtt >= 85 ? "excellent" : avgAtt >= 75 ? "good" : avgAtt >= 60 ? "moderate" : "critical";
            
            summaryEl.innerHTML = `
                <p><i class="fa-solid fa-chart-bar"></i> <strong>Department Overview:</strong> ${st.total_students || 0} students with ${perfLevel} average performance (${avgPerf.toFixed(1)}%). Department shows ${riskLevel} risk level with ${avgRisk.toFixed(1)}% average risk score.</p>
                <p><i class="fa-solid fa-users"></i> <strong>Performance Breakdown:</strong> ${st.high_performers || 0} high performers, ${st.high_risk || 0} high-risk students, ${st.high_dropout || 0} high dropout risk students.</p>
                <p><i class="fa-solid fa-calendar-check"></i> <strong>Attendance Status:</strong> ${attLevel} level with ${avgAtt.toFixed(1)}% average attendance. Dropout risk average: ${avgDrop.toFixed(1)}%.</p>
            `;
        }
        
        if (suggestionsEl) {
            suggestionsEl.innerHTML = "";
            const suggestions = [];
            
            const avgPerf = st.avg_performance || 0;
            const avgRisk = ((res.table || []).reduce((sum, s) => sum + (s.risk_score || 0), 0) / (res.table || []).length) || 0;
            const avgAtt = ((res.table || []).reduce((sum, s) => sum + (s.attendance_pct || 0), 0) / (res.table || []).length) || 0;
            
            if (avgPerf < 50) {
                suggestions.push("<strong>CRITICAL:</strong> Department performance is concerning. Implement immediate remedial programs and intensive faculty training.");
                suggestions.push("Conduct department-wide assessment to identify systemic issues affecting student performance.");
            } else if (avgPerf < 60) {
                suggestions.push("Department performance needs improvement. Implement peer tutoring and additional support sessions.");
                suggestions.push("Increase faculty-student interaction through weekly office hours and mentoring programs.");
            } else if (avgPerf >= 75) {
                suggestions.push("<strong>Excellent!</strong> Department shows strong performance. Consider advanced learning opportunities and research projects.");
                suggestions.push("Encourage top performers to participate in competitions and publish research papers.");
            }
            
            if (avgRisk >= 70) {
                suggestions.push("<strong>HIGH RISK ALERT:</strong> Establish emergency intervention task force with weekly monitoring for at-risk students.");
                suggestions.push("Implement early warning system with automated alerts for declining performance trends.");
            } else if (avgRisk >= 40) {
                suggestions.push("Moderate risk level detected. Increase mentor-student interaction frequency to bi-weekly sessions.");
                suggestions.push("Provide targeted support for students showing early warning signs of academic difficulty.");
            }
            
            if (avgAtt < 60) {
                suggestions.push("<strong>CRITICAL ATTENDANCE ISSUE:</strong> Investigate systemic causes and implement daily attendance monitoring with immediate follow-up.");
                suggestions.push("Engage parents/guardians through automated attendance alerts and monthly progress meetings.");
            } else if (avgAtt < 75) {
                suggestions.push("Attendance below optimal level. Create structured improvement plan with weekly targets and incentives.");
                suggestions.push("Implement attendance rewards program to motivate consistent participation.");
            }
            
            if (st.high_dropout > st.total_students * 0.15) {
                suggestions.push("<strong>DROPOUT RISK:</strong> Create retention task force to address dropout concerns through counseling and career guidance.");
                suggestions.push("Implement student engagement programs including extracurricular activities and skill development workshops.");
            }
            
            if (suggestions.length === 0) {
                suggestions.push("Department performance is satisfactory. Continue current strategies and maintain regular monitoring.");
                suggestions.push("Focus on continuous improvement through feedback collection and periodic assessments.");
            }
            
            suggestions.forEach(s => {
                const li = document.createElement("li");
                li.innerHTML = `<i class="fa-solid fa-lightbulb" style="color: #1976d2; margin-right: 8px;"></i>${s}`;
                suggestionsEl.appendChild(li);
            });
        }
    } catch (error) {
        hideLoading();
        console.error("Department analysis error:", error);
        alert("Department analysis failed due to network error. Please try again.");
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
    
    const payload = { year: year };
    showLoading(`Analysing Year ${year} - Following Year-wise Analytics Specification...`);
    
    try {
        const res = await api("/api/year/analyze", "POST", payload);
        hideLoading();
        
        if (!res || !res.success) { 
            alert(res?.message || "Year analysis failed. Please try again."); 
            return; 
        }
        
        const reportDiv = document.getElementById("year-report");
        if (reportDiv) reportDiv.classList.remove("hidden");
        
        const st = res.stats || {};
        
        // MANDATORY KPIs following year-wise analytics specification
        const elements = {
            "year-kpi-total": `<i class="fa-solid fa-users"></i> Total Students<br><b>${st.total_students || 0}</b>`,
            "year-kpi-high-perf": `<i class="fa-solid fa-graduation-cap"></i> High Performers<br><b>${st.high_performers || 0}</b>`,
            "year-kpi-high-risk": `<i class="fa-solid fa-triangle-exclamation"></i> High Risk<br><b>${st.high_risk || 0}</b>`,
            "year-kpi-avg-att": `<i class="fa-solid fa-calendar-check"></i> Avg Attendance<br><b>${st.avg_attendance || 0}%</b>`
        };
        
        Object.entries(elements).forEach(([id, html]) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = html;
        });
        
        // Fill table with year-filtered data (SAFETY RULE: year-first filtering)
        fillGroupTable("year-table", (res.table || []).slice(0, 120), true);
        
        // 1. PERFORMANCE DISTRIBUTION ANALYTICS (MANDATORY)
        if (document.getElementById("year-chart-perf-donut")) {
            const perfCounts = res.label_counts?.performance || {};
            console.log('Performance counts:', perfCounts);
            const labels = Object.keys(perfCounts).filter(k => perfCounts[k] > 0);
            const values = labels.map(k => perfCounts[k]);
            const colors = labels.map(k => k === 'high' ? '#4CAF50' : k === 'medium' ? '#FF9800' : '#F44336');
            
            if (labels.length === 0 || values.every(v => v === 0)) {
                document.getElementById("year-chart-perf-donut").innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 400px; color: #666; font-size: 16px;">No performance data available for Year ${year}</div>`;
            } else {
                const layout = {
                    title: { text: `Year ${year} Performance Distribution`, font: { size: 16, color: '#1976d2' } },
                    height: 400,
                    showlegend: true,
                    legend: { orientation: 'h', y: -0.1 }
                };
                
                Plotly.newPlot("year-chart-perf-donut", [{
                    labels: labels.map(l => l.toUpperCase()), 
                    values: values,
                    type: "pie", 
                    hole: 0.4,
                    marker: { colors: colors },
                    textinfo: 'label+percent+value',
                    hovertemplate: '<b>%{label}</b><br>Students: %{value}<br>Percentage: %{percent}<extra></extra>'
                }], layout, window.defaultChartConfig);
            }
        }
        
        // 2. DEPARTMENT-WISE PERFORMANCE RANKING (CRITICAL INSIGHT)
        if (document.getElementById("year-chart-dept-ranking")) {
            const deptPerf = res.department_performance || {};
            const depts = Object.keys(deptPerf).sort((a, b) => deptPerf[b] - deptPerf[a]);
            const perfScores = depts.map(d => deptPerf[d]);
            
            if (depts.length === 0) {
                document.getElementById("year-chart-dept-ranking").innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 400px; color: #666; font-size: 16px;">No department data available for Year ${year}</div>`;
            } else {
                const layout = {
                    title: { text: `Year ${year} Department Performance Ranking`, font: { size: 16, color: '#1976d2' } },
                    xaxis: { title: "Department" },
                    yaxis: { title: "Average Performance (%)" },
                    height: 400
                };
                
                Plotly.newPlot("year-chart-dept-ranking", [{
                    x: depts.map(d => d.toUpperCase()),
                    y: perfScores,
                    type: "bar",
                    marker: { 
                        color: perfScores,
                        colorscale: 'RdYlGn',
                        showscale: true,
                        colorbar: { title: "Performance %" }
                    },
                    text: perfScores.map(p => p.toFixed(1) + '%'),
                    textposition: 'outside',
                    hovertemplate: '<b>%{x}</b><br>Avg Performance: %{y:.1f}%<extra></extra>'
                }], layout, window.defaultChartConfig);
            }
        }
        
        // 3. RISK AND DROPOUT ANALYTICS (MANDATORY)
        if (document.getElementById("year-chart-risk-donut")) {
            const riskCounts = res.label_counts?.risk || {};
            console.log('Risk counts:', riskCounts);
            const riskLabels = Object.keys(riskCounts).filter(k => riskCounts[k] > 0);
            const riskValues = riskLabels.map(k => riskCounts[k]);
            const riskColors = riskLabels.map(k => k === 'high' ? '#F44336' : k === 'medium' ? '#FF9800' : '#4CAF50');
            
            if (riskLabels.length === 0 || riskValues.every(v => v === 0)) {
                document.getElementById("year-chart-risk-donut").innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 400px; color: #666; font-size: 16px;">No risk data available for Year ${year}</div>`;
            } else {
                const layout = {
                    title: { text: `Year ${year} Risk Distribution`, font: { size: 16, color: '#1976d2' } },
                    height: 400,
                    showlegend: true,
                    legend: { orientation: 'h', y: -0.1 }
                };
                
                Plotly.newPlot("year-chart-risk-donut", [{
                    labels: riskLabels.map(l => l.toUpperCase() + ' RISK'), 
                    values: riskValues,
                    type: "pie", 
                    hole: 0.4,
                    marker: { colors: riskColors },
                    textinfo: 'label+percent+value',
                    hovertemplate: '<b>%{label}</b><br>Students: %{value}<br>Percentage: %{percent}<extra></extra>'
                }], layout, window.defaultChartConfig);
            }
        }
        
        // 4. ATTENDANCE VS PERFORMANCE INSIGHT (CRITICAL INSIGHT)
        if (document.getElementById("year-chart-attendance-perf")) {
            const attendanceData = res.attendance_performance || [];
            
            if (attendanceData.length === 0) {
                document.getElementById("year-chart-attendance-perf").innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 400px; color: #666; font-size: 16px;">No attendance data available for Year ${year}</div>`;
            } else {
                const layout = {
                    title: { text: `Year ${year} Attendance vs Performance Analysis`, font: { size: 16, color: '#1976d2' } },
                    xaxis: { title: "Attendance (%)" },
                    yaxis: { title: "Performance (%)" },
                    height: 400
                };
                
                Plotly.newPlot("year-chart-attendance-perf", [{
                    x: attendanceData.map(d => d.attendance),
                    y: attendanceData.map(d => d.performance),
                    mode: "markers",
                    type: "scatter",
                    marker: { 
                        color: attendanceData.map(d => d.performance),
                        colorscale: 'RdYlGn',
                        showscale: true,
                        size: 8,
                        opacity: 0.7
                    },
                    hovertemplate: '<b>Student</b><br>Attendance: %{x:.1f}%<br>Performance: %{y:.1f}%<extra></extra>'
                }], layout, window.defaultChartConfig);
            }
        }
        
        // 5. DEPARTMENT-WISE RISK CONCENTRATION (CRITICAL INSIGHT)
        if (document.getElementById("year-chart-dept-risk")) {
            const deptRisk = res.department_risk || {};
            const riskDepts = Object.keys(deptRisk);
            const riskCounts = riskDepts.map(d => deptRisk[d]);
            
            if (riskDepts.length === 0) {
                document.getElementById("year-chart-dept-risk").innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 400px; color: #666; font-size: 16px;">No department risk data available for Year ${year}</div>`;
            } else {
                const layout = {
                    title: { text: `Year ${year} Department Risk Concentration`, font: { size: 16, color: '#1976d2' } },
                    xaxis: { title: "Department" },
                    yaxis: { title: "High Risk Students" },
                    height: 400
                };
                
                Plotly.newPlot("year-chart-dept-risk", [{
                    x: riskDepts.map(d => d.toUpperCase()),
                    y: riskCounts,
                    type: "bar",
                    marker: { 
                        color: riskCounts,
                        colorscale: 'Reds',
                        showscale: true
                    },
                    text: riskCounts,
                    textposition: 'outside',
                    hovertemplate: '<b>%{x}</b><br>High Risk Students: %{y}<extra></extra>'
                }], layout, window.defaultChartConfig);
            }
        }
        
        // Add drill-down handlers for year charts (SAFETY RULES)
        setTimeout(() => {
            addYearDrilldownHandlers(year);
            addChartClickHandlers('year', year);
        }, 1000);
        
        // ANALYTICS SUMMARY (TEXT INSIGHT) - MANDATORY
        const summaryEl = document.getElementById("year-summary");
        if (summaryEl) {
            const avgPerf = st.avg_performance || 0;
            const avgRisk = st.avg_risk || 0;
            const avgAtt = st.avg_attendance || 0;
            const totalStudents = st.total_students || 0;
            const highRiskCount = st.high_risk || 0;
            
            const perfLevel = avgPerf >= 75 ? "excellent" : avgPerf >= 60 ? "good" : avgPerf >= 50 ? "moderate" : "concerning";
            const riskLevel = avgRisk >= 70 ? "high" : avgRisk >= 40 ? "moderate" : "low";
            const attLevel = avgAtt >= 85 ? "excellent" : avgAtt >= 75 ? "good" : avgAtt >= 60 ? "moderate" : "critical";
            
            summaryEl.innerHTML = `
                <p><i class="fa-solid fa-chart-bar"></i> <strong>Year ${year} Academic Health Overview:</strong> ${totalStudents} students with ${perfLevel} average performance (${avgPerf.toFixed(1)}%). This academic year shows ${riskLevel} risk level with ${avgRisk.toFixed(1)}% average risk score.</p>
                <p><i class="fa-solid fa-users"></i> <strong>Performance Distribution:</strong> ${st.high_performers || 0} high performers (${((st.high_performers || 0) / totalStudents * 100).toFixed(1)}%), ${highRiskCount} high-risk students requiring immediate attention (${(highRiskCount / totalStudents * 100).toFixed(1)}%).</p>
                <p><i class="fa-solid fa-calendar-check"></i> <strong>Attendance Analysis:</strong> ${attLevel} level with ${avgAtt.toFixed(1)}% average attendance across all departments in Year ${year}. Strong correlation observed between attendance and academic performance.</p>
            `;
        }
        
        // SUGGESTIONS (ACTIONABLE RECOMMENDATIONS) - MANDATORY
        const suggestionsEl = document.getElementById("year-suggestions");
        if (suggestionsEl) {
            suggestionsEl.innerHTML = "";
            const suggestions = [];
            
            const avgPerf = st.avg_performance || 0;
            const avgRisk = st.avg_risk || 0;
            const avgAtt = st.avg_attendance || 0;
            const highRiskCount = st.high_risk || 0;
            const totalStudents = st.total_students || 0;
            
            // Year-specific performance suggestions (ACTIONABLE)
            if (avgPerf < 50) {
                suggestions.push(`<strong>CRITICAL YEAR ALERT:</strong> Year ${year} performance is concerning (${avgPerf.toFixed(1)}%). Implement immediate year-wide remedial programs and intensive faculty coordination.`);
                suggestions.push(`Conduct Year ${year} academic review meeting with all department HODs to identify systemic issues affecting student performance.`);
                suggestions.push(`Establish Year ${year} emergency intervention task force with weekly monitoring for all students below 50% performance.`);
            } else if (avgPerf < 60) {
                suggestions.push(`Year ${year} performance needs improvement (${avgPerf.toFixed(1)}%). Organize inter-departmental peer tutoring and additional support sessions.`);
                suggestions.push(`Increase faculty coordination for Year ${year} with bi-weekly progress reviews and targeted interventions.`);
            } else if (avgPerf >= 75) {
                suggestions.push(`<strong>Excellent!</strong> Year ${year} shows strong performance (${avgPerf.toFixed(1)}%). Consider advanced learning opportunities and research project initiatives.`);
                suggestions.push(`Encourage Year ${year} top performers to mentor junior years and participate in academic competitions.`);
            }
            
            // Risk-based year suggestions (TARGETED INTERVENTION)
            if (avgRisk >= 70 || highRiskCount > totalStudents * 0.2) {
                suggestions.push(`<strong>HIGH RISK YEAR:</strong> Year ${year} has ${highRiskCount} high-risk students (${(highRiskCount/totalStudents*100).toFixed(1)}%). Establish year-specific intervention task force with daily monitoring.`);
                suggestions.push(`Implement early warning system for Year ${year} with automated alerts for declining performance trends and immediate mentor assignment.`);
            } else if (avgRisk >= 40) {
                suggestions.push(`Moderate risk detected in Year ${year}. Increase mentor-student interaction frequency to bi-weekly sessions across all departments.`);
                suggestions.push(`Create Year ${year} peer support groups to help struggling students and prevent academic decline.`);
            }
            
            // Attendance-based year suggestions (RETENTION STRATEGY)
            if (avgAtt < 60) {
                suggestions.push(`<strong>CRITICAL ATTENDANCE ISSUE:</strong> Year ${year} attendance is critically low (${avgAtt.toFixed(1)}%). Investigate year-specific causes and implement daily monitoring with immediate follow-up.`);
                suggestions.push(`Engage Year ${year} parents through automated attendance alerts and monthly progress meetings to improve retention.`);
            } else if (avgAtt < 75) {
                suggestions.push(`Year ${year} attendance below optimal level (${avgAtt.toFixed(1)}%). Create structured improvement plan with weekly targets and year-specific incentives.`);
                suggestions.push(`Implement Year ${year} attendance rewards program to motivate consistent participation and academic engagement.`);
            }
            
            // Department-specific suggestions (TARGETED SUPPORT)
            const deptPerf = res.department_performance || {};
            const weakDepts = Object.keys(deptPerf).filter(d => deptPerf[d] < 50);
            const strongDepts = Object.keys(deptPerf).filter(d => deptPerf[d] >= 75);
            
            if (weakDepts.length > 0) {
                suggestions.push(`<strong>DEPARTMENT FOCUS:</strong> In Year ${year}, departments ${weakDepts.join(', ')} need immediate attention with performance below 50%. Assign dedicated faculty mentors.`);
                suggestions.push(`Organize department-specific remedial sessions for Year ${year} students in underperforming departments with intensive skill-building programs.`);
            }
            
            if (strongDepts.length > 0) {
                suggestions.push(`<strong>EXCELLENCE RECOGNITION:</strong> Departments ${strongDepts.join(', ')} in Year ${year} show excellent performance. Use as mentoring models for other departments.`);
            }
            
            // Default suggestions if performance is satisfactory
            if (suggestions.length === 0) {
                suggestions.push(`Year ${year} performance is satisfactory (${avgPerf.toFixed(1)}%). Continue current strategies and maintain regular monitoring with quarterly assessments.`);
                suggestions.push(`Focus on continuous improvement for Year ${year} through feedback collection, periodic assessments, and proactive student engagement initiatives.`);
            }
            
            // Add year-specific action items
            suggestions.push(`<strong>IMMEDIATE ACTIONS:</strong> Schedule Year ${year} faculty meeting within 48 hours to discuss findings and implement targeted interventions.`);
            suggestions.push(`<strong>MONITORING:</strong> Establish weekly progress tracking for Year ${year} with specific, measurable goals and regular reporting to management.`);
            
            suggestions.forEach(s => {
                const li = document.createElement("li");
                li.innerHTML = `<i class="fa-solid fa-lightbulb" style="color: #1976d2; margin-right: 8px;"></i>${s}`;
                suggestionsEl.appendChild(li);
            });
        }
    } catch (error) {
        hideLoading();
        console.error("Year analysis error:", error);
        alert("Year analysis failed due to network error. Please try again.");
    }
}

async function analyseCollege() {
    showLoading("Analysing college - Following College-Level Analytics Specification...");
    
    try {
        const res = await api("/api/college/analyze", "GET");
        hideLoading();
        
        if (!res || !res.success) { 
            alert(res?.message || "College analysis failed. Please try again."); 
            return; 
        }
        
        const reportDiv = document.getElementById("college-report");
        if (reportDiv) reportDiv.classList.remove("hidden");
        
        const st = res.stats || {};
        
        // COLLEGE-LEVEL KPIs (TOP-LEVEL SNAPSHOT)
        const elements = {
            "clg-kpi-total": `<i class="fa-solid fa-users"></i> Total Students<br><b>${st.total_students || 0}</b>`,
            "clg-kpi-high-perf": `<i class="fa-solid fa-graduation-cap"></i> High Performers<br><b>${st.high_performers || 0}</b>`,
            "clg-kpi-high-risk": `<i class="fa-solid fa-triangle-exclamation"></i> High Risk<br><b>${st.high_risk || 0}</b>`,
            "clg-kpi-avg-att": `<i class="fa-solid fa-calendar-check"></i> Avg Attendance<br><b>${st.avg_attendance || 0}%</b>`
        };
        
        Object.entries(elements).forEach(([id, html]) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = html;
        });
        
        // Fill table with ALL students (NO FILTERS)
        fillGroupTable("clg-table", (res.table || []).slice(0, 150), true);
        
        // 1. OVERALL PERFORMANCE DISTRIBUTION ANALYTICS
        if (document.getElementById("clg-chart-perf-donut")) {
            const perfCounts = res.label_counts?.performance || {};
            const labels = Object.keys(perfCounts).filter(k => perfCounts[k] > 0);
            const values = labels.map(k => perfCounts[k]);
            const colors = labels.map(k => k === 'high' ? '#4CAF50' : k === 'medium' ? '#FF9800' : '#F44336');
            
            if (labels.length === 0 || values.every(v => v === 0)) {
                document.getElementById("clg-chart-perf-donut").innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 400px; color: #666; font-size: 16px;">No performance data available</div>`;
            } else {
                const layout = {
                    title: { text: 'Overall Performance Distribution', font: { size: 16, color: '#1976d2' } },
                    height: 400,
                    showlegend: true,
                    legend: { orientation: 'h', y: -0.1 }
                };
                
                Plotly.newPlot("clg-chart-perf-donut", [{
                    labels: labels.map(l => l.toUpperCase()), 
                    values: values,
                    type: "pie", 
                    hole: 0.4,
                    marker: { colors: colors },
                    textinfo: 'label+percent+value',
                    hovertemplate: '<b>%{label}</b><br>Students: %{value}<br>Percentage: %{percent}<extra></extra>'
                }], layout, window.defaultChartConfig);
            }
        }
        
        // 2. RISK DISTRIBUTION ANALYTICS
        if (document.getElementById("clg-chart-risk-donut")) {
            const riskCounts = res.label_counts?.risk || {};
            const riskLabels = Object.keys(riskCounts).filter(k => riskCounts[k] > 0);
            const riskValues = riskLabels.map(k => riskCounts[k]);
            const riskColors = riskLabels.map(k => k === 'high' ? '#F44336' : k === 'medium' ? '#FF9800' : '#4CAF50');
            
            if (riskLabels.length === 0 || riskValues.every(v => v === 0)) {
                document.getElementById("clg-chart-risk-donut").innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 400px; color: #666; font-size: 16px;">No risk data available</div>`;
            } else {
                const layout = {
                    title: { text: 'Risk Distribution Analytics', font: { size: 16, color: '#1976d2' } },
                    height: 400,
                    showlegend: true,
                    legend: { orientation: 'h', y: -0.1 }
                };
                
                Plotly.newPlot("clg-chart-risk-donut", [{
                    labels: riskLabels.map(l => l.toUpperCase() + ' RISK'), 
                    values: riskValues,
                    type: "pie", 
                    hole: 0.4,
                    marker: { colors: riskColors },
                    textinfo: 'label+percent+value',
                    hovertemplate: '<b>%{label}</b><br>Students: %{value}<br>Percentage: %{percent}<extra></extra>'
                }], layout, window.defaultChartConfig);
            }
        }
        
        // 3. DEPARTMENT-WISE PERFORMANCE COMPARISON (RANKING)
        if (document.getElementById("clg-chart-dept-perf")) {
            const deptPerf = res.department_performance || {};
            const depts = Object.keys(deptPerf).sort((a, b) => deptPerf[b] - deptPerf[a]);
            const perfScores = depts.map(d => deptPerf[d]);
            
            if (depts.length === 0) {
                document.getElementById("clg-chart-dept-perf").innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 400px; color: #666; font-size: 16px;">No department data available</div>`;
            } else {
                const layout = {
                    title: { text: 'Department-wise Performance Comparison', font: { size: 16, color: '#1976d2' } },
                    xaxis: { title: "Department" },
                    yaxis: { title: "Average Performance (%)" },
                    height: 400
                };
                
                Plotly.newPlot("clg-chart-dept-perf", [{
                    x: depts.map(d => d.toUpperCase()),
                    y: perfScores,
                    type: "bar",
                    marker: { 
                        color: perfScores,
                        colorscale: 'RdYlGn',
                        showscale: true,
                        colorbar: { title: "Performance %" }
                    },
                    text: perfScores.map(p => p.toFixed(1) + '%'),
                    textposition: 'outside',
                    hovertemplate: '<b>%{x}</b><br>Avg Performance: %{y:.1f}%<extra></extra>'
                }], layout, window.defaultChartConfig);
            }
        }
        
        // 4. YEAR-WISE PERFORMANCE TREND (COLLEGE CONTEXT)
        if (document.getElementById("clg-chart-year-trend")) {
            const yearPerf = res.year_performance || {};
            const years = Object.keys(yearPerf).sort();
            const yearPerfScores = years.map(y => yearPerf[y]);
            
            if (years.length === 0) {
                document.getElementById("clg-chart-year-trend").innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 400px; color: #666; font-size: 16px;">No year data available</div>`;
            } else {
                const layout = {
                    title: { text: 'Year-wise Performance Trend', font: { size: 16, color: '#1976d2' } },
                    xaxis: { title: "Academic Year" },
                    yaxis: { title: "Average Performance (%)" },
                    height: 400
                };
                
                Plotly.newPlot("clg-chart-year-trend", [{
                    x: years.map(y => `Year ${y}`),
                    y: yearPerfScores,
                    type: "scatter",
                    mode: "lines+markers",
                    line: { width: 3, color: '#1976d2' },
                    marker: { size: 10, color: '#1976d2' },
                    hovertemplate: '<b>%{x}</b><br>Avg Performance: %{y:.1f}%<extra></extra>'
                }], layout, window.defaultChartConfig);
            }
        }
        
        // 5. ATTENDANCE VS OUTCOME INSIGHT (KEY NON-PREDICTIVE ANALYSIS)
        if (document.getElementById("clg-chart-attendance")) {
            const attendanceData = res.attendance_performance_data || [];
            
            if (attendanceData.length === 0) {
                document.getElementById("clg-chart-attendance").innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 400px; color: #666; font-size: 16px;">No attendance data available</div>`;
            } else {
                const layout = {
                    title: { text: 'Attendance vs Performance Analysis', font: { size: 16, color: '#1976d2' } },
                    xaxis: { title: "Attendance (%)" },
                    yaxis: { title: "Performance (%)" },
                    height: 400
                };
                
                Plotly.newPlot("clg-chart-attendance", [{
                    x: attendanceData.map(d => d.attendance),
                    y: attendanceData.map(d => d.performance),
                    mode: "markers",
                    type: "scatter",
                    marker: { 
                        color: attendanceData.map(d => d.performance),
                        colorscale: 'RdYlGn',
                        showscale: true,
                        size: 6,
                        opacity: 0.7
                    },
                    hovertemplate: '<b>Student</b><br>Attendance: %{x:.1f}%<br>Performance: %{y:.1f}%<extra></extra>'
                }], layout, window.defaultChartConfig);
            }
        }
        
        // Add drill-down handlers for college charts (CRITICAL FEATURE)
        setTimeout(() => {
            addCollegeDrilldownHandlers();
            addChartClickHandlers('college');
        }, 1000);
        
        // SUMMARY INSIGHTS (TEXT-BASED, DETERMINISTIC)
        const summaryEl = document.getElementById("clg-summary");
        if (summaryEl) {
            const insights = res.insights || [];
            summaryEl.innerHTML = '';
            
            insights.forEach(insight => {
                const p = document.createElement('p');
                p.innerHTML = `<i class="fa-solid fa-chart-bar"></i> <strong>${insight}</strong>`;
                summaryEl.appendChild(p);
            });
        }
        
        // SUGGESTIONS (ACTION-ORIENTED, NOT PREDICTIVE)
        const suggestionsEl = document.getElementById("clg-suggestions");
        if (suggestionsEl) {
            suggestionsEl.innerHTML = "";
            const suggestions = res.suggestions || [];
            
            suggestions.forEach(s => {
                const li = document.createElement("li");
                li.innerHTML = `<i class="fa-solid fa-lightbulb" style="color: #1976d2; margin-right: 8px;"></i>${s}`;
                suggestionsEl.appendChild(li);
            });
        }
    } catch (error) {
        hideLoading();
        console.error("College analysis error:", error);
        alert("College analysis failed due to network error. Please try again.");
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
    if (!document.getElementById("dept-report") || document.getElementById("dept-report").classList.contains("hidden")) {
        alert("No department data to export");
        return;
    }
    
    const rows = Array.from(document.querySelectorAll("#dept-table tbody tr")).map(tr => {
        const cells = tr.querySelectorAll("td");
        return Array.from(cells).slice(0, -1).map(td => td.textContent.trim()).join(",");
    });
    
    const headers = "RNO,Name,Year,Sem,Performance,Risk,Dropout,Perf%,Risk%,Drop%";
    const csv = [headers, ...rows].join("\n");
    downloadCSV(csv, "department_analytics.csv");
}

function exportDeptPDF() {
    if (!document.getElementById("dept-report") || document.getElementById("dept-report").classList.contains("hidden")) {
        alert("No department data to export");
        return;
    }
    
    showLoading("Generating PDF report...");
    
    setTimeout(async () => {
        try {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            let yPos = 20;
            
            // Title
            pdf.setFontSize(18);
            pdf.setTextColor(25, 118, 210);
            pdf.text('Department Analytics Report', pageWidth / 2, yPos, { align: 'center' });
            yPos += 10;
            
            // Department info
            pdf.setFontSize(12);
            pdf.setTextColor(0, 0, 0);
            const deptName = document.getElementById('d-dept')?.value || 'N/A';
            const yearFilter = document.getElementById('d-year')?.value || 'All';
            pdf.text(`Department: ${deptName.toUpperCase()} | Year: ${yearFilter}`, pageWidth / 2, yPos, { align: 'center' });
            yPos += 15;
            
            // KPIs
            pdf.setFontSize(14);
            pdf.setTextColor(25, 118, 210);
            pdf.text('Key Performance Indicators', 15, yPos);
            yPos += 8;
            
            pdf.setFontSize(10);
            pdf.setTextColor(0, 0, 0);
            const kpis = [
                document.getElementById('dept-kpi-total')?.innerText || '',
                document.getElementById('dept-kpi-high-perf')?.innerText || '',
                document.getElementById('dept-kpi-high-risk')?.innerText || '',
                document.getElementById('dept-kpi-high-drop')?.innerText || ''
            ];
            kpis.forEach(kpi => {
                if (kpi) {
                    pdf.text(kpi.replace(/\n/g, ' '), 15, yPos);
                    yPos += 6;
                }
            });
            yPos += 10;
            
            // Capture charts
            const charts = ['dept-chart-1', 'dept-chart-2', 'dept-chart-3', 'dept-chart-4', 'dept-chart-5'];
            for (let i = 0; i < charts.length; i++) {
                const chartEl = document.getElementById(charts[i]);
                if (chartEl && chartEl.querySelector('.plotly')) {
                    if (yPos > pageHeight - 80) {
                        pdf.addPage();
                        yPos = 20;
                    }
                    
                    try {
                        const canvas = await html2canvas(chartEl, { scale: 1, backgroundColor: '#ffffff' });
                        const imgData = canvas.toDataURL('image/png');
                        const imgWidth = pageWidth - 30;
                        const imgHeight = (canvas.height * imgWidth) / canvas.width;
                        pdf.addImage(imgData, 'PNG', 15, yPos, imgWidth, Math.min(imgHeight, 70));
                        yPos += Math.min(imgHeight, 70) + 10;
                    } catch (err) {
                        console.warn(`Failed to capture chart ${charts[i]}:`, err);
                    }
                }
            }
            
            // Summary
            if (yPos > pageHeight - 60) {
                pdf.addPage();
                yPos = 20;
            }
            
            pdf.setFontSize(14);
            pdf.setTextColor(25, 118, 210);
            pdf.text('Summary & Recommendations', 15, yPos);
            yPos += 8;
            
            pdf.setFontSize(9);
            pdf.setTextColor(0, 0, 0);
            const summaryText = document.getElementById('dept-summary')?.innerText || 'No summary available';
            const summaryLines = pdf.splitTextToSize(summaryText, pageWidth - 30);
            summaryLines.forEach(line => {
                if (yPos > pageHeight - 15) {
                    pdf.addPage();
                    yPos = 20;
                }
                pdf.text(line, 15, yPos);
                yPos += 5;
            });
            
            // Footer
            const pageCount = pdf.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                pdf.setPage(i);
                pdf.setFontSize(8);
                pdf.setTextColor(128, 128, 128);
                pdf.text(`Page ${i} of ${pageCount} | Generated by EduMetric | ${new Date().toLocaleDateString()}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
            }
            
            pdf.save(`department_${deptName}_report.pdf`);
            hideLoading();
            alert('PDF report generated successfully!');
        } catch (error) {
            hideLoading();
            console.error('PDF generation error:', error);
            alert('Failed to generate PDF. Please try again.');
        }
    }, 100);
}
function exportYearCSV() { alert("Year CSV export functionality - implement backend endpoint"); }
function exportCollegeCSV() { alert("College CSV export functionality - implement backend endpoint"); }

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
    
    showLoading("Processing batch upload...");
    
    try {
        console.log('Uploading to:', '/api/students/batch-upload');
        const response = await fetch("/api/students/batch-upload", { 
            method: "POST", 
            body: formData 
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        
        if (!response.ok) {
            hideLoading();
            if (response.status === 404) {
                alert(`ERROR: Batch upload endpoint not found (404). Please ensure the Flask server is running and the endpoint exists.`);
            } else {
                const errorText = await response.text();
                console.error('Server error response:', errorText);
                alert(`ERROR: Server error (${response.status}). Please check the server logs.`);
            }
            return;
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            hideLoading();
            const responseText = await response.text();
            console.error('Non-JSON response:', responseText.substring(0, 200));
            alert('ERROR: Server returned invalid response format. Expected JSON but got HTML/text.');
            return;
        }
        
        const result = await response.json();
        hideLoading();
        
        console.log('Upload result:', result);
        
        if (result.success) {
            const resultDiv = document.getElementById("batch-result");
            if (resultDiv) resultDiv.classList.remove("hidden");
            
            const elements = {
                "batch-processed-count": `<i class="fa-solid fa-chart-bar"></i> Created<br><b>${result.created_count || 0}</b>`,
                "batch-total-count": `<i class="fa-solid fa-users"></i> Total Processed<br><b>${result.total_processed || 0}</b>`,
                "batch-alerts-sent": `<i class="fa-solid fa-check-circle"></i> Success<br><b>Complete</b>`
            };
            
            Object.entries(elements).forEach(([id, html]) => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = html;
            });
            
            const messageEl = document.getElementById("batch-message-text");
            if (messageEl) messageEl.textContent = result.message;
            
            alert(`SUCCESS: ${result.message}`);
            await loadInitialStats(); 
            resetBatchUpload();
        } else {
            alert(`ERROR: ${result.message}`);
            if (result.errors && result.errors.length > 0) {
                console.error('Upload errors:', result.errors);
            }
        }
    } catch (error) {
        hideLoading(); 
        console.error("Upload error:", error);
        if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
            alert("ERROR: Server returned invalid JSON response. This usually means the server is not running or returned an error page.");
        } else {
            alert("ERROR: Upload failed due to network error. Please check your connection and try again.");
        }
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
    
    for (const [fieldId, fieldName] of Object.entries(requiredFields)) {
        const element = document.getElementById(fieldId);
        if (!element || !element.value.trim()) {
            alert(`${fieldName} is required`);
            if (element) element.focus();
            return;
        }
    }
    
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
        INTERNAL_MARKS: parseFloat(document.getElementById('create-internal')?.value || 20),
        TOTAL_DAYS_CURR: parseFloat(document.getElementById('create-total-days')?.value || 90),
        ATTENDED_DAYS_CURR: parseFloat(document.getElementById('create-attended-days')?.value || 80),
        PREV_ATTENDANCE_PERC: parseFloat(document.getElementById('create-prev-att')?.value || 85),
        BEHAVIOR_SCORE_10: parseFloat(document.getElementById('create-behavior')?.value || 7),
        ...semesterMarks
    };
    
    // Add optional mentor fields only if they exist and have values
    const mentorField = document.getElementById('create-mentor');
    const mentorEmailField = document.getElementById('create-mentor-email');
    
    if (mentorField && mentorField.value && mentorField.value.trim()) {
        studentData.MENTOR = mentorField.value.trim();
    }
    
    if (mentorEmailField && mentorEmailField.value && mentorEmailField.value.trim()) {
        studentData.MENTOR_EMAIL = mentorEmailField.value.trim();
    }
    
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
            await loadInitialStats();
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
        BEHAVIOR_SCORE_10: parseFloat(document.getElementById('update-behavior')?.value || 7),
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
            await loadInitialStats();
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
                <button class="modal-close" onclick="closeDrilldownModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="drilldown-table-container">
                    <table class="drilldown-table">
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
    modal.addEventListener('click', function(e) {
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
                chartElement.on('plotly_click', function(data) {
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
    const charts = ['dept-chart-1', 'dept-chart-3'];
    addUniversalDrilldownHandlers(charts, 'dept', dept);
}

function addYearDrilldownHandlers(year) {
    const charts = ['year-chart-perf-donut', 'year-chart-dept-ranking', 'year-chart-risk-donut', 'year-chart-attendance-perf', 'year-chart-dept-risk'];
    addUniversalDrilldownHandlers(charts, 'year', year);
}

function addCollegeDrilldownHandlers() {
    const charts = ['clg-chart-perf-donut', 'clg-chart-risk-donut', 'clg-chart-3d', 'clg-chart-box'];
    addUniversalDrilldownHandlers(charts, 'college', 'all');
}

function closeStudentModal() {
    const modal = document.getElementById('student-modal');
    if (modal) modal.classList.add('hidden');
}
/* ===========================================================
   CHART CLICK HANDLERS FOR FILTERED PREVIEWS
   =========================================================== */
function addChartClickHandlers(analyticsType, param1, param2) {
    const chartIds = getChartIdsForAnalytics(analyticsType);
    
    chartIds.forEach(chartId => {
        const chartElement = document.getElementById(chartId);
        if (chartElement && chartElement.on) {
            // Remove existing click handlers
            chartElement.removeAllListeners && chartElement.removeAllListeners('plotly_click');
            
            chartElement.on('plotly_click', function(data) {
                const point = data.points[0];
                handleChartClick(point, chartId, analyticsType, param1, param2);
            });
        }
    });
}

function getChartIdsForAnalytics(analyticsType) {
    switch (analyticsType) {
        case 'department':
            return ['dept-chart-1', 'dept-chart-2', 'dept-chart-3', 'dept-chart-4', 'dept-chart-5'];
        case 'year':
            return ['year-chart-perf-donut', 'year-chart-dept-ranking', 'year-chart-risk-donut', 'year-chart-attendance-perf', 'year-chart-dept-risk'];
        case 'college':
            return ['clg-chart-perf-donut', 'clg-chart-risk-donut', 'clg-chart-3d', 'clg-chart-box'];
        default:
            return [];
    }
}

function handleChartClick(point, chartId, analyticsType, param1, param2) {
    let filterType, filterValue;
    
    // Determine filter based on chart type and clicked data
    if (chartId.includes('perf')) {
        filterType = 'performance_label';
        filterValue = extractFilterValue(point, 'performance');
    } else if (chartId.includes('risk')) {
        filterType = 'risk_label';
        filterValue = extractFilterValue(point, 'risk');
    } else if (chartId.includes('drop')) {
        filterType = 'dropout_label';
        filterValue = extractFilterValue(point, 'dropout');
    } else if (chartId.includes('3d')) {
        // For 3D charts, show high performance students by default
        filterType = 'performance_label';
        filterValue = 'high';
    } else if (chartId.includes('box') || chartId.includes('hist')) {
        // For box/histogram charts, show students in clicked range
        filterType = 'performance_range';
        filterValue = getPerformanceRange(point.y || point.x);
    } else {
        // Default to performance filter
        filterType = 'performance_label';
        filterValue = 'high';
    }
    
    // Show filtered preview
    showFilteredPreview(filterType, filterValue, analyticsType, param1, param2);
}

function extractFilterValue(point, type) {
    // Extract filter value from clicked point
    let value = point.label || point.x || point.y;
    
    if (typeof value === 'string') {
        value = value.toLowerCase();
        // Map common variations
        if (value.includes('high') || value.includes('excellent')) return 'high';
        if (value.includes('medium') || value.includes('moderate')) return 'medium';
        if (value.includes('low') || value.includes('poor')) return 'low';
    }
    
    // Default based on type
    return type === 'performance' ? 'high' : type === 'risk' ? 'high' : 'high';
}

function getPerformanceRange(value) {
    if (value >= 80) return 'high';
    if (value >= 60) return 'medium';
    return 'low';
}

async function showFilteredPreview(filterType, filterValue, analyticsType, param1, param2) {
    showLoading('Loading filtered students...');
    
    try {
        const payload = {
            filter_type: filterType,
            filter_value: filterValue,
            analytics_type: analyticsType
        };
        
        // Add scope parameters
        if (analyticsType === 'department') {
            payload.department = param1;
            payload.year = param2;
        } else if (analyticsType === 'year') {
            payload.year = param1;
        }
        
        const result = await api('/api/analytics/filter-preview', 'POST', payload);
        hideLoading();
        
        if (result.success) {
            displayFilteredPreviewModal(result);
        } else {
            alert(result.message || 'Failed to load filtered data');
        }
    } catch (error) {
        hideLoading();
        console.error('Filter preview error:', error);
        alert('Failed to load filtered preview. Please try again.');
    }
}

function displayFilteredPreviewModal(result) {
    // Create or get existing modal
    let modal = document.getElementById('filter-preview-modal');
    if (!modal) {
        modal = createFilterPreviewModal();
        document.body.appendChild(modal);
    }
    
    // Update modal content
    const title = modal.querySelector('.preview-title');
    const count = modal.querySelector('.preview-count');
    const tbody = modal.querySelector('.preview-table tbody');
    
    if (title) {
        const filterDisplay = result.filter_info.type.replace('_label', '').replace('_', ' ').toUpperCase();
        title.textContent = `${result.filter_info.value.toUpperCase()} ${filterDisplay} STUDENTS`;
    }
    
    if (count) {
        count.textContent = `${result.students.length} students found`;
    }
    
    if (tbody) {
        tbody.innerHTML = '';
        
        if (result.students.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 30px; color: #666;">
                        <i class="fa-solid fa-search" style="font-size: 24px; margin-bottom: 10px; display: block;"></i>
                        No students found for this filter
                    </td>
                </tr>
            `;
        } else {
            result.students.forEach(student => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${student.RNO}</td>
                    <td>${student.NAME}</td>
                    <td>${student.DEPT}</td>
                    <td>${student.YEAR}</td>
                    <td><span class="label-${student.performance_label}">${student.performance_label.toUpperCase()}</span></td>
                    <td><span class="label-${student.risk_label}">${student.risk_label.toUpperCase()}</span></td>
                    <td><span class="label-${student.dropout_label}">${student.dropout_label.toUpperCase()}</span></td>
                    <td>
                        <button class="view-btn" onclick="viewStudentFromPreview('${student.RNO}')" style="padding: 4px 8px; font-size: 12px;">
                            <i class="fa-solid fa-eye"></i> View
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    }
    
    // Show modal
    modal.classList.add('show');
    modal.style.display = 'flex';
}

function createFilterPreviewModal() {
    const modal = document.createElement('div');
    modal.id = 'filter-preview-modal';
    modal.className = 'filter-preview-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <div>
                    <h3 class="preview-title">Filtered Students</h3>
                    <span class="preview-count">0 students</span>
                </div>
                <button class="modal-close" onclick="closeFilterPreviewModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="preview-table-container">
                    <table class="preview-table">
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
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeFilterPreviewModal();
        }
    });
    
    return modal;
}

function closeFilterPreviewModal() {
    const modal = document.getElementById('filter-preview-modal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

async function viewStudentFromPreview(rno) {
    closeFilterPreviewModal();
    
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
document.addEventListener('click', function(e) {
    const profileDropdown = document.querySelector('.profile-dropdown');
    const profileMenu = document.getElementById('profile-menu');
    
    if (profileDropdown && profileMenu && !profileDropdown.contains(e.target)) {
        profileMenu.classList.remove('show');
    }
});

// Handle Enter key in login form
document.addEventListener('keydown', function(e) {
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
   CHART DRILL-DOWN FUNCTIONALITY
   =========================================================== */

// Global variable to store current drilldown data for export
let currentDrilldownData = [];

/**
 * Add click handlers to department analytics charts
 */
function addDepartmentDrilldownHandlers(dept, year) {
    const chartConfigs = [
        { id: 'dept-chart-perf-donut', filterType: 'performance_label' },
        { id: 'dept-chart-risk-donut', filterType: 'risk_label' },
        { id: 'dept-chart-drop-donut', filterType: 'dropout_label' }
    ];
    
    chartConfigs.forEach(config => {
        const chart = document.getElementById(config.id);
        if (chart && chart.on) {
            // Remove existing handlers
            chart.removeAllListeners('plotly_click');
            
            chart.on('plotly_click', function(data) {
                const clickedLabel = data.points[0].label.toLowerCase();
                showDrilldownModal(config.filterType, clickedLabel, 'department', dept, year);
            });
        }
    });
}

/**
 * Add click handlers to year analytics charts
 */
function addYearDrilldownHandlers(year) {
    const chartConfigs = [
        { id: 'year-chart-perf-donut', filterType: 'performance_label' }
    ];
    
    chartConfigs.forEach(config => {
        const chart = document.getElementById(config.id);
        if (chart && chart.on) {
            chart.removeAllListeners('plotly_click');
            
            chart.on('plotly_click', function(data) {
                const clickedLabel = data.points[0].label.toLowerCase();
                showDrilldownModal(config.filterType, clickedLabel, 'year', year);
            });
        }
    });
}

/**
 * Add click handlers to college analytics charts
 */
function addCollegeDrilldownHandlers() {
    const chartConfigs = [
        { id: 'clg-chart-perf-donut', filterType: 'performance_label' },
        { id: 'clg-chart-risk-donut', filterType: 'risk_label' }
    ];
    
    chartConfigs.forEach(config => {
        const chart = document.getElementById(config.id);
        if (chart && chart.on) {
            chart.removeAllListeners('plotly_click');
            
            chart.on('plotly_click', function(data) {
                const clickedLabel = data.points[0].label.toLowerCase();
                showDrilldownModal(config.filterType, clickedLabel, 'college', '');
            });
        }
    });
}

/**
 * Fetch filtered students and show in drill-down modal
 */
async function showDrilldownModal(filterType, filterValue, scope, scopeValue, yearFilter = null) {
    showLoading('Loading filtered students...');
    
    try {
        const payload = {
            filter_type: filterType,
            filter_value: filterValue,
            scope: scope,
            scope_value: scopeValue
        };
        
        // Add year filter if applicable
        if (yearFilter && yearFilter !== 'all') {
            payload.year_filter = yearFilter;
        }
        
        const res = await api('/api/analytics/drilldown', 'POST', payload);
        hideLoading();
        
        if (!res.success) {
            alert(res.message || 'Failed to load filtered students');
            return;
        }
        
        currentDrilldownData = res.students || [];
        displayDrilldownModal(res);
        
    } catch (error) {
        hideLoading();
        console.error('Drilldown error:', error);
        alert('Failed to load filtered students. Please try again.');
    }
}

/**
 * Display the drill-down modal with filtered students
 */
function displayDrilldownModal(res) {
    const modal = document.getElementById('drilldown-modal');
    const title = document.getElementById('drilldown-title');
    const filterBadge = document.getElementById('drilldown-filter-badge');
    const countBadge = document.getElementById('drilldown-count');
    const tbody = document.querySelector('#drilldown-table tbody');
    
    if (!modal || !tbody) return;
    
    // Format filter type for display
    const filterTypeDisplay = res.filter_info.type
        .replace('_label', '')
        .replace('_', ' ')
        .toUpperCase();
    
    const filterValueDisplay = res.filter_info.value.toUpperCase();
    
    // Set title based on scope
    let scopeText = '';
    if (res.filter_info.scope === 'department') {
        scopeText = `Department: ${res.filter_info.scope_value}`;
    } else if (res.filter_info.scope === 'year') {
        scopeText = `Year ${res.filter_info.scope_value}`;
    } else if (res.filter_info.scope === 'batch') {
        scopeText = `Batch ${res.filter_info.scope_value}`;
    } else {
        scopeText = 'College-wide';
    }
    
    title.textContent = `${filterValueDisplay} ${filterTypeDisplay} Students`;
    filterBadge.innerHTML = `<i class="fa-solid fa-filter"></i> ${scopeText} → ${filterValueDisplay} ${filterTypeDisplay}`;
    countBadge.textContent = `${res.count} students found`;
    
    // Populate table
    tbody.innerHTML = '';
    
    if (res.students.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="12" style="text-align: center; padding: 30px; color: #666;">
            <i class="fa-solid fa-search" style="font-size: 24px; margin-bottom: 10px; display: block;"></i>
            No students found matching this filter
        </td>`;
        tbody.appendChild(tr);
    } else {
        res.students.forEach(student => {
            const tr = document.createElement('tr');
            
            const perfLabel = `<span class="label-${student.performance_label || 'unknown'}">${(student.performance_label || 'unknown').toUpperCase()}</span>`;
            const riskLabel = `<span class="label-${student.risk_label || 'unknown'}">${(student.risk_label || 'unknown').toUpperCase()}</span>`;
            const dropLabel = `<span class="label-${student.dropout_label || 'unknown'}">${(student.dropout_label || 'unknown').toUpperCase()}</span>`;
            
            tr.innerHTML = `
                <td>${student.RNO || ''}</td>
                <td>${student.NAME || ''}</td>
                <td>${student.DEPT || ''}</td>
                <td>${student.YEAR || 0}</td>
                <td>${student.CURR_SEM || 0}</td>
                <td>${perfLabel}</td>
                <td>${riskLabel}</td>
                <td>${dropLabel}</td>
                <td>${(student.performance_overall || 0).toFixed(1)}%</td>
                <td>${(student.risk_score || 0).toFixed(1)}%</td>
                <td>${(student.dropout_score || 0).toFixed(1)}%</td>
                <td>
                    <button class="view-btn" onclick="viewStudentFromDrilldown('${student.RNO}')">
                        <i class="fa-solid fa-eye"></i> View
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    // Show modal
    modal.classList.add('show');
    modal.classList.remove('hidden');
}

/**
 * Close drill-down modal
 */
function closeDrilldownModal() {
    const modal = document.getElementById('drilldown-modal');
    if (modal) {
        modal.classList.remove('show');
        modal.classList.add('hidden');
    }
}

/**
 * View student details from drill-down modal
 */
async function viewStudentFromDrilldown(rno) {
    closeDrilldownModal();
    
    try {
        showLoading('Loading student details...');
        const result = await api('/api/student/search', 'POST', { rno });
        hideLoading();
        
        if (result.success) {
            currentStudent = result.student;
            await analyseStudent(currentStudent);
            
            // Switch to student mode
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.mini-nav-btn').forEach(b => b.classList.remove('active'));
            
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
            
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            alert('Failed to load student details: ' + result.message);
        }
    } catch (error) {
        hideLoading();
        console.error('Error loading student from drilldown:', error);
        alert('Failed to load student details.');
    }
}

/**
 * Export drill-down data to CSV
 */
function exportDrilldownCSV() {
    if (!currentDrilldownData || currentDrilldownData.length === 0) {
        alert('No data to export');
        return;
    }
    
    // Create CSV content
    const headers = ['RNO', 'Name', 'Dept', 'Year', 'Semester', 'Performance', 'Risk', 'Dropout', 'Performance%', 'Risk%', 'Dropout%'];
    const rows = currentDrilldownData.map(s => [
        s.RNO,
        s.NAME,
        s.DEPT,
        s.YEAR,
        s.CURR_SEM,
        s.performance_label,
        s.risk_label,
        s.dropout_label,
        s.performance_overall,
        s.risk_score,
        s.dropout_score
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCSV(csv, 'filtered_students.csv');
}

/* ===========================================================
   CHAT ASSISTANT FUNCTIONALITY
   =========================================================== */
let chatHistory = [];
let isProcessingChat = false;

// Send chat message
async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    
    if (!input || !sendBtn) return;
    
    const message = input.value.trim();
    if (!message || isProcessingChat) return;
    
    // Add user message to chat
    addChatMessage(message, 'user');
    input.value = '';
    
    // Show typing indicator
    showTypingIndicator();
    
    isProcessingChat = true;
    sendBtn.disabled = true;
    
    try {
        console.log('Sending chat message:', message);
        const response = await api('/api/chat', 'POST', { message });
        console.log('Chat response:', response);
        
        hideTypingIndicator();
        
        if (response && response.success) {
            // Add bot response
            addChatMessage(response.response, 'bot');
            
            // Update analytics canvas if data is provided
            if (response.type === 'analytics' && response.data) {
                updateAnalyticsCanvas(response.data);
            }
        } else {
            const errorMsg = response?.message || response?.response || 'Sorry, I encountered an error processing your request.';
            addChatMessage(errorMsg, 'bot');
        }
    } catch (error) {
        hideTypingIndicator();
        console.error('Chat error:', error);
        
        let errorMessage = 'Sorry, I\'m having trouble connecting. Please try again.';
        if (error.message === 'NETWORK_ERROR') {
            errorMessage = 'Network connection failed. Please check your internet connection and try again.';
        } else if (error.message === 'INVALID_JSON') {
            errorMessage = 'Server response error. Please try again or contact support.';
        }
        
        addChatMessage(errorMessage, 'bot');
    } finally {
        isProcessingChat = false;
        sendBtn.disabled = false;
        input.focus();
    }
}

// Add message to chat interface
function addChatMessage(message, sender) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}-message`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = sender === 'user' ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-robot"></i>';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = message;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Store in history
    chatHistory.push({ message, sender, timestamp: new Date() });
}

// Show typing indicator
function showTypingIndicator() {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    const typingDiv = document.createElement('div');
    typingDiv.className = 'chat-message bot-message';
    typingDiv.id = 'typing-indicator';
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = '<i class="fa-solid fa-robot"></i>';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = `
        <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
        <span style="font-size: 12px; color: #666;">Analyzing your query...</span>
    `;
    
    typingDiv.appendChild(avatar);
    typingDiv.appendChild(content);
    
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Hide typing indicator
function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

// Update analytics canvas with results
function updateAnalyticsCanvas(data) {
    const canvasWelcome = document.querySelector('.canvas-welcome');
    const canvasResults = document.getElementById('canvas-results');
    const canvasTitle = document.getElementById('canvas-title');
    
    if (!canvasResults || !canvasTitle) return;
    
    // Hide welcome, show results
    if (canvasWelcome) canvasWelcome.style.display = 'none';
    canvasResults.classList.remove('hidden');
    
    // Set title
    canvasTitle.textContent = data.title || 'Analytics Results';
    
    // Check if this is individual student analytics
    if (data.action === 'student_analytics' && data.student_info) {
        updateStudentAnalyticsCanvas(data);
    } else {
        // Update KPIs for group analytics
        updateCanvasKPIs(data.stats);
        
        // Update charts
        updateCanvasCharts(data);
        
        // Update table
        updateCanvasTable(data.students || data.table);
        
        // Update insights
        updateCanvasInsights(data.insight);
    }
}



// Update student analytics canvas with comprehensive data
function updateStudentAnalyticsCanvas(data) {
    const kpisContainer = document.getElementById('canvas-kpis');
    const chartsContainer = document.getElementById('canvas-charts');
    const tableContainer = document.getElementById('canvas-table');
    const insightsContainer = document.getElementById('canvas-insights');
    
    // Update student info and KPIs
    if (kpisContainer) {
        kpisContainer.innerHTML = '';
        
        // Student basic info
        const infoDiv = document.createElement('div');
        infoDiv.className = 'student-info-grid';
        infoDiv.innerHTML = `
            <div class="info-item">
                <label>Student Name</label>
                <span>${data.student_info.name}</span>
            </div>
            <div class="info-item">
                <label>Roll Number</label>
                <span>${data.student_info.rno}</span>
            </div>
            <div class="info-item">
                <label>Department</label>
                <span>${data.student_info.dept}</span>
            </div>
            <div class="info-item">
                <label>Year & Semester</label>
                <span>Year ${data.student_info.year}, Sem ${data.student_info.semester}</span>
            </div>
            <div class="info-item">
                <label>Email</label>
                <span>${data.student_info.email || 'N/A'}</span>
            </div>
            <div class="info-item">
                <label>Mentor</label>
                <span>${data.student_info.mentor || 'N/A'}</span>
            </div>
        `;
        kpisContainer.appendChild(infoDiv);
        
        // Performance KPIs
        const kpiGrid = document.createElement('div');
        kpiGrid.className = 'canvas-kpis';
        kpiGrid.style.marginTop = '20px';
        
        const kpiData = [
            { 
                label: 'Performance Score', 
                value: `${data.kpis.performance_score.toFixed(1)}%`, 
                status: data.predictions.performance_label,
                icon: 'fa-chart-line',
                class: `kpi-${data.predictions.performance_label}`
            },
            { 
                label: 'Risk Level', 
                value: `${data.kpis.risk_score.toFixed(1)}%`, 
                status: data.predictions.risk_label,
                icon: 'fa-triangle-exclamation',
                class: `kpi-${data.predictions.risk_label === 'high' ? 'poor' : data.predictions.risk_label}`
            },
            { 
                label: 'Dropout Risk', 
                value: `${data.kpis.dropout_score.toFixed(1)}%`, 
                status: data.predictions.dropout_label,
                icon: 'fa-user-xmark',
                class: `kpi-${data.predictions.dropout_label === 'high' ? 'poor' : data.predictions.dropout_label}`
            },
            { 
                label: 'Attendance Rate', 
                value: `${data.kpis.attendance_rate.toFixed(1)}%`, 
                status: data.kpis.attendance_rate >= 85 ? 'high' : data.kpis.attendance_rate >= 75 ? 'medium' : 'low',
                icon: 'fa-calendar-check',
                class: data.kpis.attendance_rate >= 85 ? 'kpi-high' : data.kpis.attendance_rate >= 75 ? 'kpi-medium' : 'kpi-poor'
            },
            { 
                label: 'Internal Marks', 
                value: `${data.kpis.internal_marks.toFixed(1)}%`, 
                status: data.kpis.internal_marks >= 80 ? 'excellent' : data.kpis.internal_marks >= 60 ? 'good' : 'needs improvement',
                icon: 'fa-clipboard-check',
                class: data.kpis.internal_marks >= 80 ? 'kpi-high' : data.kpis.internal_marks >= 60 ? 'kpi-medium' : 'kpi-poor'
            },
            { 
                label: 'Behavior Score', 
                value: `${data.kpis.behavior_score.toFixed(1)}%`, 
                status: data.kpis.behavior_score >= 80 ? 'excellent' : data.kpis.behavior_score >= 60 ? 'good' : 'needs attention',
                icon: 'fa-user-check',
                class: data.kpis.behavior_score >= 80 ? 'kpi-high' : data.kpis.behavior_score >= 60 ? 'kpi-medium' : 'kpi-poor'
            }
        ];
        
        kpiData.forEach(kpi => {
            const kpiDiv = document.createElement('div');
            kpiDiv.className = `canvas-kpi ${kpi.class}`;
            kpiDiv.innerHTML = `
                <h4><i class="fa-solid ${kpi.icon}"></i> ${kpi.label}</h4>
                <div class="value">${kpi.value}</div>
                <div class="status">${kpi.status.toUpperCase()}</div>
            `;
            kpiGrid.appendChild(kpiDiv);
        });
        
        kpisContainer.appendChild(kpiGrid);
    }
    
    // Update charts for student
    if (chartsContainer) {
        chartsContainer.innerHTML = '';
        
        // Performance gauge chart
        const gaugeDiv = document.createElement('div');
        gaugeDiv.className = 'canvas-chart';
        gaugeDiv.id = 'canvas-student-gauge';
        chartsContainer.appendChild(gaugeDiv);
        
        createStudentGaugeChart(data.kpis);
        
        // Semester performance chart
        const semesterDiv = document.createElement('div');
        semesterDiv.className = 'canvas-chart';
        semesterDiv.id = 'canvas-student-semesters';
        chartsContainer.appendChild(semesterDiv);
        
        createSemesterTrendChart(data.semester_data);
    }
    
    // Update recommendations
    if (insightsContainer) {
        insightsContainer.innerHTML = `
            <h4><i class="fa-solid fa-lightbulb"></i> AI Insights & Recommendations</h4>
            <p class="insight-text">${data.insight}</p>
            <ul class="recommendations-list">
                ${data.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        `;
    }
    
    // Clear table for individual student
    if (tableContainer) {
        tableContainer.innerHTML = '';
    }
}

// Create student performance gauge chart
function createStudentGaugeChart(kpis) {
    const layout = {
        title: {
            text: 'Student Performance Dashboard',
            font: { size: 18, color: '#1976d2' }
        },
        grid: { rows: 2, columns: 3, pattern: 'independent' },
        margin: { l: 40, r: 40, t: 80, b: 40 }
    };
    
    const traces = [
        {
            type: "indicator",
            mode: "gauge+number+delta",
            value: kpis.performance_score,
            title: { text: "Performance" },
            delta: { reference: 70 },
            gauge: {
                axis: { range: [0, 100] },
                bar: { color: "#1976d2" },
                steps: [
                    { range: [0, 50], color: "#ffcdd2" },
                    { range: [50, 75], color: "#fff9c4" },
                    { range: [75, 100], color: "#c8e6c9" }
                ],
                threshold: { line: { color: "red", width: 4 }, thickness: 0.75, value: 70 }
            },
            domain: { row: 0, column: 0 }
        },
        {
            type: "indicator",
            mode: "gauge+number",
            value: kpis.attendance_rate,
            title: { text: "Attendance" },
            gauge: {
                axis: { range: [0, 100] },
                bar: { color: "#00897b" },
                steps: [
                    { range: [0, 75], color: "#ffcdd2" },
                    { range: [75, 100], color: "#c8e6c9" }
                ],
                threshold: { line: { color: "orange", width: 4 }, thickness: 0.75, value: 75 }
            },
            domain: { row: 0, column: 1 }
        },
        {
            type: "indicator",
            mode: "gauge+number",
            value: kpis.behavior_score,
            title: { text: "Behavior" },
            gauge: {
                axis: { range: [0, 100] },
                bar: { color: "#9c27b0" },
                steps: [
                    { range: [0, 60], color: "#ffcdd2" },
                    { range: [60, 80], color: "#fff9c4" },
                    { range: [80, 100], color: "#c8e6c9" }
                ]
            },
            domain: { row: 0, column: 2 }
        }
    ];
    
    Plotly.newPlot('canvas-student-gauge', traces, layout, { displayModeBar: false, responsive: true });
}

// Create semester trend chart
function createSemesterTrendChart(semesterData) {
    const semesters = [];
    const marks = [];
    
    for (let i = 1; i <= 8; i++) {
        const mark = semesterData[`SEM${i}`];
        if (mark && mark > 0) {
            semesters.push(`Semester ${i}`);
            marks.push(mark);
        }
    }
    
    if (marks.length === 0) {
        document.getElementById('canvas-student-semesters').innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #666;">
                <p>No semester data available</p>
            </div>
        `;
        return;
    }
    
    const layout = {
        title: {
            text: 'Semester Performance Trend',
            font: { size: 18, color: '#1976d2' }
        },
        xaxis: { title: 'Semesters' },
        yaxis: { title: 'Marks (%)', range: [0, 100] },
        margin: { l: 60, r: 60, t: 80, b: 60 }
    };
    
    const trace = {
        x: semesters,
        y: marks,
        type: 'scatter',
        mode: 'lines+markers',
        line: { width: 4, color: '#1976d2' },
        marker: { size: 10, color: '#1976d2', line: { color: '#fff', width: 2 } },
        fill: 'tonexty',
        fillcolor: 'rgba(25, 118, 210, 0.1)',
        hovertemplate: '<b>%{x}</b><br>Marks: %{y}%<extra></extra>'
    };
    
    Plotly.newPlot('canvas-student-semesters', [trace], layout, { displayModeBar: false, responsive: true });
}

// Update charts in canvas
function updateCanvasCharts(data) {
    const chartsContainer = document.getElementById('canvas-charts');
    if (!chartsContainer) return;
    
    chartsContainer.innerHTML = '';
    
    // Create chart based on action type
    if (data.action === 'department_analysis' && data.department_stats) {
        createDepartmentComparisonChart(data.department_stats);
    } else if (data.action === 'attendance_analysis' && data.attendance_data) {
        createAttendanceScatterChart(data.attendance_data);
    } else if (data.students && data.students.length > 0) {
        createStudentPerformanceChart(data.students);
    }
}

// Create department comparison chart
function createDepartmentComparisonChart(deptStats) {
    const chartsContainer = document.getElementById('canvas-charts');
    const chartDiv = document.createElement('div');
    chartDiv.className = 'canvas-chart';
    chartDiv.id = 'canvas-dept-chart';
    chartsContainer.appendChild(chartDiv);
    
    const departments = Object.keys(deptStats);
    const avgPerformances = departments.map(dept => deptStats[dept].avg_performance || 0);
    
    const layout = {
        title: {
            text: 'Department Performance Comparison',
            font: { size: 18, color: '#1976d2' }
        },
        xaxis: { title: 'Department' },
        yaxis: { title: 'Average Performance (%)' },
        margin: { l: 60, r: 60, t: 80, b: 60 }
    };
    
    Plotly.newPlot('canvas-dept-chart', [{
        x: departments,
        y: avgPerformances,
        type: 'bar',
        marker: { color: '#1976d2' },
        hovertemplate: '<b>%{x}</b><br>Avg Performance: %{y:.1f}%<extra></extra>'
    }], layout, { displayModeBar: false, responsive: true });
}

// Create attendance scatter chart
function createAttendanceScatterChart(attendanceData) {
    const chartsContainer = document.getElementById('canvas-charts');
    const chartDiv = document.createElement('div');
    chartDiv.className = 'canvas-chart';
    chartDiv.id = 'canvas-attendance-chart';
    chartsContainer.appendChild(chartDiv);
    
    const attendanceValues = attendanceData.map(d => d[0]);
    const performanceValues = attendanceData.map(d => d[1]);
    
    const layout = {
        title: {
            text: 'Attendance vs Performance Correlation',
            font: { size: 18, color: '#1976d2' }
        },
        xaxis: { title: 'Attendance (%)' },
        yaxis: { title: 'Performance (%)' },
        margin: { l: 60, r: 60, t: 80, b: 60 }
    };
    
    Plotly.newPlot('canvas-attendance-chart', [{
        x: attendanceValues,
        y: performanceValues,
        mode: 'markers',
        type: 'scatter',
        marker: { 
            color: '#00897b',
            size: 8,
            opacity: 0.7
        },
        hovertemplate: '<b>Student</b><br>Attendance: %{x:.1f}%<br>Performance: %{y:.1f}%<extra></extra>'
    }], layout, { displayModeBar: false, responsive: true });
}

// Create student performance chart
function createStudentPerformanceChart(students) {
    const chartsContainer = document.getElementById('canvas-charts');
    const chartDiv = document.createElement('div');
    chartDiv.className = 'canvas-chart';
    chartDiv.id = 'canvas-performance-chart';
    chartsContainer.appendChild(chartDiv);
    
    const studentNames = students.slice(0, 10).map(s => s.name || s.NAME || 'Unknown');
    const performances = students.slice(0, 10).map(s => s.performance_overall || 0);
    
    const layout = {
        title: {
            text: 'Student Performance Overview',
            font: { size: 18, color: '#1976d2' }
        },
        xaxis: { title: 'Students' },
        yaxis: { title: 'Performance (%)' },
        margin: { l: 60, r: 60, t: 80, b: 100 }
    };
    
    Plotly.newPlot('canvas-performance-chart', [{
        x: studentNames,
        y: performances,
        type: 'bar',
        marker: { 
            color: performances,
            colorscale: 'RdYlGn',
            showscale: true
        },
        hovertemplate: '<b>%{x}</b><br>Performance: %{y:.1f}%<extra></extra>'
    }], layout, { displayModeBar: false, responsive: true });
}

// Update table in canvas
function updateCanvasTable(students) {
    const tableContainer = document.getElementById('canvas-table');
    if (!tableContainer || !students || students.length === 0) {
        if (tableContainer) tableContainer.innerHTML = '';
        return;
    }
    
    tableContainer.innerHTML = `
        <h4><i class="fa-solid fa-table"></i> Student Details (${students.length} student${students.length > 1 ? 's' : ''})</h4>
        <div class="canvas-table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th>RNO</th>
                        <th>Name</th>
                        <th>Dept</th>
                        <th>Year</th>
                        <th>Performance</th>
                        <th>Risk</th>
                        <th>Dropout</th>
                        <th>Score</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="canvas-table-body">
                </tbody>
            </table>
        </div>
    `;
    
    const tbody = document.getElementById('canvas-table-body');
    if (!tbody) return;
    
    students.slice(0, 20).forEach(student => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${student.RNO || ''}</td>
            <td>${student.NAME || ''}</td>
            <td>${student.DEPT || ''}</td>
            <td>${student.YEAR || ''}</td>
            <td><span class="label-${student.performance_label || 'unknown'}">${(student.performance_label || 'unknown').toUpperCase()}</span></td>
            <td><span class="label-${student.risk_label || 'unknown'}">${(student.risk_label || 'unknown').toUpperCase()}</span></td>
            <td><span class="label-${student.dropout_label || 'unknown'}">${(student.dropout_label || 'unknown').toUpperCase()}</span></td>
            <td>${(student.performance_overall || 0).toFixed(1)}%</td>
            <td>
                <button class="view-btn" onclick="viewStudentFromCanvas('${student.RNO}')" style="padding: 4px 8px; font-size: 11px;">
                    <i class="fa-solid fa-eye"></i> View
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Update insights in canvas
function updateCanvasInsights(insight) {
    const insightsContainer = document.getElementById('canvas-insights');
    if (!insightsContainer) return;
    
    if (!insight) {
        insightsContainer.innerHTML = '';
        return;
    }
    
    insightsContainer.innerHTML = `
        <h4><i class="fa-solid fa-lightbulb"></i> AI Insights</h4>
        <p>${insight}</p>
    `;
}

// View student from canvas table
async function viewStudentFromCanvas(rno) {
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

// Clear analytics canvas
function clearCanvas() {
    const canvasWelcome = document.querySelector('.canvas-welcome');
    const canvasResults = document.getElementById('canvas-results');
    
    if (canvasWelcome) canvasWelcome.style.display = 'flex';
    if (canvasResults) canvasResults.classList.add('hidden');
    
    // Clear chat history if needed
    // chatHistory = [];
}

// Handle Enter key in chat input
document.addEventListener('DOMContentLoaded', function() {
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }
    
    // Initialize chat mode when page loads
    setTimeout(() => {
        const chatMode = document.getElementById('mode-chat');
        if (chatMode && chatMode.classList.contains('active')) {
            initializeChatMode();
        }
    }, 1000);
});

// Add sample questions for easy interaction
function addSampleQuestions() {
    const sampleQuestions = [
        "performance analytics of CSE(AI)",
        "CSE department analytics", 
        "Show top performers",
        "High risk students",
        "CSE2021001",
        "21CSE001 analytics"
    ];
    
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    const samplesDiv = document.createElement('div');
    samplesDiv.className = 'chat-message bot-message';
    samplesDiv.innerHTML = `
        <div class="message-avatar"><i class="fa-solid fa-robot"></i></div>
        <div class="message-content">
            <p><strong>Try these sample questions:</strong></p>
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
                ${sampleQuestions.map(q => `
                    <button class="sample-question" onclick="askSampleQuestion('${q}')">
                        ${q}
                    </button>
                `).join('')}
            </div>
            <p style="margin-top: 15px; font-size: 14px; color: #666;">
                <i class="fa-solid fa-info-circle"></i> 
                <strong>Tip:</strong> You can also just type a roll number (like "CSE2021001" or "21CSE001") to get instant student analytics!
            </p>
        </div>
    `;
    
    messagesContainer.appendChild(samplesDiv);
}

// Ask sample question
function askSampleQuestion(question) {
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.value = question;
        sendChatMessage();
    }
}

// Initialize chat interface when switching to chat mode
function initializeChatMode() {
    const messagesContainer = document.getElementById('chat-messages');
    if (messagesContainer && messagesContainer.children.length <= 1) {
        // Add sample questions if chat is empty
        setTimeout(() => {
            addSampleQuestions();
        }, 500);
    }
}

