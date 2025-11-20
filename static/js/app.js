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
       overlay.classList.remove("hidden");
       overlay.querySelector("p").innerText = message;
   }
   function hideLoading() {
       document.getElementById("loading-overlay").classList.add("hidden");
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
            // Safely parse JSON even if backend returns empty/HTML/error page
            return text ? JSON.parse(text) : {};
        } catch (e) {
            console.error("Invalid JSON Response:", text);
            throw new Error("INVALID_JSON");
        }
    }
    
   
   /* ===========================================================
      APP INITIALIZATION
      =========================================================== */
   window.addEventListener("DOMContentLoaded", async () => {
       await loadInitialStats();
       setupSidebarNav();
      setupStudentToggle();
   });
   
   /* ===========================================================
      LOAD STREAMLIT-LIKE DASHBOARD VARIABLES
      =========================================================== */
   async function loadInitialStats() {
       showLoading("Loading dashboard...");
       const stats = await api("/api/stats");
       hideLoading();
   
       globalStats = stats;
   
       document.getElementById("total-stats").innerText =
           `Total Students: ${stats.total_students} • Departments: ${stats.departments.length} • Years: ${stats.years.length}`;
   
       const deptSelects = [
           document.getElementById("s-dept"),
           document.getElementById("n-dept"),
           document.getElementById("d-dept")
       ];
       deptSelects.forEach(sel => {
           sel.innerHTML = "";
           stats.departments.forEach(d => {
               const opt = document.createElement("option");
               opt.value = d;
               opt.textContent = d;
               sel.appendChild(opt);
           });
       });
   
       const yearSelects = [
           document.getElementById("s-year"),
           document.getElementById("n-year"),
           document.getElementById("y-year")
       ];
       yearSelects.forEach(sel => {
           sel.innerHTML = "";
           stats.years.forEach(y => {
               const opt = document.createElement("option");
               opt.value = y;
               opt.textContent = y;
               sel.appendChild(opt);
           });
       });
   
       const dYear = document.getElementById("d-year");
       stats.years.forEach(y => {
           const opt = document.createElement("option");
           opt.value = y;
           opt.textContent = `Year ${y}`;
           dYear.appendChild(opt);
       });
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
               target.classList.remove("hidden");
               target.classList.add("active");
           });
       });
   }
   
   /* ===========================================================
      STUDENT EXISTING / NEW TOGGLE
      =========================================================== */
   function setupStudentToggle() {
       const btnExisting = document.getElementById("btn-existing");
       const btnNew = document.getElementById("btn-new");
       const existingForm = document.getElementById("existing-form");
       const newForm = document.getElementById("new-form");
   
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
   
   /* ===========================================================
      STUDENT MODE: SEARCH EXISTING
      =========================================================== */
   async function searchExistingStudent() {
       const payload = {
           rno: document.getElementById("s-rno").value.trim(),
           dept: document.getElementById("s-dept").value,
           year: document.getElementById("s-year").value
       };
   
       if (!payload.rno) {
           alert("Please enter Register Number.");
           return;
       }
   
       showLoading("Searching student...");
       const result = await api("/api/student/search", "POST", payload);
       hideLoading();
   
       if (!result.success) {
           alert(result.message || "Student not found");
           return;
       }
   
       currentStudent = result.student;
       await analyseStudent(currentStudent);
   }
   
   /* ===========================================================
      STUDENT MODE: ANALYZE NEW STUDENT
      =========================================================== */
   async function analyseNewStudent() {
       const sems = {};
       for (let i = 1; i <= 8; i++) {
           const v = document.getElementById(`n-sem${i}`).value;
           if (v !== "") sems[`SEM${i}`] = parseFloat(v);
       }
   
       const student = {
           NAME: document.getElementById("n-name").value || "New Student",
           RNO: document.getElementById("n-rno").value || "NA",
           DEPT: document.getElementById("n-dept").value,
           YEAR: parseInt(document.getElementById("n-year").value),
           CURR_SEM: parseInt(document.getElementById("n-curr-sem").value),
           INTERNAL_MARKS: parseFloat(document.getElementById("n-internal").value || 0),
           TOTAL_DAYS_CURR: parseFloat(document.getElementById("n-total-days").value || 0),
           ATTENDED_DAYS_CURR: parseFloat(document.getElementById("n-attended-days").value || 0),
           PREV_ATTENDANCE_PERC: parseFloat(document.getElementById("n-prev-att").value || 0),
           BEHAVIOR_SCORE_10: parseFloat(document.getElementById("n-behavior").value || 0),
           MENTOR_EMAIL: document.getElementById("n-mentor-email").value || ""
       };
   
       Object.assign(student, sems);
   
       currentStudent = student;
       await analyseStudent(student);
   }
   
   /* ===========================================================
      STUDENT MODE: SEND TO BACKEND FOR PREDICTION
      =========================================================== */
   async function analyseStudent(student) {
       showLoading("Analysing student...");
       const result = await api("/api/student/predict", "POST", student);
       hideLoading();
   
       if (!result.success) {
           alert(result.message || "Prediction failed");
           return;
       }
   
       currentStudentResult = result;
   
       document.getElementById("student-report").classList.remove("hidden");
   
       renderStudentHeader(result);
       renderStudentCharts(result);
       renderStudentSummary(result);
   }
   
   /* ===========================================================
      STUDENT REPORT: HEADER + KPIs
      =========================================================== */
   function renderStudentHeader(result) {
       const s = result.student;
       const f = result.features;
       const p = result.predictions;
   
       document.getElementById("student-basic").innerHTML = `
           <h2>${s.NAME} (${s.RNO})</h2>
           <p>Dept: <b>${s.DEPT}</b> • Year: <b>${s.YEAR}</b> • Semester: <b>${s.CURR_SEM}</b></p>
           <p>Internal: ${f.internal_pct.toFixed(1)}% • Attendance: ${f.attendance_pct.toFixed(1)}% • Behavior: ${f.behavior_pct.toFixed(1)}%</p>
       `;
   
       const perf = document.getElementById("kpi-performance");
       const risk = document.getElementById("kpi-risk");
       const drop = document.getElementById("kpi-dropout");
   
       function labelClass(label, reverse = false) {
           if (label === "high") return reverse ? "kpi-bad" : "kpi-good";
           if (label === "low") return reverse ? "kpi-good" : "kpi-bad";
           return "kpi-medium";
       }
   
       perf.className = `kpi-pill ${labelClass(p.performance_label, false)}`;
       risk.className = `kpi-pill ${labelClass(p.risk_label, true)}`;
       drop.className = `kpi-pill ${labelClass(p.dropout_label, true)}`;
   
       perf.innerHTML = `📊 PERFORMANCE<br><b>${p.performance_label.toUpperCase()}</b><br>${f.performance_overall.toFixed(1)}%`;
       risk.innerHTML = `⚠️ RISK<br><b>${p.risk_label.toUpperCase()}</b><br>${f.risk_score.toFixed(1)}%`;
       drop.innerHTML = `🚨 DROPOUT<br><b>${p.dropout_label.toUpperCase()}</b><br>${f.dropout_score.toFixed(1)}%`;
   
       const alertBtn = document.getElementById("alert-button");
       if (result.need_alert && s.MENTOR_EMAIL) alertBtn.classList.remove("hidden");
       else alertBtn.classList.add("hidden");
   }
   
   /* ===========================================================
      STUDENT REPORT: ALL 6 CHARTS (BIG SIZE)
      =========================================================== */
   function renderStudentCharts(result) {
       const s = result.student;
       const f = result.features;
   
       /* ----------- 1. Marks Trend Chart ----------- */
       const marks = [];
       const semLabels = [];
       for (let i = 1; i <= 8; i++) {
           let k = `SEM${i}`;
           if (s[k] !== undefined && s[k] !== "") {
               marks.push(parseFloat(s[k]));
               semLabels.push(k);
           }
       }
       Plotly.newPlot("st-chart-marks", [{
           x: semLabels,
           y: marks,
           type: "scatter",
           mode: "lines+markers",
           line: { width: 4 },
           marker: { size: 9 }
       }], {
           title: "📈 Semester-wise Marks Trend",
           yaxis: { range: [0, 100] },
           paper_bgcolor: "rgba(255,255,255,0)",
           plot_bgcolor: "rgba(255,245,245,0.6)"
       }, { displayModeBar: false });
   
       /* ----------- 2. Radar Chart ----------- */
       Plotly.newPlot("st-chart-radar", [{
           type: "scatterpolar",
           r: [f.present_att, f.prev_att, f.behavior_pct, f.present_att],
           theta: ["Present Attendance", "Prev Attendance", "Behavior Impact", "Present Attendance"],
           fill: "toself"
       }], {
           title: "🎯 Attendance & Behavior Profile",
           polar: { radialaxis: { visible: true, range: [0, 100] } },
           paper_bgcolor: "rgba(255,255,255,0)"
       }, { displayModeBar: false });
   
       /* ----------- 3. Scores Bar Chart ----------- */
       Plotly.newPlot("st-chart-scores", [{
           x: ["Performance", "Risk", "Dropout"],
           y: [f.performance_overall, f.risk_score, f.dropout_score],
           type: "bar"
       }], {
           title: "📊 Overall Scores",
           yaxis: { range: [0, 100] },
           paper_bgcolor: "rgba(255,255,255,0)"
       }, { displayModeBar: false });
   
       /* ----------- 4. Donut Chart ----------- */
       Plotly.newPlot("st-chart-donut", [{
           values: [f.past_avg, f.internal_pct, f.attendance_pct, f.behavior_pct],
           labels: ["Past Avg", "Internal", "Attendance", "Behavior"],
           type: "pie",
           hole: 0.4
       }], {
           title: "🎯 Performance Composition",
           paper_bgcolor: "rgba(255,255,255,0)"
       }, { displayModeBar: false });
   
       /* ----------- 5. Performance Gauge ----------- */
       Plotly.newPlot("st-chart-gauge-perf", [{
           type: "indicator",
           mode: "gauge+number",
           value: f.performance_overall,
           gauge: {
               axis: { range: [0, 100] },
               steps: [
                   { range: [0, 50], color: "#ffcdd2" },
                   { range: [50, 70], color: "#fff9c4" },
                   { range: [70, 100], color: "#c8e6c9" }
               ]
           }
       }], {
           title: "Performance Gauge",
           paper_bgcolor: "rgba(255,255,255,0)"
       }, { displayModeBar: false });
   
       /* ----------- 6. Attendance Gauge ----------- */
       Plotly.newPlot("st-chart-gauge-att", [{
           type: "indicator",
           mode: "gauge+number",
           value: f.attendance_pct,
           gauge: {
               axis: { range: [0, 100] },
               steps: [
                   { range: [0, 75], color: "#ffcdd2" },
                   { range: [75, 100], color: "#c8e6c9" }
               ]
           }
       }], {
           title: "Attendance Gauge",
           paper_bgcolor: "rgba(255,255,255,0)"
       }, { displayModeBar: false });
   }
   
   /* ===========================================================
      STUDENT REPORT: SUMMARY + SUGGESTIONS
      =========================================================== */
   function renderStudentSummary(result) {
       const f = result.features;
       const p = result.predictions;
   
       const summaryDiv = document.getElementById("st-summary-text");
       const suggUl = document.getElementById("st-suggestions");
       suggUl.innerHTML = "";
   
       summaryDiv.innerHTML = `
           <p>📊 Overall academic performance is <b>${p.performance_label.toUpperCase()}</b> (${f.performance_overall.toFixed(1)}%).</p>
           <p>⚠️ Risk indicators: <b>${p.risk_label.toUpperCase()}</b>, Dropout risk: <b>${p.dropout_label.toUpperCase()}</b>.</p>
           <p>Attendance: <b>${f.attendance_pct.toFixed(1)}%</b> (Present: ${f.present_att}%, Previous: ${f.prev_att}%).</p>
       `;
   
       function addSuggestion(t) {
           const li = document.createElement("li");
           li.textContent = t;
           suggUl.appendChild(li);
       }
   
       if (p.performance_label !== "high")
           addSuggestion("📘 Provide extra revision materials and conduct practice assessments.");
       if (p.risk_label === "high")
           addSuggestion("👨‍🏫 Schedule mentoring and identify learning difficulties.");
       if (p.dropout_label === "medium" || p.dropout_label === "high")
           addSuggestion("☎️ Engage parents/guardians for academic reinforcement.");
       if (f.attendance_pct < 75)
           addSuggestion("⏰ Create weekly attendance improvement goals.");
       if (f.internal_pct < 60)
           addSuggestion("📝 Conduct internal mock tests.");
   }
   
   /* ===========================================================
      EXPORT STUDENT CSV
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
   
       const csv = Object.keys(data).join(",") + "\n" +
           Object.values(data).join(",");
   
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
   
   /* ===========================================================
      RESET STUDENT VIEW
      =========================================================== */
   function resetStudentMode() {
       document.getElementById("student-report").classList.add("hidden");
   }
   
   /* ===========================================================
      SEND ALERT EMAIL
      =========================================================== */
   async function triggerAlertEmail() {
       if (!currentStudentResult) return;
   
       const s = currentStudentResult.student;
       const p = currentStudentResult.predictions;
       const f = currentStudentResult.features;
   
       const email = s.MENTOR_EMAIL;
       if (!email) {
           alert("No mentor email available!");
           return;
       }
   
       const subject = `Alert: ${s.NAME} (${s.RNO}) - High Risk`;
       const body =
   `Student: ${s.NAME} (${s.RNO})
   Dept: ${s.DEPT}, Year ${s.YEAR}, Sem ${s.CURR_SEM}
   
   Performance: ${p.performance_label} (${f.performance_overall}%)
   Risk: ${p.risk_label} (${f.risk_score}%)
   Dropout: ${p.dropout_label} (${f.dropout_score}%)
   
   Please provide counselling and support.`
   
       showLoading("Sending alert...");
       const res = await api("/api/send-alert", "POST", { email, subject, body });
       hideLoading();
   
       if (res.success) alert("Alert email sent successfully!");
       else alert("Email failed: " + (res.message || ""));
   }
   
   /* ===========================================================
      GROUP ANALYTICS (DEPT / YEAR / COLLEGE)
      =========================================================== */
   
   function fillGroupTable(tableId, rows, includeDept = false) {
       const tbody = document.querySelector(`#${tableId} tbody`);
       tbody.innerHTML = "";
   
       rows.forEach(r => {
           const tr = document.createElement("tr");
           tr.innerHTML = `
               <td>${r.RNO}</td>
               <td>${r.NAME}</td>
               ${includeDept ? `<td>${r.DEPT}</td>` : ""}
               <td>${r.YEAR}</td>
               <td>${r.CURR_SEM}</td>
               <td>${r.performance_label}</td>
               <td>${r.risk_label}</td>
               <td>${r.dropout_label}</td>
               <td>${r.performance_overall.toFixed(1)}</td>
               <td>${r.risk_score.toFixed(1)}</td>
               <td>${r.dropout_score.toFixed(1)}</td>
           `;
           tbody.appendChild(tr);
       });
   }
   
   /* PIE CHART (labels) */
   function renderLabelDonut(elementId, counts, title) {
       Plotly.newPlot(elementId, [{
           labels: Object.keys(counts),
           values: Object.values(counts),
           type: "pie",
           hole: 0.4
       }], {
           title,
           paper_bgcolor: "rgba(255,255,255,0)"
       }, { displayModeBar: false });
   }
   
   /* 3D CHART */
   function render3DScatter(elementId, scores, title) {
       Plotly.newPlot(elementId, [{
           x: scores.performance,
           y: scores.risk,
           z: scores.dropout,
           mode: "markers",
           type: "scatter3d",
           marker: { size: 3 }
       }], {
           title,
           scene: {
               xaxis: { title: "Performance" },
               yaxis: { title: "Risk" },
               zaxis: { title: "Dropout" }
           },
           paper_bgcolor: "rgba(255,255,255,0)"
       }, { displayModeBar: false });
   }
   
   /* ===========================================================
      DEPARTMENT ANALYTICS
      =========================================================== */
   async function analyseDepartment() {
       const payload = {
           dept: document.getElementById("d-dept").value,
           year: document.getElementById("d-year").value
       };
   
       showLoading("Analysing department...");
       const res = await api("/api/department/analyze", "POST", payload);
       hideLoading();
   
       if (!res.success) {
           alert(res.message || "Department analysis failed");
           return;
       }
   
       document.getElementById("dept-report").classList.remove("hidden");
   
       const st = res.stats;
       document.getElementById("dept-kpi-total").innerHTML =
           `👥 Total Students<br><b>${st.total_students}</b>`;
       document.getElementById("dept-kpi-high-perf").innerHTML =
           `🎓 High Performers<br><b>${st.high_performers}</b>`;
       document.getElementById("dept-kpi-high-risk").innerHTML =
           `⚠️ High Risk<br><b>${st.high_risk}</b>`;
       document.getElementById("dept-kpi-high-drop").innerHTML =
           `🚨 High Dropout<br><b>${st.high_dropout}</b>`;
   
       fillGroupTable("dept-table", res.table.slice(0, 120));
   
       renderLabelDonut("dept-chart-perf-donut", res.label_counts.performance, "Performance Distribution");
       renderLabelDonut("dept-chart-risk-donut", res.label_counts.risk, "Risk Distribution");
       renderLabelDonut("dept-chart-drop-donut", res.label_counts.dropout, "Dropout Distribution");
       render3DScatter("dept-chart-3d", res.scores, "3D Performance-Risk-Dropout");
   
       document.getElementById("dept-summary").innerHTML = `
           <p>Total students analysed: <b>${st.total_students}</b></p>
           <p>Avg Performance: <b>${st.avg_performance}%</b></p>
           <p>High performers: <b>${st.high_performers}</b> • High risk: <b>${st.high_risk}</b> • High dropout: <b>${st.high_dropout}</b></p>
       `;
   }
   
   /* ===========================================================
      YEAR ANALYTICS
      =========================================================== */
   async function analyseYear() {
       const payload = { year: document.getElementById("y-year").value };
   
       showLoading("Analysing year...");
       const res = await api("/api/year/analyze", "POST", payload);
       hideLoading();
   
       if (!res.success) {
           alert(res.message || "Year analysis failed");
           return;
       }
   
       document.getElementById("year-report").classList.remove("hidden");
   
       const st = res.stats;
       document.getElementById("year-kpi-total").innerHTML =
           `👥 Total Students<br><b>${st.total_students}</b>`;
       document.getElementById("year-kpi-avg-perf").innerHTML =
           `📈 Avg Performance<br><b>${st.avg_performance}%</b>`;
       document.getElementById("year-kpi-high-risk").innerHTML =
           `⚠️ High Risk<br><b>${st.high_risk}</b>`;
       document.getElementById("year-kpi-high-drop").innerHTML =
           `🚨 High Dropout<br><b>${st.high_dropout}</b>`;
   
       fillGroupTable("year-table", res.table.slice(0, 120), true);
   
       renderLabelDonut("year-chart-perf-donut", res.label_counts.performance, "Performance Labels");
       render3DScatter("year-chart-3d", res.scores, "3D Performance-Risk-Dropout");
   
       Plotly.newPlot("year-chart-box", [{
           y: res.scores.performance,
           type: "box",
           name: "Performance"
       }], {
           title: "Performance Spread",
           paper_bgcolor: "rgba(255,255,255,0)"
       }, { displayModeBar: false });
   
       Plotly.newPlot("year-chart-hist", [{
           x: res.scores.performance,
           type: "histogram"
       }], {
           title: "Performance Distribution Histogram",
           paper_bgcolor: "rgba(255,255,255,0)"
       }, { displayModeBar: false });
   
       document.getElementById("year-summary").innerHTML = `
           <p>Total students: <b>${st.total_students}</b></p>
           <p>Avg Performance: <b>${st.avg_performance}%</b></p>
       `;
   }
   
   /* ===========================================================
      COLLEGE ANALYTICS
      =========================================================== */
   async function analyseCollege() {
       showLoading("Analysing college...");
       const res = await api("/api/college/analyze", "GET");
       hideLoading();
   
       if (!res.success) {
           alert(res.message || "College analysis failed");
           return;
       }
   
       document.getElementById("college-report").classList.remove("hidden");
   
       const st = res.stats;
   
       document.getElementById("clg-kpi-total").innerHTML =
           `👥 Sample Size<br><b>${res.sample_size}</b>`;
       document.getElementById("clg-kpi-avg-perf").innerHTML =
           `📈 Avg Performance<br><b>${st.avg_performance}%</b>`;
       document.getElementById("clg-kpi-high-risk").innerHTML =
           `⚠️ High Risk<br><b>${st.high_risk}</b>`;
       document.getElementById("clg-kpi-high-drop").innerHTML =
           `🚨 High Dropout<br><b>${st.high_dropout}</b>`;
   
       fillGroupTable("clg-table", res.table.slice(0, 150), true);
   
       renderLabelDonut("clg-chart-perf-donut", res.label_counts.performance, "Performance");
       renderLabelDonut("clg-chart-risk-donut", res.label_counts.risk, "Risk");
       render3DScatter("clg-chart-3d", res.scores, "3D College Analysis");
   
       Plotly.newPlot("clg-chart-box", [{
           y: res.scores.performance,
           type: "box"
       }], {
           title: "Performance Spread Boxplot",
           paper_bgcolor: "rgba(255,255,255,0)"
       }, { displayModeBar: false });
   
       document.getElementById("clg-summary").innerHTML = `
           <p>Sample students: <b>${res.sample_size}</b></p>
           <p>Avg performance: <b>${st.avg_performance}%</b></p>
       `;
   }
   