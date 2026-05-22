const API_URL = 'https://speedtest-backend-4oz8.onrender.com/';
const TEST_DURATION = 6000; // 6 segundos ativos para estabilizar taxas de transferência

let isTesting = false;
let speedChart = null;
let currentPhase = 'idle';

// Estrutura de dados limpa para coleta analítica
let telemetry = { labels: [], download: [], upload: [] };

function initChart() {
    // Captura o elemento canvas do HTML para renderizar o gráfico
    const canvasElement = document.getElementById('speedChart');
    if (!canvasElement) return;
    const ctx = canvasElement.getContext('2d');
    
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
    
    const tracker = setInterval(() => {
        const now = Date.now();
        secondsElapsed = (now - startTime) / 1000;
        if (secondsElapsed <= 0) return;
        const currentMbps = (totalBytes * 8) / (secondsElapsed * 1024 * 1024);
        
        document.getElementById('downloadSpeed').innerText = currentMbps.toFixed(1);
        document.getElementById('status').innerText = `📥 Baixando blocos de teste reais...`;
        document.getElementById('progressBar').style.width = `${15 + (secondsElapsed / (TEST_DURATION/1000)) * 40}%`;
        
        updateChart(Math.floor(secondsElapsed), currentMbps, null);
    }, 500);

    const streams = Array(2).fill(null).map(async () => {
        while (Date.now() - startTime < TEST_DURATION) {
            try {
                const response = await fetch(`${API_URL}?action=download&size=15&nc=${Math.random()}`);
                const reader = response.body.getReader();
                while (true)
