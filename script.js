let numResources = 0;
let availableData = [];
let processes = [];
let nextProcessId = 0;

function enterInterface() {
    const startup = document.querySelector('.startup-screen');
    const content = document.querySelector('.content');

    startup.classList.add('hidden');
    content.style.opacity = '1';
    content.style.pointerEvents = 'auto';
    document.body.style.backgroundImage = 
        'radial-gradient(ellipse at center, rgba(3, 3, 8, 0.3) 0%, rgba(3, 3, 8, 0.95) 100%),' +
        'url(\'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop\')';
        
    const floatingBg = document.getElementById('floating-bg');
    if(floatingBg) floatingBg.style.display = 'flex';
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
        
        // trigger reflow
        void dashboard.offsetWidth;
        dashboard.style.transition = 'opacity 0.6s ease';
        dashboard.style.opacity = '1';
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
    
    renderProcesses();
    closeProcessModal();
    startDetection();
}

function removeProcess(index) {
    processes.splice(index, 1);
    renderProcesses();
    startDetection();
}

function renderProcesses() {
    const list = document.getElementById('process-list');
    list.innerHTML = '';
    
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
                <button class="delete-process-btn" onclick="removeProcess(${index})" title="Remove Process">🗑️</button>
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
    
    // Make a copy of available data so we don't mutate the display state if user runs multiple times
    let work = [...availableData];
    
    // Visual processing state
    const btn = document.getElementById('submit-btn');
    const originalText = btn.innerText;
    btn.innerText = 'Analyzing Data...';
    btn.style.opacity = '0.7';
    btn.disabled = true;
    
    // Tiny artificial delay to mimic heavy calculation and play the beautiful button animation
    await new Promise(r => setTimeout(r, 600));

    // NORMAL JS FRONTEND LOGIC (Translated exactly from the C++)
    
    let finish = new Array(numP).fill(false);
    
    // A process is "finished" if it has no resources allocated and requests nothing
    for(let i = 0; i < numP; i++) {
        let has_allocation_or_request = false;
        for(let j = 0; j < numResources; j++) {
            if(allocation[i][j] > 0 || request[i][j] > 0) {
                has_allocation_or_request = true;
                break;
            }
        }
        if(!has_allocation_or_request) finish[i] = true;
    }
    
    // Main Detection Loop
    let found;
    do {
        found = false;
        for(let i = 0; i < numP; i++) {
            if(!finish[i]) {
                let can_be_satisfied = true;
                for(let j = 0; j < numResources; j++) {
                    if(request[i][j] > work[j]) {
                        can_be_satisfied = false;
                        break;
                    }
                }
                
                if(can_be_satisfied) {
                    for(let j = 0; j < numResources; j++) {
                        work[j] += allocation[i][j];
                    }
                    finish[i] = true;
                    found = true;
                }
            }
        }
    } while(found);
    
    // Final Report
    let deadlocked_procs = [];
    for(let i = 0; i < numP; i++) {
        if(!finish[i]) deadlocked_procs.push(processes[i].id);
    }

    const data = {
        is_deadlocked: deadlocked_procs.length > 0,
        deadlocked_procs: deadlocked_procs
    };

    // Re-enable button
    btn.innerText = originalText;
    btn.style.opacity = '1';
    btn.disabled = false;

    // Display
    displayResult(data);
    isDetecting = false;
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
    
    if (data.is_deadlocked) {
        resultSec.classList.add('active', 'danger');
        resultIcon.innerText = '⚠️';
        resultTitle.innerText = 'DEADLOCK DETECTED';
        
        const procs = data.deadlocked_procs.map(p => `<strong style="color:var(--danger)">P${p}</strong>`).join(', ');
        resultDesc.innerHTML = `Critical Stop: Processes ${procs} are involved in a circular wait and cannot proceed.
        <div style="margin-top: 1.5rem; padding: 1.5rem; background: rgba(220, 38, 38, 0.1); border-left: 4px solid var(--danger); border-radius: 8px; text-align: left;">
            <strong style="color: var(--danger); font-size: 1.1rem; display: block; margin-bottom: 0.8rem;">💡 Suggestions to Resolve Deadlock:</strong>
            <ul style="margin: 0; padding-left: 1.5rem; line-height: 1.6; color: #f8fafc;">
                <li><strong>Process Termination:</strong> Abort one or more deadlocked processes (e.g., P${data.deadlocked_procs.join(', P')}) to break the circular wait.</li>
                <li><strong>Resource Preemption:</strong> Forcefully reclaim allocated resources from lower-priority deadlocked processes.</li>
                <li><strong>State Rollback:</strong> Roll back the system to the last known safe checkpoint before the deadlock occurred.</li>
            </ul>
        </div>`;
    } else {
        resultSec.classList.add('active', 'success');
        resultIcon.innerText = '✅';
        resultTitle.innerText = 'SYSTEM IS SAFE';
        resultDesc.innerText = 'All processes have a valid execution sequence. No deadlocks will occur in the current state.';
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
