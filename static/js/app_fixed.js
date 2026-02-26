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
    document.addEventListener('keydown', function(e) {
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