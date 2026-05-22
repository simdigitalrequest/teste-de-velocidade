const API_URL = 'speed-test-backend.php';
const TEST_DURATION = 7000; // 7 segundos ativos para estabilizar taxas de transferência

let isTesting = false;
let speedChart = null;
let currentPhase = 'idle';

// Estrutura de dados limpa para coleta analítica
let telemetry = { labels: [], download: [], upload: [] };

function initChart() {
    https://speedtest-backend-xxx.onrender.com
    speedChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Download',
                    data: [],
                    borderColor: '#00f0ff',
                    backgroundColor: 'rgba(0, 240, 255, 0.03)',
                    borderWidth: 3,
                    tension: 0.35,
                    fill: true,
                    pointRadius: 0
                },
                {
                    label: 'Upload',
                    data: [],
                    borderColor: '#7000ff',
                    backgroundColor: 'rgba(112, 0, 255, 0.03)',
                    borderWidth: 3,
                    tension: 0.35,
                    fill: true,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#8fa0dd', font: { size: 12 } } } },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#8fa0dd' }, beginAtZero: true },
                x: { grid: { display: false }, ticks: { color: '#506399' } }
            }
        }
    });
}

function updateChart(sec, dl, ul) {
    telemetry.labels.push(`${sec}s`);
    if(dl !== null) telemetry.download.push(dl.toFixed(2));
    if(ul !== null) telemetry.upload.push(ul.toFixed(2));
    
    speedChart.data.labels = telemetry.labels;
    if(dl !== null) speedChart.data.datasets[0].data = telemetry.download;
    if(ul !== null) speedChart.data.datasets[1].data = telemetry.upload;
    speedChart.update('none');
}

async function measurePingJitter() {
    const samples = 12;
    let latencies = [];
    
    setBoxActive('ping-box');
    
    for (let i = 0; i < samples; i++) {
        const tStart = performance.now();
        try {
            await fetch(`${API_URL}?action=ping&nocache=${Math.random()}`, { method: 'HEAD', mode: 'cors' });
            latencies.push(performance.now() - tStart);
        } catch (e) {
            latencies.push(10);
        }
        document.getElementById('status').innerText = `📡 Sincronizando rede de teste... (${i+1}/${samples})`;
        document.getElementById('progressBar').style.width = `${(i/samples) * 15}%`;
        await new Promise(r => setTimeout(r, 60));
    }
    
    latencies.sort((a,b)=>a-b);
    let ping = latencies[Math.floor(latencies.length / 2)];
    
    let jitter = 0;
    for(let i=1; i<latencies.length; i++) jitter += Math.abs(latencies[i] - latencies[i-1]);
    jitter = jitter / (latencies.length - 1);
    
    document.getElementById('ping').innerText = ping.toFixed(0);
    document.getElementById('jitter').innerText = jitter.toFixed(0);
    return { ping, jitter };
}

async function measureDownload() {
    setBoxActive('download-box');
    const startTime = Date.now();
    let totalBytes = 0;
    let secondsElapsed = 0;
    
    // Controlador de amostragem de tempo real
    const tracker = setInterval(() => {
        const now = Date.now();
        secondsElapsed = (now - startTime) / 1000;
        const currentMbps = (totalBytes * 8) / (secondsElapsed * 1024 * 1024);
        
        document.getElementById('downloadSpeed').innerText = currentMbps.toFixed(1);
        document.getElementById('status').innerText = `📥 Baixando blocos de teste reais...`;
        document.getElementById('progressBar').style.width = `${15 + (secondsElapsed / (TEST_DURATION/1000)) * 40}%`;
        
        updateChart(Math.floor(secondsElapsed), currentMbps, null);
    }, 500);

    // Motor multi-stream paralelo adaptativo
    const streams = Array(4).fill(null).map(async () => {
        while (Date.now() - startTime < TEST_DURATION) {
            try {
                const response = await fetch(`${API_URL}?action=download&size=40&nc=${Math.random()}`);
                const reader = response.body.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    totalBytes += value.byteLength;
                    if (Date.now() - startTime >= TEST_DURATION) { reader.cancel(); break; }
                }
            } catch (e) { break; }
        }
    });

    await Promise.all(streams);
    clearInterval(tracker);
    
    const finalElapsed = (Date.now() - startTime) / 1000;
    return (totalBytes * 8) / (finalElapsed * 1024 * 1024);
}

async function measureUpload() {
    setBoxActive('upload-box');
    const startTime = Date.now();
    let totalBytesSent = 0;
    let secondsElapsed = 0;
    
    // Bloco randômico de 8MB pesado para simular tráfego criptografado real
    const payload = new Uint8Array(8 * 1024 * 1024);
    crypto.getRandomValues(payload);

    const tracker = setInterval(() => {
        const now = Date.now();
        secondsElapsed = (now - startTime) / 1000;
        const currentMbps = (totalBytesSent * 8) / (secondsElapsed * 1024 * 1024);
        
        document.getElementById('uploadSpeed').innerText = currentMbps.toFixed(1);
        document.getElementById('status').innerText = `📤 Injetando tráfego de upload real...`;
        document.getElementById('progressBar').style.width = `${55 + (secondsElapsed / (TEST_DURATION/1000)) * 45}%`;
        
        updateChart(Math.floor(secondsElapsed) + 8, null, currentMbps);
    }, 500);

    const streams = Array(3).fill(null).map(async () => {
        while (Date.now() - startTime < TEST_DURATION) {
            try {
                await fetch(`${API_URL}?action=upload&nc=${Math.random()}`, {
                    method: 'POST',
                    body: payload,
                    mode: 'cors'
                });
                totalBytesSent += payload.byteLength;
            } catch (e) { break; }
        }
    });

    await Promise.all(streams);
    clearInterval(tracker);
    
    const finalElapsed = (Date.now() - startTime) / 1000;
    return (totalBytesSent * 8) / (finalElapsed * 1024 * 1024);
}

function setBoxActive(className) {
    document.querySelectorAll('.result-box').forEach(b => b.classList.remove('active-measure'));
    if(className) document.querySelector(`.${className}`).classList.add('active-measure');
}

async function runEngine() {
    if (isTesting) return;
    isTesting = true;
    
    document.getElementById('startTest').disabled = true;
    telemetry = { labels: [], download: [], upload: [] };
    if(speedChart) speedChart.destroy();
    initChart();

    try {
        await measurePingJitter();
        const finalDl = await measureDownload();
        document.getElementById('downloadSpeed').innerText = finalDl.toFixed(2);
        
        const finalUl = await measureUpload();
        document.getElementById('uploadSpeed').innerText = finalUl.toFixed(2);
        
        setBoxActive(null);
        document.getElementById('status').innerHTML = `<span style="color:var(--success)">⚡ Sistema de análise concluído com sucesso.</span>`;
        document.getElementById('progressBar').style.width = '100%';
    } catch(err) {
        document.getElementById('status').innerText = '❌ Interrupção de rede detectada.';
        setBoxActive(null);
    } finally {
        isTesting = false;
        document.getElementById('startTest').disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    document.getElementById('startTest').addEventListener('click', runEngine);
});
