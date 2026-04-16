// =============================================================
//  Resource Allocation Graph (RAG) → Wait-for Graph Engine
//  Single-instance resource deadlock detection
// =============================================================

// ── State ─────────────────────────────────────────────────────
let ragProcesses     = [];   // [{ label }]          e.g. {label:'P0'}
let ragResources     = [];   // [{ label, instances }]
let ragEdges         = [];   // [{ type, from, to }]
                              //   type 'request': process→resource  (P requests R)
                              //   type 'hold':    resource→process  (R held by P)
let ragNextProcId    = 0;
let ragNextResId     = 0;
let ragDeadlockCycle = [];   // process indices forming the cycle
let ragDerivedEdges  = [];   // [{fromP, toP}]  derived wait-for edges
let ragAnimFrame     = null;
let ragDragging      = null; // { kind:'p'|'r', idx, offsetX, offsetY }
let ragProcPos       = [];   // [{x,y}]
let ragResPos        = [];   // [{x,y}]
let ragTime          = 0;

// ── Canvas helper ──────────────────────────────────────────────
const ragCanvas = () => document.getElementById('wfg-canvas');
const ragCW     = () => { const c = ragCanvas(); return c ? c.width  : 700; };
const ragCH     = () => { const c = ragCanvas(); return c ? c.height : 500; };

// ── Init / Reset ───────────────────────────────────────────────
function wfgInit() {
    ragProcesses = []; ragResources = []; ragEdges = [];
    ragProcPos   = []; ragResPos    = [];
    ragNextProcId = 0; ragNextResId = 0;
    ragDeadlockCycle = []; ragDerivedEdges = [];
    ragRenderUI();
    ragStartCanvas();
}

function wfgReset() {
    wfgInit();
    const sec = document.getElementById('wfg-result-section');
    if (sec) sec.classList.remove('active', 'success', 'danger');
}

// ── Add nodes ──────────────────────────────────────────────────
function wfgAddProcess() {
    ragProcesses.push({ label: `P${ragNextProcId++}` });
    ragProcPos.push(ragSpawnPos('p', ragProcesses.length - 1));
    ragDeadlockCycle = []; ragDerivedEdges = [];
    ragRenderUI();
}

function wfgAddResource(forcedInstances = null) {
    const instEl = document.getElementById('rag-res-instances');
    const instances = forcedInstances !== null ? forcedInstances : (instEl ? parseInt(instEl.value) || 1 : 1);
    
    ragResources.push({ 
        label: `R${ragNextResId++}`,
        instances: instances
    });
    ragResPos.push(ragSpawnPos('r', ragResources.length - 1));
    ragDeadlockCycle = []; ragDerivedEdges = [];
}

function ragSpawnPos(kind, idx) {
    const cw = ragCW(), ch = ragCH();
    // Processes on the left half, resources on the right half
    if (kind === 'p') {
        const col = Math.floor(idx / 3), row = idx % 3;
        return { x: 80 + col * 110, y: 100 + row * 130 };
    } else {
        const col = Math.floor(idx / 3), row = idx % 3;
        return { x: cw - 80 - col * 110, y: 100 + row * 130 };
    }
}

// ── Remove nodes ───────────────────────────────────────────────
function wfgRemoveProcess(idx) {
    ragProcesses.splice(idx, 1);
    ragProcPos.splice(idx, 1);
    ragEdges = ragEdges.filter(e => {
        if (e.type === 'request' && e.from === idx) return false;
        if (e.type === 'hold'    && e.to   === idx) return false;
        return true;
    }).map(e => {
        let ne = { ...e };
        if (e.type === 'request' && e.from > idx) ne.from--;
        if (e.type === 'hold'    && e.to   > idx) ne.to--;
        return ne;
    });
    ragDeadlockCycle = []; ragDerivedEdges = [];
    ragRenderUI();
}

function wfgRemoveResource(idx) {
    ragResources.splice(idx, 1);
    ragResPos.splice(idx, 1);
    ragEdges = ragEdges.filter(e => {
        if (e.type === 'request' && e.to   === idx) return false;
        if (e.type === 'hold'    && e.from === idx) return false;
        return true;
    }).map(e => {
        let ne = { ...e };
        if (e.type === 'request' && e.to   > idx) ne.to--;
        if (e.type === 'hold'    && e.from > idx) ne.from--;
        return ne;
    });
    ragDeadlockCycle = []; ragDerivedEdges = [];
    ragRenderUI();
}

// ── Add edges ──────────────────────────────────────────────────
function wfgAddEdge() {
    const typeSel = document.getElementById('rag-edge-type');
    const aSel    = document.getElementById('rag-edge-a');
    const bSel    = document.getElementById('rag-edge-b');

    if (!typeSel || !aSel || !bSel) return;
    const type = typeSel.value;
    const a    = parseInt(aSel.value);
    const b    = parseInt(bSel.value);

    if (isNaN(a) || isNaN(b)) { ragMsg('Select both nodes.', 'warn'); return; }

    // Validate: request = P→R, hold = R→P
    if (type === 'request') {
        // Multi-edge allows multiple units requested
        ragEdges.push({ type: 'request', from: a, to: b });
    } else {
        // Multi-instance check: can't hold more than the total capacity
        const currentHolders = ragEdges.filter(e => e.type === 'hold' && e.from === a).length;
        if (currentHolders >= ragResources[a].instances) {
            ragMsg(`All ${ragResources[a].instances} instance(s) of ${ragResources[a].label} are already allocated.`, 'warn'); return;
        }
        
        ragEdges.push({ type: 'hold', from: a, to: b });
    }

    ragMsg('', '');
    ragDeadlockCycle = []; ragDerivedEdges = [];
    ragRenderUI();
}

function wfgRemoveEdge(idx) {
    ragEdges.splice(idx, 1);
    ragDeadlockCycle = []; ragDerivedEdges = [];
    ragRenderUI();
}

// ── Main Multi-Instance Deadlock Detection Algorithm ──────────
function wfgDetectDeadlock() {
    const numP = ragProcesses.length;
    const numR = ragResources.length;

    if (numP === 0) { ragShowResult(null, []); return; }

    // 1. Initialize Matrices
    // Available[j] = total instances of Rj minus those currently held
    const Available = ragResources.map(r => r.instances);
    const Allocation = Array.from({ length: numP }, () => new Array(numR).fill(0));
    const Request    = Array.from({ length: numP }, () => new Array(numR).fill(0));

    ragEdges.forEach(e => {
        if (e.type === 'hold') {
            // R -> P
            Allocation[e.to][e.from]++;
            Available[e.from]--;
        } else {
            // P -> R
            Request[e.from][e.to]++;
        }
    });

    // 2. Run Detection Algorithm (Work/Finish)
    const Work = [...Available];
    const Finish = new Array(numP).fill(false);

    // Initial Finish condition: if a process has no allocation, it's not deadlocked yet (or can be treated as finished)
    // However, formal detection usually starts all false unless allocation is 0.
    // Let's stick to the formal: Finish[i] = (Allocation[i] == 0)
    for (let i = 0; i < numP; i++) {
        const hasAllocation = Allocation[i].some(val => val > 0);
        if (!hasAllocation) Finish[i] = true;
    }

    let changed = true;
    while (changed) {
        changed = false;
        for (let i = 0; i < numP; i++) {
            if (!Finish[i]) {
                // Check if Request[i] <= Work
                let canFinish = true;
                for (let j = 0; j < numR; j++) {
                    if (Request[i][j] > Work[j]) {
                        canFinish = false;
                        break;
                    }
                }

                if (canFinish) {
                    // Work = Work + Allocation[i]
                    for (let j = 0; j < numR; j++) {
                        Work[j] += Allocation[i][j];
                    }
                    Finish[i] = true;
                    changed = true;
                }
            }
        }
    }

    // 3. Identify deadlocked processes
    const deadlockedIndices = [];
    for (let i = 0; i < numP; i++) {
        // Technically, if Finish[i] is still false, it's deadlocked.
        // But we only care about processes that HAVE an allocation/request and are stuck.
        if (!Finish[i]) deadlockedIndices.push(i);
    }

    ragDeadlockCycle = deadlockedIndices;
    // We still derive the WFG for visual flavor (P waits for P)
    ragDerivedEdges = ragDeriveWFG();
    ragShowResult(ragDeadlockCycle, ragDerivedEdges);
}

// ── Derive Wait-for Graph helper (for visualization only) ──────
function ragDeriveWFG() {
    const derived = [];
    const numR = ragResources.length;
    for (let ri = 0; ri < numR; ri++) {
        const holders    = ragEdges.filter(e => e.type === 'hold'    && e.from === ri).map(e => e.to);
        const requesters = ragEdges.filter(e => e.type === 'request' && e.to   === ri).map(e => e.from);
        for (const req of requesters) {
            for (const hld of holders) {
                if (req !== hld && !derived.some(d => d.fromP === req && d.toP === hld)) {
                    derived.push({ fromP: req, toP: hld });
                }
            }
        }
    }
    return derived;
}

// ── Display result ─────────────────────────────────────────────
function ragShowResult(deadlockIndices, derived) {
    const sec   = document.getElementById('wfg-result-section');
    const icon  = document.getElementById('wfg-result-icon');
    const title = document.getElementById('wfg-result-title');
    const desc  = document.getElementById('wfg-result-desc');

    if (!sec) return;
    sec.className = 'result-container';
    void sec.offsetWidth;

    // Build derived WFG table
    const wfgTable = derived && derived.length > 0
        ? `<div style="margin-top:0.75rem;padding:0.75rem;background:rgba(0,0,0,0.3);border-radius:8px;font-family:monospace;font-size:0.85rem;line-height:1.8;">
            <strong style="color:#c084fc;font-family:'Outfit';font-size:0.8rem;text-transform:uppercase;letter-spacing:0.08em;">Circular Waiting Analysis (WFG):</strong><br>
            ${derived.map(d =>
                `<span style="color:${(deadlockIndices||[]).includes(d.fromP) && (deadlockIndices||[]).includes(d.toP) ? '#f87171' : '#818cf8'}">
                    ${ragProcesses[d.fromP].label} → ${ragProcesses[d.toP].label}
                </span>`
            ).join(' &nbsp;|&nbsp; ')}
           </div>`
        : `<div style="margin-top:0.75rem;padding:0.75rem;background:rgba(0,0,0,0.3);border-radius:8px;font-size:0.85rem;color:var(--text-muted);">No wait-for dependencies found.</div>`;

    if (deadlockIndices === null) {
        sec.classList.add('active', 'danger');
        icon.innerText  = '⚠️';
        title.innerText = 'NO DATA';
        desc.innerHTML  = '<p>Add nodes and edges to begin deadlock analysis.</p>';
    } else if (deadlockIndices.length === 0) {
        sec.classList.add('active', 'success');
        icon.innerText  = '✅';
        title.innerText = 'SAFE STATE';
        desc.innerHTML  = `
            <p>The <strong>Safety Algorithm</strong> found a sequence where all processes can complete — no deadlock exists.</p>
            ${wfgTable}
            <div style="margin-top:1rem;padding:1rem;background:rgba(16,185,129,0.08);border-left:4px solid var(--success);border-radius:8px;text-align:left;">
              <strong style="color:var(--success);">Analysis:</strong>
              <p style="margin:.5rem 0 0;color:#f8fafc;font-size:0.92rem;">
                Even if there is circular waiting, the available resource instances are sufficient to allow at least one process in the chain to finish and release its resources, breaking any potential deadlock.
              </p>
            </div>`;
    } else {
        const names  = deadlockIndices.map(i => `<strong style="color:var(--danger)">${ragProcesses[i].label}</strong>`).join(', ');
        sec.classList.add('active', 'danger');
        icon.innerText  = '🔴';
        title.innerText = 'DEADLOCK DETECTED';
        desc.innerHTML  = `
            <p>A <strong>deadlock</strong> has been detected! The following processes are stuck in a circular wait with no available instances to break it.</p>
            ${wfgTable}
            <div style="margin-top:1rem;padding:1rem;background:rgba(239,68,68,0.08);border-left:4px solid var(--danger);border-radius:8px;text-align:left;">
              <strong style="color:var(--danger);">Deadlocked Processes:</strong>
              <p style="margin:.5rem 0 1rem;font-family:monospace;color:#fca5a5;font-size:1rem;">${names}</p>
              <strong style="color:var(--danger);">💡 Recovery Strategies:</strong>
              <ul style="margin:.5rem 0 0;padding-left:1.4rem;line-height:1.7;color:#f8fafc;font-size:0.92rem;">
                <li><strong>Abort Processes:</strong> Terminate one or more of the deadlocked processes.</li>
                <li><strong>Resource Preemption:</strong> Reclaim resources from a deadlocked process to satisfy others.</li>
              </ul>
            </div>
            <div style="margin-top:1rem;padding:1rem;background:rgba(168,85,247,0.06);border-left:4px solid #a855f7;border-radius:8px;text-align:left;">
              <strong style="color:#c084fc;">📖 Multi-Instance Theory:</strong>
              <p style="margin:.5rem 0 0;color:#f8fafc;font-size:0.88rem;">
                In multi-instance systems, a <strong>cycle</strong> in the graph is a <em>necessary</em> but not <em>sufficient</em> condition for deadlock. 
                The system only enters a deadlock if the number of available instances cannot satisfy any process in a circular chain.
              </p>
            </div>`;
    }
    setTimeout(() => sec.scrollIntoView({ behavior: 'smooth', block: 'end' }), 100);
}

// ── Render UI controls ─────────────────────────────────────────
function ragRenderUI() {
    // Process badge list
    const procList = document.getElementById('rag-proc-list');
    if (procList) {
        procList.innerHTML = ragProcesses.length === 0
            ? '<span style="color:var(--text-muted);font-size:0.85rem;">No processes.</span>'
            : ragProcesses.map((p, i) => `
                <div class="wfg-proc-badge">
                    <span>${p.label}</span>
                    <button class="delete-process-btn" onclick="wfgRemoveProcess(${i})" title="Remove">✕</button>
                </div>`).join('');
    }

    // Resource badge list
    const resList = document.getElementById('rag-res-list');
    if (resList) {
        resList.innerHTML = ragResources.length === 0
            ? '<span style="color:var(--text-muted);font-size:0.85rem;">No resources.</span>'
            : ragResources.map((r, i) => `
                <div class="wfg-proc-badge" style="background:rgba(20,184,166,0.12);border-color:rgba(20,184,166,0.3);color:#5eead4;">
                    <span>▣ ${r.label} <small style="opacity:0.7;font-weight:400;">(x${r.instances})</small></span>
                    <button class="delete-process-btn" onclick="wfgRemoveResource(${i})" title="Remove">✕</button>
                </div>`).join('');
    }

    // Populate edge type selector → update A/B dropdowns
    ragRepopulateEdgeSelectors();

    // Edge list
    const edgeList = document.getElementById('wfg-edge-list');
    if (edgeList) {
        if (ragEdges.length === 0) {
            edgeList.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:0.75rem;">No edges yet.</div>';
        } else {
            edgeList.innerHTML = ragEdges.map((e, i) => {
                let label, meaning, color;
                if (e.type === 'request') {
                    label   = `${ragProcesses[e.from]?.label} → ${ragResources[e.to]?.label}`;
                    meaning = `${ragProcesses[e.from]?.label} requests ${ragResources[e.to]?.label}`;
                    color   = '#818cf8';
                } else {
                    label   = `${ragResources[e.from]?.label} → ${ragProcesses[e.to]?.label}`;
                    meaning = `${ragResources[e.from]?.label} is held by ${ragProcesses[e.to]?.label}`;
                    color   = '#5eead4';
                }
                return `
                <div class="wfg-edge-item">
                    <span class="wfg-edge-label" style="color:${color}">${label}</span>
                    <span class="wfg-edge-meaning">${meaning}</span>
                    <button class="delete-process-btn" onclick="wfgRemoveEdge(${i})" title="Remove edge">🗑️</button>
                </div>`;
            }).join('');
        }
    }
}

function ragRepopulateEdgeSelectors() {
    const typeEl = document.getElementById('rag-edge-type');
    const aEl    = document.getElementById('rag-edge-a');
    const bEl    = document.getElementById('rag-edge-b');
    if (!typeEl || !aEl || !bEl) return;

    const type = typeEl.value || 'request';
    ragUpdateEdgeAB(type);
}

function ragOnTypeChange() {
    const typeEl = document.getElementById('rag-edge-type');
    if (!typeEl) return;
    ragUpdateEdgeAB(typeEl.value);

    // Update the labels
    const aLabel = document.getElementById('rag-label-a');
    const bLabel = document.getElementById('rag-label-b');
    const arrow  = document.getElementById('rag-arrow');
    if (typeEl.value === 'request') {
        if (aLabel) aLabel.innerText = 'Process';
        if (bLabel) bLabel.innerText = 'Resource';
        if (arrow)  arrow.style.color = '#818cf8';
    } else {
        if (aLabel) aLabel.innerText = 'Resource';
        if (bLabel) bLabel.innerText = 'Process';
        if (arrow)  arrow.style.color = '#5eead4';
    }
}

function ragUpdateEdgeAB(type) {
    const aEl = document.getElementById('rag-edge-a');
    const bEl = document.getElementById('rag-edge-b');
    if (!aEl || !bEl) return;

    const prevA = aEl.value, prevB = bEl.value;

    if (type === 'request') {
        // A = process, B = resource
        aEl.innerHTML = '<option value="" disabled selected>Process</option>' +
            ragProcesses.map((p, i) => `<option value="${i}">${p.label}</option>`).join('');
        bEl.innerHTML = '<option value="" disabled selected>Resource</option>' +
            ragResources.map((r, i) => `<option value="${i}">${r.label}</option>`).join('');
    } else {
        // A = resource, B = process
        aEl.innerHTML = '<option value="" disabled selected>Resource</option>' +
            ragResources.map((r, i) => `<option value="${i}">${r.label}</option>`).join('');
        bEl.innerHTML = '<option value="" disabled selected>Process</option>' +
            ragProcesses.map((p, i) => `<option value="${i}">${p.label}</option>`).join('');
    }

    // Restore selection if still valid
    if (prevA) aEl.value = prevA;
    if (prevB) bEl.value = prevB;
}

// ── Load Demo (mirrors the video example in the unified view) ────────
function wfgLoadDemo() {
    if (typeof resetForm !== 'function') return;
    
    // 1. Reset everything
    resetForm();
    
    // 2. Setup System Resources (4 types, 1 instance each)
    numResources = 4;
    availableData = [1, 1, 1, 1];
    liveAvailableResources = [0, 0, 0, 0]; // starts at 0 since all are allocated below
    
    // Transition UI to dashboard
    document.getElementById('resource-setup-section').style.display = 'none';
    const dashboard = document.getElementById('dashboard-section');
    dashboard.style.display = 'flex';
    dashboard.style.opacity = '1';
    
    let summaryStr = availableData.map((val, idx) => `R${idx}: ${val}`).join(' | ');
    document.getElementById('available-summary').innerText = `Total Avail: [ ${summaryStr} ]`;

    // 3. Setup Processes (Allocation and Request vectors)
    nextProcessId = 0;
    processes = [
        { id: 0, allocation: [1, 0, 0, 0], request: [0, 0, 0, 1] }, // P0 holds R0, requests R3
        { id: 1, allocation: [0, 1, 0, 0], request: [1, 0, 0, 0] }, // P1 holds R1, requests R0
        { id: 2, allocation: [0, 0, 1, 0], request: [0, 1, 0, 0] }, // P2 holds R2, requests R1
        { id: 3, allocation: [0, 0, 0, 1], request: [0, 0, 1, 0] }, // P3 holds R3, requests R2
        { id: 4, allocation: [0, 0, 0, 0], request: [0, 0, 1, 0] }  // P4 holds nothing, requests R2
    ];

    // 4. Update UI and Sync Graph
    renderProcesses();
    startDetection(); 
    // syncBankerToRAG() is called inside startDetection() in script.js
}

// ── Utility message ────────────────────────────────────────────
function ragMsg(msg, type) {
    const el = document.getElementById('wfg-msg');
    if (!el) return;
    el.innerText = msg;
    el.className = `wfg-msg ${type}`;
    el.style.display = msg ? 'block' : 'none';
}

// ══════════════════════════════════════════════════════════════
//  CANVAS RENDERING — Resource Allocation Graph
// ══════════════════════════════════════════════════════════════

const PROC_R = 28;   // circle radius for processes
const RES_S  = 26;   // half-side for resource squares

let ragListenersAttached = false;

function ragStartCanvas() {
    const canvas = ragCanvas();
    if (!canvas) return;
    if (ragAnimFrame) cancelAnimationFrame(ragAnimFrame);

    const resize = () => {
        canvas.width  = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    };
    resize();

    // Only set up observers and listeners once per canvas element
    if (!ragListenersAttached) {
        const ro = new ResizeObserver(resize);
        ro.observe(canvas);

        canvas.addEventListener('mousedown',  ragMouseDown);
        canvas.addEventListener('mousemove',  ragMouseMove);
        canvas.addEventListener('mouseup',    ragMouseUp);
        canvas.addEventListener('mouseleave', ragMouseUp);
        canvas.addEventListener('touchstart', ragTouchStart, { passive: true });
        canvas.addEventListener('touchmove',  ragTouchMove,  { passive: false });
        canvas.addEventListener('touchend',   ragMouseUp);
        ragListenersAttached = true;
    }

    ragLoop();
}

function ragLoop() {
    const canvas = ragCanvas();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ragTime += 0.018;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.022)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width;  x += 45) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += 45) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }

    // Draw edges
    const edgeCounts = {}; // Track how many edges between same pairs
    ragEdges.forEach(e => {
        const pairKey = e.type === 'request' ? `p${e.from}-r${e.to}` : `r${e.from}-p${e.to}`;
        edgeCounts[pairKey] = (edgeCounts[pairKey] || 0) + 1;
        const currentIdx = edgeCounts[pairKey] - 1;
        const totalForPair = ragEdges.filter(ee => 
            ee.type === e.type && ee.from === e.from && ee.to === e.to
        ).length;

        if (e.type === 'request') {
            const pPos = ragProcPos[e.from];
            const rPos = ragResPos[e.to];
            if (pPos && rPos) drawRagArrow(ctx, pPos, rPos, 'proc', 'res', false, ragTime, currentIdx, totalForPair);
        } else {
            const rPos = ragResPos[e.from];
            const pPos = ragProcPos[e.to];
            if (rPos && pPos) drawRagArrow(ctx, rPos, pPos, 'res', 'proc', false, ragTime, currentIdx, totalForPair);
        }
    });

    // Derived WFG edges (overlay in purple/red)
    ragDerivedEdges.forEach(d => {
        const fromPos = ragProcPos[d.fromP];
        const toPos   = ragProcPos[d.toP];
        if (!fromPos || !toPos) return;
        const inCycle = ragDeadlockCycle.includes(d.fromP) && ragDeadlockCycle.includes(d.toP);
        drawWFGOverlay(ctx, fromPos, toPos, inCycle, ragTime);
    });

    // Draw resource nodes (squares)
    ragResources.forEach((r, i) => {
        const pos = ragResPos[i];
        if (!pos) return;
        drawResNode(ctx, pos.x, pos.y, r, ragTime, i === (ragDragging?.kind === 'r' ? ragDragging.idx : -1));
    });

    // Draw process nodes (circles)
    ragProcesses.forEach((p, i) => {
        const pos = ragProcPos[i];
        if (!pos) return;
        const inCycle = ragDeadlockCycle.includes(i);
        drawProcNode(ctx, pos.x, pos.y, p.label, inCycle, ragTime, i === (ragDragging?.kind === 'p' ? ragDragging.idx : -1));
    });

    ragAnimFrame = requestAnimationFrame(ragLoop);
}

// ── Edge arrow (RAG) ───────────────────────────────────────────
function ragEdgeOffset(pos, fromKind, dx, dy, dist) {
    const ux = dx / dist, uy = dy / dist;
    if (fromKind === 'proc') return { x: pos.x + ux * PROC_R, y: pos.y + uy * PROC_R };
    // square: use the face closest to the target
    const ax = Math.abs(ux), ay = Math.abs(uy);
    let fx, fy;
    if (ax > ay) { fx = pos.x + Math.sign(ux) * RES_S; fy = pos.y + uy * RES_S / ax; }
    else         { fy = pos.y + Math.sign(uy) * RES_S; fx = pos.x + ux * RES_S / ay; }
    return { x: fx, y: fy };
}

function drawRagArrow(ctx, from, to, fromKind, toKind, inCycle, t, idx = 0, total = 1) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.sqrt(dx*dx + dy*dy) || 1;

    const start = ragEdgeOffset(from, fromKind,  dx, dy, dist);
    const end   = ragEdgeOffset(to,   toKind,   -dx, -dy, dist);

    const isHold    = (toKind === 'proc');
    const lineColor = isHold ? 'rgba(94,234,212,0.7)' : 'rgba(129,140,248,0.7)';

    ctx.save();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth   = 1.8;
    ctx.shadowColor = isHold ? 'rgba(20,184,166,0.4)' : 'rgba(99,102,241,0.4)';
    ctx.shadowBlur  = 6;
    ctx.setLineDash([]);

    // Curve to avoid overlap if multiple edges exist
    const sweep = (idx - (total - 1) / 2) * 20;
    const midX = (start.x + end.x) / 2 + (dy / dist) * sweep;
    const midY = (start.y + end.y) / 2 - (dx / dist) * sweep;

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(midX, midY, end.x, end.y);
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(end.y - midY, end.x - midX);
    ctx.fillStyle  = lineColor;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - 11 * Math.cos(angle - 0.38), end.y - 11 * Math.sin(angle - 0.38));
    ctx.lineTo(end.x - 11 * Math.cos(angle + 0.38), end.y - 11 * Math.sin(angle + 0.38));
    ctx.closePath(); ctx.fill();
    ctx.restore();
}

// ── Derived WFG edge overlay (P→P) ────────────────────────────
function drawWFGOverlay(ctx, from, to, inCycle, t) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
    const ux = dx/dist, uy = dy/dist;

    const startX = from.x + ux * PROC_R;
    const startY = from.y + uy * PROC_R;
    const endX   = to.x   - ux * (PROC_R + 5);
    const endY   = to.y   - uy * (PROC_R + 5);

    const pulse = inCycle ? Math.abs(Math.sin(t * 2.5)) * 0.5 + 0.5 : 0.65;
    const color = inCycle ? `rgba(239,68,68,${pulse})` : `rgba(168,85,247,${pulse})`;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = inCycle ? 2.5 : 1.5;
    ctx.shadowColor = inCycle ? 'rgba(239,68,68,0.7)' : 'rgba(168,85,247,0.5)';
    ctx.shadowBlur  = inCycle ? 14 : 5;

    if (inCycle) { ctx.setLineDash([7, 4]); ctx.lineDashOffset = -t * 18; }
    else         { ctx.setLineDash([4, 6]); }

    // Bigger curve to distinguish from RAG edges
    const midX = (startX + endX) / 2 - uy * 32;
    const midY = (startY + endY) / 2 + ux * 32;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(midX, midY, endX, endY);
    ctx.stroke();

    ctx.setLineDash([]);
    const angle = Math.atan2(endY - midY, endX - midX);
    ctx.fillStyle  = color;
    ctx.shadowBlur = inCycle ? 12 : 3;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - 13 * Math.cos(angle - 0.38), endY - 13 * Math.sin(angle - 0.38));
    ctx.lineTo(endX - 13 * Math.cos(angle + 0.38), endY - 13 * Math.sin(angle + 0.38));
    ctx.closePath(); ctx.fill();
    ctx.restore();
}

// ── Process node (circle) ──────────────────────────────────────
function drawProcNode(ctx, x, y, label, inCycle, t, isDragging) {
    const pulse = inCycle ? Math.abs(Math.sin(t * 3)) * 0.5 + 0.5 : 0;
    const r     = PROC_R + (isDragging ? 4 : 0);

    if (inCycle) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r + 10 + pulse * 7, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(239,68,68,${0.12 + pulse * 0.3})`;
        ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = inCycle ? 'rgba(239,68,68,0.7)' : 'rgba(99,102,241,0.5)';
    ctx.shadowBlur  = 18;

    const g = ctx.createRadialGradient(x - r*0.3, y - r*0.3, r*0.1, x, y, r);
    g.addColorStop(0, inCycle ? '#7f1d1d' : '#312e81');
    g.addColorStop(1, inCycle ? '#450a0a' : '#1e1b4b');
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();

    const bg = ctx.createLinearGradient(x-r, y-r, x+r, y+r);
    bg.addColorStop(0, inCycle ? '#ef4444' : '#6366f1');
    bg.addColorStop(1, inCycle ? '#dc2626' : '#a855f7');
    ctx.strokeStyle = bg; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.font = `bold 13px 'Outfit', sans-serif`;
    ctx.fillStyle = inCycle ? '#fca5a5' : '#f8fafc';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
    ctx.restore();
}

// ── Rounded-rect path helper (works in all browsers) ──────────
function ragRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ── Resource node (square with rounded corners) ────────────────
function drawResNode(ctx, x, y, res, t, isDragging) {
    const label = res.label;
    const instances = res.instances || 1;
    const s = RES_S + (isDragging ? 4 : 0);
    ctx.save();
    ctx.shadowColor = 'rgba(20,184,166,0.5)';
    ctx.shadowBlur  = 14;

    // Fill
    const g = ctx.createLinearGradient(x - s, y - s, x + s, y + s);
    g.addColorStop(0, '#134e4a');
    g.addColorStop(1, '#042f2e');
    ragRoundRect(ctx, x - s, y - s, s * 2, s * 2, 6);
    ctx.fillStyle = g;
    ctx.fill();

    // Stroke
    ragRoundRect(ctx, x - s, y - s, s * 2, s * 2, 6);
    ctx.strokeStyle = '#14b8a6';
    ctx.lineWidth   = 2.2;
    ctx.stroke();

    // Visualize instances
    if (instances === 1) {
        // Single dot for single instance
        ctx.shadowBlur  = 8; ctx.shadowColor = '#5eead4';
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#5eead4'; ctx.fill();
    } else if (instances <= 5) {
        // Small dots for small counts
        ctx.shadowBlur = 4; ctx.shadowColor = '#5eead4';
        ctx.fillStyle = '#5eead4';
        const cols = instances === 4 ? 2 : 3;
        for (let i = 0; i < instances; i++) {
            const ix = (i % cols) - (cols - 1) / 2;
            const iy = Math.floor(i / cols) - (Math.ceil(instances / cols) - 1) / 2;
            ctx.beginPath();
            ctx.arc(x + ix * 10, y + iy * 10, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }
    } else {
        // Number for large counts
        ctx.fillStyle = '#5eead4';
        ctx.font = 'bold 14px "Outfit", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(instances, x, y);
    }
    ctx.restore();

    // Label below the square
    ctx.save();
    ctx.font         = 'bold 11px \'Outfit\', sans-serif';
    ctx.fillStyle    = '#ccfbf1';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x, y + s + 5);
    ctx.restore();
}

// ── Drag & drop ────────────────────────────────────────────────
function ragHitTest(mx, my) {
    for (let i = ragProcPos.length - 1; i >= 0; i--) {
        const p = ragProcPos[i];
        if (!p) continue;
        const dx = mx - p.x, dy = my - p.y;
        if (Math.sqrt(dx*dx + dy*dy) < PROC_R + 4) return { kind: 'p', idx: i };
    }
    for (let i = ragResPos.length - 1; i >= 0; i--) {
        const r = ragResPos[i];
        if (!r) continue;
        if (Math.abs(mx - r.x) < RES_S + 4 && Math.abs(my - r.y) < RES_S + 4) return { kind: 'r', idx: i };
    }
    return null;
}

function ragCoords(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top)  * (canvas.height / rect.height)
    };
}

function ragMouseDown(e) {
    const { x, y } = ragCoords(ragCanvas(), e.clientX, e.clientY);
    const hit = ragHitTest(x, y);
    if (hit) {
        const pos = hit.kind === 'p' ? ragProcPos[hit.idx] : ragResPos[hit.idx];
        ragDragging = { ...hit, offsetX: x - pos.x, offsetY: y - pos.y };
    }
}
function ragMouseMove(e) {
    if (!ragDragging) return;
    const { x, y } = ragCoords(ragCanvas(), e.clientX, e.clientY);
    const arr = ragDragging.kind === 'p' ? ragProcPos : ragResPos;
    const margin = ragDragging.kind === 'p' ? PROC_R : RES_S;
    arr[ragDragging.idx] = {
        x: Math.max(margin, Math.min(ragCW() - margin, x - ragDragging.offsetX)),
        y: Math.max(margin, Math.min(ragCH() - margin, y - ragDragging.offsetY))
    };
}
function ragMouseUp()   { ragDragging = null; }
function ragTouchStart(e) {
    const t = e.touches[0];
    const { x, y } = ragCoords(ragCanvas(), t.clientX, t.clientY);
    const hit = ragHitTest(x, y);
    if (hit) {
        const pos = hit.kind === 'p' ? ragProcPos[hit.idx] : ragResPos[hit.idx];
        ragDragging = { ...hit, offsetX: x - pos.x, offsetY: y - pos.y };
    }
}
function ragTouchMove(e) {
    if (!ragDragging) return;
    e.preventDefault();
    const t = e.touches[0];
    const { x, y } = ragCoords(ragCanvas(), t.clientX, t.clientY);
    const arr = ragDragging.kind === 'p' ? ragProcPos : ragResPos;
    const margin = ragDragging.kind === 'p' ? PROC_R : RES_S;
    arr[ragDragging.idx] = {
        x: Math.max(margin, Math.min(ragCW() - margin, x - ragDragging.offsetX)),
        y: Math.max(margin, Math.min(ragCH() - margin, y - ragDragging.offsetY))
    };
}

// ── Banker's Integration Bridge ───────────────────────────────
function syncBankerToRAG() {
    // External globals from script.js: processes, availableData, numResources, deadlocked_procs
    if (typeof processes === 'undefined' || typeof availableData === 'undefined') return;

    // 1. Setup Resources
    const newResources = [];
    for (let j = 0; j < numResources; j++) {
        newResources.push({
            label: `R${j}`,
            instances: availableData[j] || 0
        });
        // Position if new
        if (!ragResPos[j]) {
            ragResPos[j] = ragSpawnPos('r', j);
        }
    }
    ragResources = newResources;
    ragResPos = ragResPos.slice(0, numResources);
    ragNextResId = numResources;

    // 2. Setup Processes
    const newProcesses = [];
    const newProcPos = [];
    processes.forEach((p, i) => {
        newProcesses.push({ label: `P${p.id}`, bankerId: p.id });
        // Use existing position or spawn new one
        const existingIdx = ragProcesses.findIndex(rp => rp.bankerId === p.id);
        if (existingIdx !== -1 && ragProcPos[existingIdx]) {
            newProcPos.push(ragProcPos[existingIdx]);
        } else {
            newProcPos.push(ragSpawnPos('p', i));
        }
    });
    ragProcesses = newProcesses;
    ragProcPos = newProcPos;
    ragNextProcId = processes.length > 0 ? Math.max(...processes.map(p => p.id)) + 1 : 0;

    // 3. Setup Edges
    ragEdges = [];
    processes.forEach((p, i) => {
        for (let j = 0; j < numResources; j++) {
            // Allocation edges: R -> P (Hold)
            for (let count = 0; count < (p.allocation[j] || 0); count++) {
                ragEdges.push({ type: 'hold', from: j, to: i });
            }
            // Request edges: P -> R
            for (let count = 0; count < (p.request[j] || 0); count++) {
                ragEdges.push({ type: 'request', from: i, to: j });
            }
        }
    });

    // 4. Update Deadlock Highlights (from global results if detection just ran)
    // We check if startDetection just finished and set deadlocked_procs globally
    if (typeof deadlocked_procs !== 'undefined') {
        ragDeadlockCycle = [];
        processes.forEach((p, i) => {
            if (deadlocked_procs.includes(p.id)) {
                ragDeadlockCycle.push(i);
            }
        });
    } else {
        ragDeadlockCycle = [];
    }

    ragDerivedEdges = []; // Clear derived edges for integrated view
    
    // Ensure canvas is running
    if (!ragAnimFrame) ragStartCanvas();
}
