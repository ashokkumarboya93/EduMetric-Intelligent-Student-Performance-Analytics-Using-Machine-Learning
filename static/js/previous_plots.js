/* ===========================================================
   PREVIOUS PLOTS FUNCTIONALITY
   =========================================================== */

// Store for previous plot data
let previousPlots = JSON.parse(localStorage.getItem('edumetric_previous_plots') || '[]');
let currentPlotIndex = 0;

// Plot types configuration
const PLOT_TYPES = {
    'student_marks_trend': 'Student Marks Trend',
    'student_radar': 'Student Radar Chart',
    'student_scores': 'Student Scores',
    'student_donut': 'Student Performance Composition',
    'dept_performance': 'Department Performance',
    'dept_risk': 'Department Risk Distribution',
    'year_performance': 'Year Performance',
    'college_overview': 'College Overview',
    'batch_analytics': 'Batch Analytics'
};

// Save current plot data
function savePlotData(plotType, plotData, metadata = {}) {
    const plotEntry = {
        id: Date.now(),
        type: plotType,
        title: PLOT_TYPES[plotType] || plotType,
        data: plotData,
        metadata: {
            timestamp: new Date().toISOString(),
            student: metadata.student || null,
            department: metadata.department || null,
            year: metadata.year || null,
            batch: metadata.batch || null,
            ...metadata
        }
    };
    
    previousPlots.unshift(plotEntry);
    
    // Keep only last 20 plots
    if (previousPlots.length > 20) {
        previousPlots = previousPlots.slice(0, 20);
    }
    
    localStorage.setItem('edumetric_previous_plots', JSON.stringify(previousPlots));
    updatePreviousPlotsList();
}

// Show previous plots modal
function showPreviousPlots() {
    let modal = document.getElementById('previous-plots-modal');
    if (!modal) {
        modal = createPreviousPlotModal();
    }
    
    updatePreviousPlotsList();
    modal.style.display = 'flex';
    modal.classList.add('show');
}

// Create previous plots modal
function createPreviousPlotModal() {
    const modal = document.createElement('div');
    modal.id = 'previous-plots-modal';
    modal.className = 'previous-plots-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Previous Analytics Plots</h3>
                <button class="modal-close" onclick="closePreviousPlots()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="plots-sidebar">
                    <h4>Saved Plots</h4>
                    <div id="plots-list" class="plots-list"></div>
                    <button class="clear-plots-btn" onclick="clearAllPlots()">
                        <i class="fa-solid fa-trash"></i> Clear All
                    </button>
                </div>
                <div class="plots-viewer">
                    <div class="plot-controls">
                        <button id="prev-plot-btn" onclick="navigatePlot(-1)" disabled>
                            <i class="fa-solid fa-chevron-left"></i> Previous
                        </button>
                        <span id="plot-counter">0 / 0</span>
                        <button id="next-plot-btn" onclick="navigatePlot(1)" disabled>
                            Next <i class="fa-solid fa-chevron-right"></i>
                        </button>
                    </div>
                    <div id="plot-display-area" class="plot-display-area">
                        <div class="no-plots-message">
                            <i class="fa-solid fa-chart-line"></i>
                            <h4>No Previous Plots</h4>
                            <p>Generate some analytics to see previous plots here</p>
                        </div>
                    </div>
                    <div class="plot-metadata" id="plot-metadata"></div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    return modal;
}

// Update plots list in sidebar
function updatePreviousPlotsList() {
    const plotsList = document.getElementById('plots-list');
    if (!plotsList) return;
    
    plotsList.innerHTML = '';
    
    if (previousPlots.length === 0) {
        plotsList.innerHTML = '<div class="no-plots">No saved plots</div>';
        return;
    }
    
    previousPlots.forEach((plot, index) => {
        const plotItem = document.createElement('div');
        plotItem.className = `plot-item ${index === currentPlotIndex ? 'active' : ''}`;
        plotItem.onclick = () => selectPlot(index);
        
        const date = new Date(plot.metadata.timestamp);
        const timeStr = date.toLocaleString();
        
        plotItem.innerHTML = `
            <div class="plot-title">${plot.title}</div>
            <div class="plot-time">${timeStr}</div>
            <div class="plot-context">
                ${plot.metadata.student ? `Student: ${plot.metadata.student}` : ''}
                ${plot.metadata.department ? `Dept: ${plot.metadata.department}` : ''}
                ${plot.metadata.year ? `Year: ${plot.metadata.year}` : ''}
                ${plot.metadata.batch ? `Batch: ${plot.metadata.batch}` : ''}
            </div>
        `;
        
        plotsList.appendChild(plotItem);
    });
    
    updatePlotControls();
}

// Select specific plot
function selectPlot(index) {
    currentPlotIndex = index;
    displayCurrentPlot();
    updatePreviousPlotsList();
}

// Navigate between plots
function navigatePlot(direction) {
    const newIndex = currentPlotIndex + direction;
    if (newIndex >= 0 && newIndex < previousPlots.length) {
        currentPlotIndex = newIndex;
        displayCurrentPlot();
        updatePreviousPlotsList();
    }
}

// Display current plot
function displayCurrentPlot() {
    const displayArea = document.getElementById('plot-display-area');
    const metadataArea = document.getElementById('plot-metadata');
    
    if (!displayArea || previousPlots.length === 0) return;
    
    const currentPlot = previousPlots[currentPlotIndex];
    
    // Clear previous plot
    displayArea.innerHTML = `
        <div class="plot-header">
            <h4>${currentPlot.title}</h4>
            <div class="plot-actions">
                <button onclick="exportCurrentPlot()" class="export-btn">
                    <i class="fa-solid fa-download"></i> Export
                </button>
                <button onclick="deletePlot(${currentPlotIndex})" class="delete-btn">
                    <i class="fa-solid fa-trash"></i> Delete
                </button>
            </div>
        </div>
        <div id="previous-plot-chart" class="previous-plot-chart"></div>
    `;
    
    // Render the plot
    try {
        renderPreviousPlot(currentPlot);
    } catch (error) {
        displayArea.innerHTML = `
            <div class="plot-error">
                <i class="fa-solid fa-exclamation-triangle"></i>
                <h4>Error Loading Plot</h4>
                <p>This plot data may be corrupted or incompatible</p>
            </div>
        `;
    }
    
    // Update metadata
    if (metadataArea) {
        const date = new Date(currentPlot.metadata.timestamp);
        metadataArea.innerHTML = `
            <h5>Plot Information</h5>
            <p><strong>Generated:</strong> ${date.toLocaleString()}</p>
            <p><strong>Type:</strong> ${currentPlot.title}</p>
            ${currentPlot.metadata.student ? `<p><strong>Student:</strong> ${currentPlot.metadata.student}</p>` : ''}
            ${currentPlot.metadata.department ? `<p><strong>Department:</strong> ${currentPlot.metadata.department}</p>` : ''}
            ${currentPlot.metadata.year ? `<p><strong>Year:</strong> ${currentPlot.metadata.year}</p>` : ''}
            ${currentPlot.metadata.batch ? `<p><strong>Batch:</strong> ${currentPlot.metadata.batch}</p>` : ''}
        `;
    }
    
    updatePlotControls();
}

// Render previous plot based on type
function renderPreviousPlot(plotData) {
    const chartDiv = document.getElementById('previous-plot-chart');
    if (!chartDiv) return;
    
    const layout = {
        ...window.defaultLayout,
        title: { text: plotData.title, font: { size: 16, color: '#1976d2' } },
        height: 400
    };
    
    // Render based on plot type
    switch (plotData.type) {
        case 'student_marks_trend':
            Plotly.newPlot(chartDiv, plotData.data.traces, layout, window.defaultChartConfig);
            break;
            
        case 'student_radar':
            Plotly.newPlot(chartDiv, plotData.data.traces, layout, window.defaultChartConfig);
            break;
            
        case 'student_scores':
        case 'dept_performance':
        case 'year_performance':
            Plotly.newPlot(chartDiv, plotData.data.traces, layout, window.defaultChartConfig);
            break;
            
        case 'student_donut':
        case 'dept_risk':
            layout.showlegend = true;
            Plotly.newPlot(chartDiv, plotData.data.traces, layout, window.defaultChartConfig);
            break;
            
        default:
            // Generic plot rendering
            if (plotData.data && plotData.data.traces) {
                Plotly.newPlot(chartDiv, plotData.data.traces, layout, window.defaultChartConfig);
            } else {
                chartDiv.innerHTML = '<div class="plot-error">Unsupported plot format</div>';
            }
    }
}

// Update plot navigation controls
function updatePlotControls() {
    const prevBtn = document.getElementById('prev-plot-btn');
    const nextBtn = document.getElementById('next-plot-btn');
    const counter = document.getElementById('plot-counter');
    
    if (prevBtn) prevBtn.disabled = currentPlotIndex <= 0;
    if (nextBtn) nextBtn.disabled = currentPlotIndex >= previousPlots.length - 1;
    if (counter) counter.textContent = `${currentPlotIndex + 1} / ${previousPlots.length}`;
}

// Delete specific plot
function deletePlot(index) {
    if (confirm('Are you sure you want to delete this plot?')) {
        previousPlots.splice(index, 1);
        localStorage.setItem('edumetric_previous_plots', JSON.stringify(previousPlots));
        
        if (currentPlotIndex >= previousPlots.length) {
            currentPlotIndex = Math.max(0, previousPlots.length - 1);
        }
        
        updatePreviousPlotsList();
        if (previousPlots.length > 0) {
            displayCurrentPlot();
        } else {
            document.getElementById('plot-display-area').innerHTML = `
                <div class="no-plots-message">
                    <i class="fa-solid fa-chart-line"></i>
                    <h4>No Previous Plots</h4>
                    <p>Generate some analytics to see previous plots here</p>
                </div>
            `;
        }
    }
}

// Clear all plots
function clearAllPlots() {
    if (confirm('Are you sure you want to clear all saved plots?')) {
        previousPlots = [];
        currentPlotIndex = 0;
        localStorage.removeItem('edumetric_previous_plots');
        updatePreviousPlotsList();
        document.getElementById('plot-display-area').innerHTML = `
            <div class="no-plots-message">
                <i class="fa-solid fa-chart-line"></i>
                <h4>No Previous Plots</h4>
                <p>Generate some analytics to see previous plots here</p>
            </div>
        `;
    }
}

// Export current plot
function exportCurrentPlot() {
    if (previousPlots.length === 0) return;
    
    const currentPlot = previousPlots[currentPlotIndex];
    const chartDiv = document.getElementById('previous-plot-chart');
    
    if (chartDiv && chartDiv.data) {
        Plotly.downloadImage(chartDiv, {
            format: 'png',
            filename: `${currentPlot.title}_${Date.now()}`,
            height: 600,
            width: 800
        });
    }
}

// Close previous plots modal
function closePreviousPlots() {
    const modal = document.getElementById('previous-plots-modal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

// Hook into existing chart rendering functions to auto-save plots
function hookIntoChartRendering() {
    // Override Plotly.newPlot to auto-save plots
    const originalNewPlot = Plotly.newPlot;
    Plotly.newPlot = function(div, traces, layout, config) {
        const result = originalNewPlot.call(this, div, traces, layout, config);
        
        // Auto-save certain plots
        if (div && div.id && layout && layout.title) {
            const plotType = determinePlotType(div.id, layout.title.text);
            if (plotType) {
                const plotData = {
                    traces: traces,
                    layout: layout,
                    config: config
                };
                
                const metadata = extractMetadataFromContext();
                savePlotData(plotType, plotData, metadata);
            }
        }
        
        return result;
    };
}

// Determine plot type from element ID and title
function determinePlotType(elementId, title) {
    if (elementId.includes('st-chart-marks')) return 'student_marks_trend';
    if (elementId.includes('st-chart-radar')) return 'student_radar';
    if (elementId.includes('st-chart-scores')) return 'student_scores';
    if (elementId.includes('st-chart-donut')) return 'student_donut';
    if (elementId.includes('dept-chart') && title.includes('Performance')) return 'dept_performance';
    if (elementId.includes('dept-chart') && title.includes('Risk')) return 'dept_risk';
    if (elementId.includes('year-chart') && title.includes('Performance')) return 'year_performance';
    if (elementId.includes('clg-chart')) return 'college_overview';
    if (elementId.includes('batch-chart')) return 'batch_analytics';
    
    return null;
}

// Extract metadata from current context
function extractMetadataFromContext() {
    const metadata = {};
    
    // Try to get current student info
    if (window.currentStudent) {
        metadata.student = `${window.currentStudent.NAME} (${window.currentStudent.RNO})`;
        metadata.department = window.currentStudent.DEPT;
        metadata.year = window.currentStudent.YEAR;
    }
    
    // Try to get department context
    const deptSelect = document.getElementById('d-dept');
    if (deptSelect && deptSelect.value) {
        metadata.department = deptSelect.value;
    }
    
    // Try to get year context
    const yearSelect = document.getElementById('y-year');
    if (yearSelect && yearSelect.value) {
        metadata.year = yearSelect.value;
    }
    
    // Try to get batch context
    const batchSelect = document.getElementById('batch-year-select');
    if (batchSelect && batchSelect.value) {
        metadata.batch = batchSelect.value;
    }
    
    return metadata;
}

// Initialize previous plots functionality
function initializePreviousPlots() {
    // Hook into chart rendering
    hookIntoChartRendering();
    
    // Add keyboard shortcut (Ctrl+P)
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            showPreviousPlots();
        }
    });
    
    // Initialize first display if plots exist
    if (previousPlots.length > 0) {
        currentPlotIndex = 0;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializePreviousPlots);