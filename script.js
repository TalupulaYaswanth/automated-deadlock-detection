let numResources = 0;
let availableData = [];
let processes = [];
let nextProcessId = 0;
let lastDetectionSteps = [];
let liveAvailableResources = [];
let deadlocked_procs = []; // Global for RAG sync

function enterInterface() {
    const startup = document.querySelector('.startup-screen');
    const content = document.querySelector('.content');

    startup.classList.add('hidden');
    content.style.opacity = '1';
    content.style.pointerEvents = 'auto';
    document.body.style.backgroundImage = 
        'radial-gradient(ellipse at center, rgba(3, 3, 8, 0.4) 0%, rgba(3, 3, 8, 0.98) 100%),' +
        'url(\'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2564&auto=format&fit=crop\')';
        

}

function defineResources() {
    numResources = parseInt(document.getElementById('r-count').value);
    
    if (isNaN(numResources) || numResources <= 0) {
        alert("Please enter a valid number of resource types > 0.");
        return;
    }
    
    document.getElementById('define-res-btn').style.display = 'none';
    document.getElementById('r-count').disabled = true;
    
    const availableGroup = document.getElementById('available-resources-group');
    const availableInputs = document.getElementById('available-inputs');
    availableInputs.innerHTML = '';
    
    for(let j=0; j<numResources; j++) {
        availableInputs.innerHTML += `
        <div style="display:flex; flex-direction:column; align-items:center;">
            <label style="font-size:0.8rem; color:#94a3b8; margin-bottom:4px; font-weight: bold;">[R${j}]</label>
            <input type="number" min="0" value="0" id="initial-avail-${j}">
        </div>`;
    }
    
    availableGroup.style.display = 'flex';
}

function saveAvailableResources() {
    availableData = [];
    for(let j=0; j<numResources; j++) {
        availableData.push(parseInt(document.getElementById(`initial-avail-${j}`).value) || 0);
    }
    
    // Initialize Live State: Total - current Allocations
    liveAvailableResources = [...availableData];
    processes.forEach(p => {
        for(let j=0; j<numResources; j++) {
            liveAvailableResources[j] -= p.allocation[j];
        }
    });

    // Smooth transition to Dashboard
    const setupSection = document.getElementById('resource-setup-section');
    setupSection.style.opacity = '0';
    
    setTimeout(() => {
        setupSection.style.display = 'none';
        
        const dashboard = document.getElementById('dashboard-section');
        dashboard.style.display = 'flex';
        dashboard.style.opacity = '0';
        
        let summaryStr = availableData.map((val, idx) => `R${idx}: ${val}`).join(' | ');
        document.getElementById('available-summary').innerText = `Total Avail: [ ${summaryStr} ]`;
        
        void dashboard.offsetWidth;
        dashboard.style.transition = 'opacity 0.6s ease';
        dashboard.style.opacity = '1';

        syncBankerToRAG(); // Initial Graph Sync
    }, 300);
}

function openProcessModal() {
    const modal = document.getElementById('add-process-modal');
    const inputsContainer = document.getElementById('process-modal-inputs');
    inputsContainer.innerHTML = '';
    
    let allocHtml = `<div class="matrix-container" style="padding: 1.5rem;"><div class="modal-section-title">Initial Allocation Vector</div><div class="vector-input">`;
    for(let j=0; j<numResources; j++) {
        allocHtml += `<div style="display:flex; flex-direction:column; align-items:center;">
            <label style="font-size:0.8rem; margin-bottom:4px">R${j}</label>
            <input type="number" min="0" value="0" id="mod-alloc-${j}">
        </div>`;
    }
    allocHtml += `</div></div>`;
    
    let reqHtml = `<div class="matrix-container" style="padding: 1.5rem;"><div class="modal-section-title">Maximum Request Vector</div><div class="vector-input">`;
    for(let j=0; j<numResources; j++) {
        reqHtml += `<div style="display:flex; flex-direction:column; align-items:center;">
            <label style="font-size:0.8rem; margin-bottom:4px">R${j}</label>
            <input type="number" min="0" value="0" id="mod-req-${j}">
        </div>`;
    }
    reqHtml += `</div></div>`;
    
    inputsContainer.innerHTML = allocHtml + reqHtml;
    
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('active');
    }, 20);
}

function closeProcessModal() {
    const modal = document.getElementById('add-process-modal');
    modal.classList.remove('active');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}

function saveProcess() {
    let alloc = [];
    let req = [];
    
    for(let j=0; j<numResources; j++) {
        alloc.push(parseInt(document.getElementById(`mod-alloc-${j}`).value) || 0);
        req.push(parseInt(document.getElementById(`mod-req-${j}`).value) || 0);
    }
    
    processes.push({
        id: nextProcessId++,
        allocation: alloc,
        request: req
    });

    // Update live state: Subtract the allocation of the specifically added process
    for(let j=0; j<numResources; j++) {
        liveAvailableResources[j] -= alloc[j];
    }
    
    renderProcesses();
    closeProcessModal();
    startDetection();
    syncBankerToRAG();
}

function removeProcess(index) {
    const p = processes[index];
    if (p) {
        // Release only allocation back
        for(let j=0; j<numResources; j++) {
            liveAvailableResources[j] += p.allocation[j];
        }
        processes.splice(index, 1);
        renderProcesses();
    }
    startDetection();
    syncBankerToRAG();
}

function renderProcesses() {
    const list = document.getElementById('process-list');
    list.innerHTML = '';
    
    // Display Live State
    let summaryStr = availableData.map((val, idx) => {
        return `R${idx}: ${liveAvailableResources[idx]}/${val}`;
    }).join(' | ');
    document.getElementById('available-summary').innerText = `Capacity (Avail/Total): [ ${summaryStr} ]`;
    
    if (processes.length === 0) {
        list.style.display = 'block';
        list.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 1.1rem; padding: 3rem; grid-column: 1 / -1; border: 2px dashed rgba(255,255,255,0.1); border-radius: 16px;">No processes added yet. Start by clicking "Add Process".</div>`;
        return;
    }
    
    list.style.display = 'grid';
    processes.forEach((p, index) => {
        const card = document.createElement('div');
        card.className = 'process-card';
        
        let allocStr = p.allocation.join(', ');
        let reqStr = p.request.join(', ');
        
        card.innerHTML = `
            <div class="process-card-header">
                <h3>Process P${p.id}</h3>
                <div style="display: flex; gap: 8px;">
                    <button class="primary-btn" onclick="completeProcess(${index})" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; background: var(--success); box-shadow: none;" title="Complete & Release">Complete ✅</button>
                    <button class="delete-process-btn" onclick="removeProcess(${index})" title="Remove Process">🗑️</button>
                </div>
            </div>
            <div class="vector-display">
                <div class="vector-row">
                    <span class="vector-label">Allocation</span>
                    <span class="vector-value">[ ${allocStr} ]</span>
                </div>
                <div class="vector-row" style="background: rgba(236, 72, 153, 0.05);">
                    <span class="vector-label" style="color: #f472b6;">Request</span>
                    <span class="vector-value" style="color: #f472b6;">[ ${reqStr} ]</span>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
}

function resetForm() {
    processes = [];
    nextProcessId = 0;
    availableData = [];
    numResources = 0;
    
    const dashboard = document.getElementById('dashboard-section');
    dashboard.style.display = 'none';
    
    const setupSection = document.getElementById('resource-setup-section');
    setupSection.style.display = 'flex';
    setupSection.style.opacity = '1';
    
    document.getElementById('r-count').value = '';
    document.getElementById('r-count').disabled = false;
    document.getElementById('define-res-btn').style.display = 'block';
    
    const availableGroup = document.getElementById('available-resources-group');
    availableGroup.style.display = 'none';
    
    const resultSec = document.getElementById('result-section');
    resultSec.classList.remove('active', 'success', 'danger');
    
    deadlocked_procs = [];
    syncBankerToRAG();
}

function completeProcess(index) {
    const cards = document.querySelectorAll('.process-card');
    const card = cards[index];
    if (!card) return;
    
    card.classList.add('completing');
    
    // Animate the summary
    const summary = document.getElementById('available-summary');
    summary.classList.remove('pulse-success');
    void summary.offsetWidth; // trigger reflow
    summary.classList.add('pulse-success');
    
    const p = processes[index];
    if (p) {
        // OPTION B: Release both Allocation + Request
        for(let j=0; j<numResources; j++) {
            liveAvailableResources[j] += (p.allocation[j] + p.request[j]);
        }
    }
    
    setTimeout(() => {
        processes.splice(index, 1);
        renderProcesses();
        // Clear result as system state changed
        document.getElementById('result-section').classList.remove('active');
        syncBankerToRAG();
    }, 600);
}

let currentSimStep = 0;
let isSimulating = false;

async function executeSafeSequence() {
    if (lastDetectionSteps.length === 0) return;
    
    // Close the results section during simulation
    document.getElementById('result-section').classList.remove('active');
    
    // Iterate through the safe sequence recorded in lastDetectionSteps
    for (const step of lastDetectionSteps) {
        const pIndex = processes.findIndex(p => p.id === step.processId);
        if (pIndex !== -1) {
            completeProcess(pIndex);
            // Wait for completion animation + extra beat
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

function startManualSimulation() {
    if (lastDetectionSteps.length === 0) return;
    
    currentSimStep = 0;
    isSimulating = true;
    
    // Close results
    document.getElementById('result-section').classList.remove('active');
    
    // Show controller
    const controller = document.getElementById('sim-controller');
    controller.classList.add('active');
    
    updateSimulationUI();
}

function updateSimulationUI() {
    if (currentSimStep >= lastDetectionSteps.length) {
        stopSimulation();
        return;
    }
    
    const step = lastDetectionSteps[currentSimStep];
    const stepText = document.getElementById('sim-step-text');
    stepText.innerText = `Process P${step.processId} (${currentSimStep + 1} of ${lastDetectionSteps.length})`;
    
    // Highlight the process card
    document.querySelectorAll('.process-card').forEach(c => c.classList.remove('sim-highlight'));
    const pIndex = processes.findIndex(p => p.id === step.processId);
    if (pIndex !== -1) {
        const cards = document.querySelectorAll('.process-card');
        if (cards[pIndex]) {
            cards[pIndex].classList.add('sim-highlight');
            cards[pIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

function advanceSimulation() {
    if (!isSimulating || currentSimStep >= lastDetectionSteps.length) return;
    
    const step = lastDetectionSteps[currentSimStep];
    const pIndex = processes.findIndex(p => p.id === step.processId);
    
    if (pIndex !== -1) {
        completeProcess(pIndex);
        currentSimStep++;
        
        if (currentSimStep < lastDetectionSteps.length) {
            setTimeout(updateSimulationUI, 700);
        } else {
            setTimeout(stopSimulation, 700);
        }
    }
}

function stopSimulation() {
    isSimulating = false;
    currentSimStep = 0;
    document.getElementById('sim-controller').classList.remove('active');
    document.querySelectorAll('.process-card').forEach(c => c.classList.remove('sim-highlight'));
}

let isDetecting = false;
async function startDetection() {
    if (processes.length === 0) {
        document.getElementById('result-section').classList.remove('active', 'success', 'danger');
        return;
    }
    if (isDetecting) return;
    isDetecting = true;
    
    let numP = processes.length;
    let allocation = [];
    let request = [];
    
    // Map data from processes array
    for(let i=0; i<numP; i++) {
        allocation[i] = [...processes[i].allocation];
        request[i] = [...processes[i].request];
    }
    
    // Initial Work is now the Live Available State
    let work = [...liveAvailableResources];
    
    // Get button reference early (needed for both error and success paths)
    const btn = document.getElementById('submit-btn');
    const originalText = btn.innerText;
    
    // Validation: Check if system is over-allocated (Available < 0)
    let overAllocated = [];
    for(let j=0; j<numResources; j++) {
        if (work[j] < 0) overAllocated.push(`R${j}`);
    }
    
    if (overAllocated.length > 0) {
        displayOverAllocationError(overAllocated, work, availableData);
        btn.innerText = originalText;
        btn.style.opacity = '1';
        btn.disabled = false;
        isDetecting = false;
        return;
    }
    
    // Visual processing state
    btn.innerText = 'Analyzing Data...';
    btn.style.opacity = '0.7';
    btn.disabled = true;
    
    // Tiny artificial delay to mimic heavy calculation and play the beautiful button animation
    await new Promise(r => setTimeout(r, 600));
    
    lastDetectionSteps = [];
    let logicTrace = [];
    logicTrace.push({ type: 'info', msg: `Initialized with System Total: [${availableData.join(', ')}]` });
    logicTrace.push({ type: 'info', msg: `Current Available (Total - Sum of Alloc): [${work.join(', ')}]` });
    
    let currentWorkSteps = [ [...work] ];
    // NORMAL JS FRONTEND LOGIC (Translated exactly from the C++)
    
    let finish = new Array(numP).fill(false);
    
    // Algorithm 4 Initialization: Process is finished if it holds 0 resources
    for(let i = 0; i < numP; i++) {
        let is_holding = false;
        for(let j = 0; j < numResources; j++) {
            if(allocation[i][j] > 0) is_holding = true;
        }
        if(!is_holding) {
            finish[i] = true;
            logicTrace.push({ type: 'success', msg: `Process P${processes[i].id} is not holding any resources. Marking as finished.` });
        }
    }
    
    // Main Detection Loop
    let found;
    do {
        found = false;
        for(let i = 0; i < numP; i++) {
            if(!finish[i]) {
                logicTrace.push({ type: 'info', msg: `Checking Process P${processes[i].id}: Request [${request[i].join(', ')}] vs Available [${work.join(', ')}]` });
                
                let can_be_satisfied = true;
                for(let j = 0; j < numResources; j++) {
                    if(request[i][j] > work[j]) {
                        can_be_satisfied = false;
                        logicTrace.push({ type: 'error', msg: `  -> P${processes[i].id} blocked on Resource R${j}.` });
                        break;
                    }
                }
                
                if(can_be_satisfied) {
                    let snapshotBefore = [...work];
                    logicTrace.push({ type: 'success', msg: `  -> P${processes[i].id} Request [${request[i].join(', ')}] can be satisfied by Available [${work.join(', ')}].` });
                    
                    // Standard Algorithm Step 3: Work = Work + Allocation[i]
                    // Process finishes and releases ONLY its held (allocated) resources
                    for(let j = 0; j < numResources; j++) {
                        work[j] += allocation[i][j];
                    }
                    finish[i] = true;
                    found = true;
                    
                    logicTrace.push({ type: 'release', msg: `  -> RELEASING: Allocation [${allocation[i].join(', ')}] returned to system (Work = Work + Allocation)` });
                    logicTrace.push({ type: 'info', msg: `  -> New System Available: [${work.join(', ')}]` });
                    
                    lastDetectionSteps.push({
                        processId: processes[i].id,
                        workBefore: snapshotBefore,
                        allocation: [...allocation[i]],
                        request: [...request[i]],
                        workAfter: [...work]
                    });
                }
            }
        }
    } while(found);
    
    // Final Report
    deadlocked_procs = [];
    for(let i = 0; i < numP; i++) {
        if(!finish[i]) {
            deadlocked_procs.push(processes[i].id);
            logicTrace.push({ type: 'error', msg: `PROCESS P${processes[i].id} IS DEADLOCKED.` });
        }
    }

    const data = {
        is_deadlocked: deadlocked_procs.length > 0,
        deadlocked_procs: deadlocked_procs,
        logicTrace: logicTrace
    };

    // Re-enable button
    btn.innerText = originalText;
    btn.style.opacity = '1';
    btn.disabled = false;

    // Display
    displayResult(data);
    isDetecting = false;
    syncBankerToRAG();
}

function displayOverAllocationError(overAllocated, work, totals) {
    const resultSec = document.getElementById('result-section');
    const resultIcon = document.getElementById('result-icon');
    const resultTitle = document.getElementById('result-title');
    const resultDesc = document.getElementById('result-desc');
    
    resultSec.className = 'result-container danger active';
    resultIcon.innerText = '❌';
    resultTitle.innerText = 'OVER-ALLOCATION ERROR';
    
    deadlocked_procs = []; // reset
    syncBankerToRAG();
    
    let details = overAllocated.map(resId => {
        const idx = parseInt(resId.substring(1));
        const total = totals[idx];
        const allocated = total - work[idx];
        return `<li><strong>${resId}:</strong> Allocated ${allocated} but Total is only ${total}.</li>`;
    }).join('');
    
    resultDesc.innerHTML = `
        <p>The system cannot exist in this state because more resources have been allocated than are physically available.</p>
        <ul style="text-align: left; margin: 1rem 0; color: #fecaca; line-height: 1.6;">
            ${details}
        </ul>
        <p>Please remove or edit processes to fit within system capacity.</p>
    `;
    
    setTimeout(() => {
        resultSec.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
}

function displayResult(data) {
    const resultSec = document.getElementById('result-section');
    const resultIcon = document.getElementById('result-icon');
    const resultTitle = document.getElementById('result-title');
    const resultDesc = document.getElementById('result-desc');
    
    // Reset classes
    resultSec.className = 'result-container';
    
    // Force a reflow for animation restart
    void resultSec.offsetWidth; 
    
    // Generate Sequence Summary
    let sequenceHtml = '';
    if (lastDetectionSteps.length > 0) {
        const orderNodes = lastDetectionSteps.map(s => `<span class="sequence-node">P${s.processId}</span>`).join('<span class="sequence-arrow">➔</span>');
        sequenceHtml = `
            <div class="sequence-container">
                <div class="sequence-label">Execution Order (Safe Sequence)</div>
                <div class="sequence-flow">
                    ${orderNodes}
                    ${data.is_deadlocked ? '<span class="sequence-arrow">➔</span><span class="sequence-node dead">STUCK ❌</span>' : ''}
                </div>
            </div>
        `;
    }

    let traceHtml = `
        ${sequenceHtml}
        <div class="trace-log-container">
            <div class="trace-log-header">
                <h5>Step-by-Step Logic Trace</h5>
                <span style="font-size: 0.7rem; color: var(--text-muted);">Algorithm v4.0 (Resource Release Simulation)</span>
            </div>
            <div class="trace-log-body">
                ${data.logicTrace.map(line => `<div class="trace-line ${line.type}">${line.msg}</div>`).join('')}
            </div>
        </div>
    `;
    
    if (data.is_deadlocked) {
        resultSec.classList.add('active', 'danger');
        resultIcon.innerText = '⚠️';
        resultTitle.innerText = 'DEADLOCK DETECTED';
        
        const procs = data.deadlocked_procs.map(p => `<strong style="color:var(--danger)">P${p}</strong>`).join(', ');
        resultDesc.innerHTML = `
            Critical Stop: The system reached a deadlock. Processes ${procs} are stuck and cannot proceed.
            <div style="margin-top: 1.5rem; padding: 1.5rem; background: rgba(220, 38, 38, 0.1); border-left: 4px solid var(--danger); border-radius: 8px; text-align: left;">
                <strong style="color: var(--danger); font-size: 1.1rem; display: block; margin-bottom: 0.8rem;">💡 Suggestions to Resolve Deadlock:</strong>
                <ul style="margin: 0; padding-left: 1.5rem; line-height: 1.6; color: #f8fafc;">
                    <li><strong>Process Termination:</strong> Abort deadlocked processes to break the cycle.</li>
                    <li><strong>Resource Preemption:</strong> Reclaim allocated resources from holding processes.</li>
                </ul>
            </div>
            ${traceHtml}
        `;
    } else {
        resultSec.classList.add('active', 'success');
        resultIcon.innerText = '✅';
        resultTitle.innerText = 'SYSTEM IS SAFE';
        resultDesc.innerHTML = `
            <p>All processes have a valid execution sequence. Resources are released correctly at each step.</p>
            <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 1.5rem; flex-wrap: wrap;">
                <button onclick="toggleFlowModal(true)" class="primary-btn" style="background: var(--primary-gradient); font-size: 0.9rem; padding: 0.6rem 1.2rem;">
                    Show Execution Flow ✨
                </button>
                <button onclick="executeSafeSequence()" class="primary-btn" style="background: linear-gradient(135deg, #10b981, #059669); font-size: 0.9rem; padding: 0.6rem 1.2rem;">
                    Execute All 🚀
                </button>
                <button onclick="startManualSimulation()" class="primary-btn" style="background: linear-gradient(135deg, #f59e0b, #d97706); font-size: 0.9rem; padding: 0.6rem 1.2rem;">
                    Step-by-Step Simulation 🖱️
                </button>
            </div>
            ${traceHtml}
        `;
    }
    
    // Scroll to reveal result smoothly
    setTimeout(() => {
        resultSec.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
}

// Lightbox Modal Functions
function openModal(imgSrc) {
    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-img');
    
    // Convert to high-res variant dynamically for Unsplash
    let highResSrc = imgSrc.replace(/&w=\d+/, '&w=1400');
    
    modalImg.src = highResSrc;
    modal.style.display = 'flex';
    
    // Give browser brief tick to register display flex before running opacity transition
    setTimeout(() => {
        modal.classList.add('active');
    }, 20);
}

function closeModal() {
    const modal = document.getElementById('image-modal');
    modal.classList.remove('active');
    
    setTimeout(() => {
        modal.style.display = 'none';
        document.getElementById('modal-img').src = ''; // Clear image to prevent flash on next open
    }, 300);
}

// Sparkly Gemini-style Particle Background
function initParticles() {
    const canvas = document.getElementById('particle-canvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    
    window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    });

    const particles = [];
    const particleCount = 80;

    for(let i=0; i<particleCount; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: Math.random() * 2.5 + 0.5,
            speedY: Math.random() * 0.8 + 0.2, // Move vertically
            opacity: Math.random() * 0.6 + 0.1,
            color: Math.random() > 0.5 ? '168, 85, 247' : '99, 102, 241' // Gemini UI purple and blue
        });
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);
        
        for(let i=0; i<particleCount; i++) {
            let p = particles[i];
            
            p.y -= p.speedY; // Only update Y line to "lock vertical"
            
            // Loop around when off-screen
            if(p.y < -10) {
                p.y = height + 10;
                p.x = Math.random() * width;
            }
            
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${p.color}, ${p.opacity})`;
            ctx.shadowBlur = 15;
            ctx.shadowColor = `rgba(${p.color}, 0.8)`;
            ctx.fill();
        }
        
        requestAnimationFrame(animate);
    }
    
    animate();
}

function toggleFlowModal(show) {
    const modal = document.getElementById('execution-flow-modal');
    if (show) {
        renderExecutionFlow();
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);
    } else {
        modal.classList.remove('active');
        setTimeout(() => modal.style.display = 'none', 300);
    }
}

function renderExecutionFlow() {
    const container = document.getElementById('flow-timeline');
    container.innerHTML = '';
    
    if (lastDetectionSteps.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 2rem;">No processes could be satisfied in the current state.</div>';
        return;
    }
    
    lastDetectionSteps.forEach((step, index) => {
        const stepCard = document.createElement('div');
        stepCard.className = 'flow-step-card';
        stepCard.style.animationDelay = `${index * 0.1}s`;
        
        const beforeStr = step.workBefore.join(', ');
        const allocStr = step.allocation.join(', ');
        const reqStr = step.request.join(', ');
        const afterStr = step.workAfter.join(', ');
        
        stepCard.innerHTML = `
            <div class="flow-step-number">${index + 1}</div>
            <div class="flow-step-content">
                <div class="flow-step-header">
                    <h4>Process P${step.processId} Completed</h4>
                </div>
                <div class="flow-step-details">
                    <div class="flow-detail-item">
                        <span class="detail-label">Initial Available</span>
                        <span class="detail-value">[ ${beforeStr} ]</span>
                    </div>
                    <div class="flow-detail-item" style="color: #818cf8; background: rgba(99, 102, 241, 0.05); border-radius: 6px; padding: 4px 8px;">
                        <span class="detail-label" style="color: #818cf8;">Request Needed</span>
                        <span class="detail-value">[ ${step.request.join(', ')} ]</span>
                    </div>
                    <div class="flow-detail-item" style="color: var(--success); background: rgba(16, 185, 129, 0.05); border-radius: 6px; padding: 4px 8px;">
                        <span class="detail-label" style="color: var(--success);">+ Released (Allocation)</span>
                        <span class="detail-value">[ ${step.allocation.join(', ')} ]</span>
                    </div>
                    <div class="flow-detail-item" style="border-top: 1px dashed rgba(255,255,255,0.1); margin-top: 5px; padding-top: 5px;">
                        <span class="detail-label">Final System Available</span>
                        <span class="detail-value" style="color: #a855f7;">[ ${afterStr} ]</span>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(stepCard);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    
    // Wait for fonts to be ready before drawing text particles to avoid incorrect character sizes
    if (document.fonts) {
        document.fonts.ready.then(() => {
            initTextParticles();
        });
    } else {
        setTimeout(initTextParticles, 500);
    }
});

function initTextParticles() {
    const canvas = document.getElementById('text-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const container = document.getElementById('text-particle-container');
    
    let width = canvas.width = container.clientWidth;
    let height = canvas.height = container.clientHeight;
    
    let particles = [];
    
    let mouse = {
        x: null,
        y: null,
        radius: 70
    }
    
    canvas.addEventListener('mousemove', function(event) {
        let rect = canvas.getBoundingClientRect();
        mouse.x = event.clientX - rect.left;
        mouse.y = event.clientY - rect.top;
    });
    
    canvas.addEventListener('mouseleave', function() {
        mouse.x = null;
        mouse.y = null;
    });
    
    window.addEventListener('resize', function() {
        width = canvas.width = container.clientWidth;
        height = canvas.height = container.clientHeight;
        initParticlesArray();
    });
    
    class Particle {
        constructor(x, y, color) {
            this.x = x + (Math.random() - 0.5) * 5;
            this.y = y + (Math.random() - 0.5) * 5;
            this.baseX = x;
            this.baseY = y;
            this.density = (Math.random() * 20) + 5;
            this.size = Math.random() * 1.5 + 0.8;
            this.color = color;
        }
        draw() {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fill();
        }
        update() {
            let dx = mouse.x - this.x;
            let dy = mouse.y - this.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            let forceDirectionX = dx / distance;
            let forceDirectionY = dy / distance;
            let maxDistance = mouse.radius;
            let force = (maxDistance - distance) / maxDistance;
            let directionX = forceDirectionX * force * this.density;
            let directionY = forceDirectionY * force * this.density;
            
            if (distance < mouse.radius) {
                this.x -= directionX;
                this.y -= directionY;
            } else {
                if (this.x !== this.baseX) {
                    let dx = this.x - this.baseX;
                    this.x -= dx / 15;
                }
                if (this.y !== this.baseY) {
                    let dy = this.y - this.baseY;
                    this.y -= dy / 15;
                }
            }
        }
    }
    
    function initParticlesArray() {
        particles = [];
        ctx.fillStyle = 'white';
        ctx.font = '800 3rem "Outfit", sans-serif'; 
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.fillText('Automated Deadlock Detection', width / 2, height / 2);
        
        const textCoordinates = ctx.getImageData(0, 0, width, height);
        ctx.clearRect(0, 0, width, height);
        
        let minX = width, maxX = 0;
        
        for (let y = 0; y < textCoordinates.height; y += 3) {
            for (let x = 0; x < textCoordinates.width; x += 3) {
                if (textCoordinates.data[(y * 4 * textCoordinates.width) + (x * 4) + 3] > 128) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                }
            }
        }
        
        for (let y = 0; y < textCoordinates.height; y += 3) {
            for (let x = 0; x < textCoordinates.width; x += 3) {
                if (textCoordinates.data[(y * 4 * textCoordinates.width) + (x * 4) + 3] > 128) {
                    let progress = (x - minX) / (maxX - minX);
                    let color = '#f8fafc'; 
                    
                    if (progress > 0.48) { 
                       if (progress < 0.75) {
                           color = '#a855f7'; 
                       } else {
                           color = '#ec4899'; 
                       }
                    } else {
                       color = '#cbd5e1';
                    }

                    particles.push(new Particle(x, y, color));
                }
            }
        }
    }
    
    initParticlesArray();
    
    function animate() {
        ctx.clearRect(0, 0, width, height);
        for (let i = 0; i < particles.length; i++) {
            particles[i].draw();
            particles[i].update();
        }
        requestAnimationFrame(animate);
    }
    
    animate();
}
