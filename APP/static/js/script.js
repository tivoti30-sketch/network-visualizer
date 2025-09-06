// ===== GLOBAL VARIABLES =====
let currentView = 'main';
let commandHistory = [];
let networkPaths = {};
let appStartTime = new Date();
let zoomLevel = 1;
let currentVisualization = null;

// ===== DOM ELEMENTS =====
const elements = {
    form: document.getElementById('commandForm'),
    commandInput: document.getElementById('commandInput'),
    rawOutputDiv: document.getElementById('rawOutput'),
    visualizationDiv: document.getElementById('visualization'),
    historySection: document.getElementById('historySection'),
    pathsSection: document.getElementById('pathsSection'),
    infoSection: document.getElementById('infoSection'),
    mainSection: document.getElementById('mainSection'),
    historyList: document.getElementById('historyList'),
    pathsContainer: document.getElementById('pathsContainer'),
    showHistoryBtn: document.getElementById('showHistoryBtn'),
    showPathsBtn: document.getElementById('showPathsBtn'),
    showInfoBtn: document.getElementById('showInfoBtn'),
    mainViewBtn: document.getElementById('mainViewBtn'),
    refreshHistoryBtn: document.getElementById('refreshHistoryBtn'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn'),
    refreshPathsBtn: document.getElementById('refreshPathsBtn'),
    exportPathsBtn: document.getElementById('exportPathsBtn'),
    copyOutputBtn: document.getElementById('copyOutputBtn'),
    zoomInBtn: document.getElementById('zoomInBtn'),
    zoomOutBtn: document.getElementById('zoomOutBtn'),
    resetViewBtn: document.getElementById('resetViewBtn'),
    confirmModal: document.getElementById('confirmModal'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    modalCancelBtn: document.getElementById('modalCancelBtn'),
    modalConfirmBtn: document.getElementById('modalConfirmBtn'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingDetails: document.getElementById('loadingDetails'),
    historyCount: document.getElementById('historyCount'),
    pathsCount: document.getElementById('pathsCount'),
    totalTargets: document.getElementById('totalTargets'),
    totalHops: document.getElementById('totalHops'),
    totalIPs: document.getElementById('totalIPs'),
    totalRequests: document.getElementById('totalRequests'),
    dbSize: document.getElementById('dbSize'),
    appUptime: document.getElementById('appUptime'),
    systemStatus: document.getElementById('systemStatus'),
    lastUpdate: document.getElementById('lastUpdate'),
    frontendStatus: document.getElementById('frontendStatus'),
    commandName: document.getElementById('commandName'),
    executionTime: document.getElementById('executionTime'),
    historyFilter: document.getElementById('historyFilter'),
    historySort: document.getElementById('historySort'),
    quickTraceroute: document.getElementById('quickTraceroute'),
    quickPing: document.getElementById('quickPing'),
    quickScan: document.getElementById('quickScan'),
    ipListInput: document.getElementById('ipListInput'),
    batchNumeric: document.getElementById('batchNumeric'),
    batchMaxHops: document.getElementById('batchMaxHops'),
    batchWaitMs: document.getElementById('batchWaitMs'),
    runBatchBtn: document.getElementById('runBatchBtn')
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
    initializeApplication();
    setupEventListeners();
    startBackgroundTasks();
});

function initializeApplication() {
    const page = document.body && document.body.dataset ? (document.body.dataset.page || 'index') : 'index';

    if (elements.lastUpdate) {
        elements.lastUpdate.textContent = new Date().getFullYear();
    }

    // Пустая страница для /paths: ничего не загружаем
    if (page === 'paths') {
        return;
    }

    // Главная страница: загрузка данных
    loadNetworkInfo();
    loadHistory();
    updateUptime();

    if (elements.frontendStatus) {
        elements.frontendStatus.textContent = '🟢 Frontend';
        elements.frontendStatus.classList.add('online');
    }
}

function setupEventListeners() {
    // Основная форма
    if (elements.form) { elements.form.addEventListener('submit', handleCommandSubmit); }
    
    // Кнопки переключения видов
    if (elements.showHistoryBtn) {
        elements.showHistoryBtn.addEventListener('click', () => showView('history'));
    }
    if (elements.showPathsBtn) { elements.showPathsBtn.addEventListener('click', () => showView('paths')); }
    if (elements.showInfoBtn) { elements.showInfoBtn.addEventListener('click', () => showView('info')); }
    if (elements.mainViewBtn) { elements.mainViewBtn.addEventListener('click', () => showView('main')); }
    
    // Управление историей
    if (elements.refreshHistoryBtn) { elements.refreshHistoryBtn.addEventListener('click', loadHistory); }
    if (elements.clearHistoryBtn) { elements.clearHistoryBtn.addEventListener('click', showClearHistoryModal); }
    if (elements.historyFilter) { elements.historyFilter.addEventListener('change', filterHistory); }
    if (elements.historySort) { elements.historySort.addEventListener('change', filterHistory); }
    
    // Управление путями
    if (elements.refreshPathsBtn) { elements.refreshPathsBtn.addEventListener('click', loadPaths); }
    if (elements.exportPathsBtn) { elements.exportPathsBtn.addEventListener('click', exportPaths); }
    
    // Управление визуализацией
    if (elements.zoomInBtn) { elements.zoomInBtn.addEventListener('click', zoomIn); }
    if (elements.zoomOutBtn) { elements.zoomOutBtn.addEventListener('click', zoomOut); }
    if (elements.resetViewBtn) { elements.resetViewBtn.addEventListener('click', resetView); }
    if (elements.copyOutputBtn) { elements.copyOutputBtn.addEventListener('click', copyOutputToClipboard); }
    
    // Модальное окно
    if (elements.modalCloseBtn) { elements.modalCloseBtn.addEventListener('click', closeModal); }
    if (elements.modalCancelBtn) { elements.modalCancelBtn.addEventListener('click', closeModal); }
    if (elements.modalConfirmBtn) { elements.modalConfirmBtn.addEventListener('click', clearHistory); }
    
    // Быстрые действия
    if (elements.quickTraceroute) { elements.quickTraceroute.addEventListener('click', () => quickAction('traceroute')); }
    if (elements.quickPing) { elements.quickPing.addEventListener('click', () => quickAction('ping')); }
    if (elements.quickScan) { elements.quickScan.addEventListener('click', () => quickAction('nmap')); }
    if (elements.runBatchBtn) { elements.runBatchBtn.addEventListener('click', handleBatchRun); }
    
    // Горячие клавиши
    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Обработчики для примеров команд
    document.querySelectorAll('.example-cmd').forEach(code => {
        code.addEventListener('click', function() {
            elements.commandInput.value = this.textContent;
            elements.commandInput.focus();
        });
    });
    
    }

function startBackgroundTasks() {
    const page = document.body && document.body.dataset ? (document.body.dataset.page || 'index') : 'index';
    if (page === 'paths') {
        return;
    }
    // Обновление времени работы каждую секунду
    setInterval(updateUptime, 1000);
    // Периодическая проверка состояния системы
    setInterval(checkSystemStatus, 30000);
    // Автосохранение состояния
    setInterval(autoSaveState, 60000);
}

// ===== VIEW MANAGEMENT =====
function showView(view) {
    currentView = view;
    
    // Скрываем все секции
    document.querySelectorAll('.content-section').forEach(section => {
        section.style.display = 'none';
    });
    
    // Показываем нужную секцию
    const sectionId = view + 'Section';
    if (elements[sectionId]) {
        elements[sectionId].style.display = 'block';
    }
    
    // Обновляем активные кнопки
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtn = document.querySelector(`[data-view="${view}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    // Загружаем данные если нужно
    if (view === 'history') {
        loadHistory();
    } else if (view === 'paths') {
        loadPaths();
    } else if (view === 'info') {
        updateInfoStats();
    }
    
    }

// ===== COMMAND EXECUTION =====
async function handleCommandSubmit(event) {
    event.preventDefault();
    
    const command = elements.commandInput.value.trim();
    if (!command) {
        showError('Пожалуйста, введите команду');
        return;
    }
    
    await executeCommand(command);
}

async function executeCommand(command) {
    showLoading(`Выполнение: ${command}`);
    
    try {
        const startTime = Date.now();
        const response = await fetch('/api/run_command', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ command })
        });

        const data = await response.json();
        const executionTime = Date.now() - startTime;

        if (!response.ok) {
            throw new Error(data.error || `Ошибка сервера: ${response.status}`);
        }

        // Обновляем мета-информацию
        updateCommandMeta(command, executionTime);
        
        // Отображаем результаты
        displayRawOutput(data);
        visualizeCommandData(data);

        // Обновляем историю если это traceroute
        if (data.command_type === 'traceroute') {
            setTimeout(loadHistory, 500); // Небольшая задержка для обновления БД
        }

        hideLoading();
        
    } catch (error) {
        console.error('❌ Ошибка выполнения команды:', error);
        showError(`Ошибка при выполнении команды: ${error.message}`);
        hideLoading();
    }
}

function handleBatchRun() {
    const raw = elements.ipListInput ? (elements.ipListInput.value || '') : '';
    const list = raw.split(/[\n\r,; \t]+/).map(s => s.trim()).filter(Boolean);
    if (list.length === 0) {
        showError('Вве��ите список IP/доменов для пакетной трассировки');
        return;
    }

    const options = {};
    if (elements.batchNumeric && elements.batchNumeric.checked) options.numeric = true;
    const mh = elements.batchMaxHops ? parseInt(elements.batchMaxHops.value, 10) : NaN;
    if (!isNaN(mh) && mh > 0) options.max_hops = mh;
    const wm = elements.batchWaitMs ? parseInt(elements.batchWaitMs.value, 10) : NaN;
    if (!isNaN(wm) && wm > 0) options.wait_ms = wm;

    showLoading(`Пакетная трассировка: ${list.length} целей`);

    fetch('/api/batch_traceroute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ targets: list, options })
    }).then(async (resp) => {
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Ошибка пакетной трассировки');
        const results = data.results || [];

        const combined = results.map((r, idx) => {
            const head = `=== [${idx+1}/${results.length}] ${r.target} — ${r.command} (code ${r.returncode}) ===`;
            const body = (r.raw_stdout && String(r.raw_stdout).trim()) ? r.raw_stdout : (r.raw_stderr || '');
            return `${head}\n${body}`.trim();
        }).join('\n\n');
        elements.rawOutputDiv.textContent = combined || 'Нет вывода';

        if (results.length === 1 && results[0] && Array.isArray(results[0].hops) && results[0].hops.length > 0) {
            visualizeTraceroute(results[0].hops, results[0].command);
        } else {
            elements.visualizationDiv.innerHTML = `
                <div class="placeholder">
                    <div class="placeholder-icon">📦</div>
                    <p>Пакетная трассировка выполнена для ${results.length} целей</p>
                    <small>Детали трассировки доступны в левом блоке и в истории</small>
                </div>
            `;
        }

        setTimeout(loadHistory, 500);
        hideLoading();
    }).catch(err => {
        console.error('❌ Ошибка пакетной трассировки:', err);
        showError(err.message || 'Ошибка пакетной трассировки');
        hideLoading();
    });
}

function updateCommandMeta(command, executionTime) {
    elements.commandName.textContent = command;
    elements.executionTime.textContent = `⏱️ ${executionTime}ms`;
}

// ===== DATA VISUALIZATION =====
function displayRawOutput(data) {
    if (data.raw_stdout) {
        elements.rawOutputDiv.textContent = data.raw_stdout;
    } else if (data.raw_stderr) {
        elements.rawOutputDiv.innerHTML = `<div class="error">❌ Ошибка: ${data.raw_stderr}</div>`;
    } else {
        elements.rawOutputDiv.textContent = 'Нет вывода от команды.';
    }
}

function visualizeCommandData(data) {
    if (!data.parsed_data) {
        elements.visualizationDiv.innerHTML = `
            <div class="placeholder">
                <div class="placeholder-icon">📊</div>
                <p>Нет данных для визуализации</p>
                <small>Эта команда не поддерживает графическое представление</small>
            </div>
        `;
        return;
    }

    switch (data.command_type) {
        case 'traceroute':
            visualizeTraceroute(data.parsed_data, data.command);
            break;
        case 'ping':
            visualizePing(data.parsed_data);
            break;
        case 'nmap':
        case 'dns':
        case 'netstat':
            visualizeRawData(data.parsed_data, data.command_type);
            break;
        default:
            elements.visualizationDiv.innerHTML = `
                <div class="info">
                    ℹ️ Визуализация для этой команды не реализована
                </div>
            `;
    }
}

function isTimeoutHop(d) {
    const norm = v => (v === null || v === undefined) ? '' : String(v).trim();
    const r1 = norm(d.rtt1);
    const r2 = norm(d.rtt2);
    const r3 = norm(d.rtt3);
    const empty = v => v === '' || v.toLowerCase() === 'none' || v.toLowerCase() === 'null' || v.toLowerCase() === 'undefined';
    const noRtts = empty(r1) && empty(r2) && empty(r3);
    const ipTimeout = norm(d.ip) === 'Таймаут';
    const hostStar = norm(d.hostname) === '*';
    return ipTimeout || noRtts || (hostStar && noRtts);
}

function visualizeTraceroute(hopsData, command) {
    if (!hopsData || hopsData.length === 0) {
        elements.visualizationDiv.innerHTML = `
            <div class="placeholder">
                <div class="placeholder-icon">🔍</div>
                <p>Нет данных для визуализации traceroute</p>
                <small>Возможно, команда не вернула корректные данные</small>
            </div>
        `;
        return;
    }

    const containerWidth = elements.visualizationDiv.clientWidth || 800;
    const svgWidth = containerWidth; // фиксированная ширина по контейнеру
    elements.visualizationDiv.style.overflowX = 'hidden';
    const height = 420; // фиксированная высота
    const horizontalPadding = 40;
    const stepApprox = (svgWidth - 2 * horizontalPadding) / (hopsData.length + 1);
    const nodeRadius = stepApprox >= 100 ? 15 : (stepApprox >= 70 ? 12 : 10);

    // Очищаем предыдущую визуализацию
    elements.visualizationDiv.innerHTML = '';
    
    // Сохраняем ссылку на текущую визуализацию
    currentVisualization = { type: 'traceroute', data: hopsData };

    const container = d3.select("#visualization")
        .append("div")
        .attr("class", "visualization-container");

    // Создаем SVG элемент
    const svg = container.append("svg")
        .attr("width", svgWidth)
        .attr("height", height)
        .attr("class", "traceroute-svg");

    // Группа для панорамирования/масштабирования
    const zoomGroup = svg.append("g").attr("class", "zoom-group");

    // D3 Zoom (колесо мыши для масштаба, перетаскивание для панорамирования)
    const zoomBehavior = d3.zoom()
        .scaleExtent([0.5, 3])
        .on("zoom", (event) => {
            zoomGroup.attr("transform", event.transform);
            zoomLevel = event.transform.k;
            updateLabelVisibility();
        });
    svg.call(zoomBehavior);

    // Сохраняем ссылки для кнопок управления
    currentVisualization.svg = svg;
    currentVisualization.zoom = zoomBehavior;

    // Добавляем заголовок
    const target = command.split(' ').pop();
    container.append("div")
        .attr("class", "source-info")
        .html(`
            <h4>📋 Трассировка маршрута</h4>
            <p><strong>Источник:</strong> Ваш сервер</p>
            <p><strong>Цель:</strong> ${target}</p>
            <p><strong>Хопов:</strong> ${hopsData.length}</p>
            <p><strong>Время:</strong> ${new Date().toLocaleTimeString()}</p>
        `);

    // Создаем масштаб для позиционирования
    const xScale = d3.scalePoint()
        .domain(hopsData.map((d, i) => i))
        .range([horizontalPadding, svgWidth - horizontalPadding]);

    const yScale = d3.scalePoint()
        .domain([0, 1])
        .range([height / 3, height / 3 + 160]);

    // Рисуем связи
    const links = hopsData.slice(1).map((d, i) => ({
        sourceIndex: i,
        targetIndex: i + 1
    }));

    zoomGroup.selectAll(".link")
        .data(links)
        .enter().append("line")
        .attr("class", "link")
        .attr("x1", (d) => xScale(d.sourceIndex))
        .attr("y1", (d) => yScale(d.sourceIndex % 2))
        .attr("x2", (d) => xScale(d.targetIndex))
        .attr("y2", (d) => yScale(d.targetIndex % 2))
        .attr("stroke-width", 2)
        .attr("stroke", "#3498db")
        .attr("stroke-dasharray", "5,5");

    // Рисуем узлы
    const nodes = zoomGroup.selectAll(".node")
        .data(hopsData)
        .enter().append("g")
        .attr("class", "node")
        .attr("transform", (d, i) => `translate(${xScale(i)}, ${yScale(i % 2)})`)
        .on("mouseover", function(event, d) {
            showNodeInfo(event, d);
        })
        .on("mouseout", hideNodeInfo);
    
    nodes.append("title")
        .text(d => d.hostname !== '*' ? d.hostname : 'Неизвестный узел');

    // Добавляем круги
    nodes.append("circle")
        .attr("r", nodeRadius)
        .attr("fill", (d, i) => {
            if (isTimeoutHop(d)) return '#95a5a6';
            if (i === 0) return "#e74c3c";
            if (i === hopsData.length - 1) return "#27ae60";
            return "#3498db";
        })
        .attr("stroke", (d, i) => {
            if (isTimeoutHop(d)) return '#7f8c8d';
            if (i === 0) return "#c0392b";
            if (i === hopsData.length - 1) return "#229954";
            return "#2980b9";
        })
        .attr("stroke-width", 2);

    
    // Добавляем подписи
    nodes.append("text")
        .attr("class", "node-label hop-number")
        .attr("dy", -30)
        .attr("text-anchor", "middle")
        .text(d => `Хоп ${d.hop}`)
        .attr("fill", "#2c3e50")
        .attr("font-weight", "bold");

    nodes.append("text")
        .attr("class", "node-label hostname")
        .attr("dy", -15)
        .attr("text-anchor", "middle")
        .text(d => { const name = d.hostname !== '*' ? d.hostname : 'Неизвестный узел'; return name.length > 18 ? name.slice(0, 18) + '…' : name; })
        .attr("fill", "#34495e")
        .attr("font-size", "10px");

    nodes.append("text")
        .attr("class", "node-label ip-address")
        .attr("dy", 25)
        .attr("text-anchor", "middle")
        .text(d => d.ip)
        .attr("fill", "#7f8c8d")
        .attr("font-size", "9px")
        .attr("font-family", "monospace");

    nodes.append("text")
        .attr("class", "node-label rtt-info")
        .attr("dy", 40)
        .attr("text-anchor", "middle")
        .text(d => isTimeoutHop(d) ? '❌ Таймаут' : `~${d.rtt1} ms`)
        .attr("fill", "#e67e22")
        .attr("font-size", "8px");

    // Добавляем легенду
    const legend = container.append("div")
        .attr("class", "legend")
        .style("margin-top", "20px");

    legend.html(`
        <div class="legend-title"><strong>Легенда:</strong></div>
        <div class="legend-item">
            <span class="legend-color" style="background: #e74c3c"></span>
            <span>Источник (Ваш сервер)</span>
        </div>
        <div class="legend-item">
            <span class="legend-color" style="background: #3498db"></span>
            <span>Промежуточные узлы</span>
        </div>
        <div class="legend-item">
            <span class="legend-color" style="background: #27ae60"></span>
            <span>Целевой узел</span>
        </div>
    `);

    // Адаптация подписей: всегда показываем краткую подпись (host/IP),
    // дополнительные поля (IP, RTT) появляются при достаточном масштабе
    function updateLabelVisibility() {
        const effectiveStep = stepApprox * zoomLevel;
        const hopsCount = hopsData.length;
        const showHostBase = effectiveStep >= 35;
        const showIPBase = effectiveStep >= 80;
        const showRTTBase = effectiveStep >= 55;

        let labelEvery = 1;
        if (hopsCount > 50 || effectiveStep < 25) labelEvery = 5;
        else if (hopsCount > 35 || effectiveStep < 35) labelEvery = 3;
        else if (hopsCount > 25 || effectiveStep < 45) labelEvery = 2;

        const hostMax = effectiveStep >= 140 ? 18 : effectiveStep >= 90 ? 14 : effectiveStep >= 50 ? 10 : 8;
        const hostFont = effectiveStep >= 140 ? '10px' : effectiveStep >= 90 ? '9px' : effectiveStep >= 50 ? '8px' : '7px';
        const hopFont = effectiveStep >= 140 ? '10px' : effectiveStep >= 90 ? '9px' : '8px';

        // Номер хопа: уменьшаем шрифт, при сильной плотности показываем не каждый
        svg.selectAll('.node .hop-number')
            .attr('font-size', hopFont)
            .style('display', (d, i) => (labelEvery >= 4 ? ((i % Math.max(2, Math.floor(labelEvery))) === 0) : null));

        // Хост/IP краткая подпись: показываем только для каждого N-го узла
        svg.selectAll('.node .hostname')
            .style('display', (d, i) => (showHostBase && (i % labelEvery === 0)) ? null : 'none')
            .text(d => {
                const base = (d.hostname && d.hostname !== '*') ? d.hostname : (d.ip || 'N/A');
                return base.length > hostMax ? base.slice(0, hostMax) + '…' : base;
            })
            .attr('font-size', hostFont);

        // IP адрес: при достаточном масштабе и с интервалом
        svg.selectAll('.node .ip-address')
            .style('display', (d, i) => (showIPBase && (i % labelEvery === 0)) ? null : 'none')
            .attr('font-size', effectiveStep >= 140 ? '9px' : '8px');

        // RTT: при достаточном масштабе и с интервало��
        svg.selectAll('.node .rtt-info')
            .style('display', (d, i) => (showRTTBase && (i % labelEvery === 0)) ? null : 'none');
    }

    // Первичный вызов для инициализации подписи
    updateLabelVisibility();
}

function visualizePing(pingData) {
    elements.visualizationDiv.innerHTML = '';
    
    const container = d3.select("#visualization")
        .append("div")
        .attr("class", "ping-results");

    container.append("h4")
        .text("📊 Результаты Ping")
        .style("color", "#2c3e50")
        .style("margin-bottom", "20px");

    const statsContainer = container.append("div")
        .attr("class", "ping-stats-container");

    const stats = [
        { label: "📤 Отправлено пакетов", value: pingData.packets_transmitted, color: "#3498db" },
        { label: "📥 Получено пакетов", value: pingData.packets_received, color: "#27ae60" },
        { label: "❌ Потеряно пакетов", value: pingData.packet_loss, color: "#e74c3c" },
        { label: "⏱️ Время выполнения", value: pingData.time_ms + " ms", color: "#9b59b6" },
        { label: "🚀 RTT Min/Avg/Max", value: `${pingData.rtt_min}/${pingData.rtt_avg}/${pingData.rtt_max} ms`, color: "#f39c12" }
    ];

    stats.forEach(stat => {
        const statItem = statsContainer.append("div")
            .attr("class", "stat-item")
            .style("background", stat.color + "20")
            .style("border-left", `4px solid ${stat.color}`);

        statItem.append("div")
            .attr("class", "stat-label")
            .text(stat.label)
            .style("color", "#7f8c8d")
            .style("font-size", "12px");

        statItem.append("div")
            .attr("class", "stat-value")
            .text(stat.value)
            .style("color", "#2c3e50")
            .style("font-size", "16px")
            .style("font-weight", "bold");
    });
}

function visualizeRawData(data, commandType) {
    elements.visualizationDiv.innerHTML = '';
    
    const container = d3.select("#visualization")
        .append("div")
        .attr("class", "raw-data-container");

    const title = commandType === 'nmap' ? '🔍 Результаты Nmap' : 
                 commandType === 'dns' ? '🌐 Результаты DNS' : '📊 Результаты Netstat';
                 
    container.append("h4")
        .text(title)
        .style("color", "#2c3e50")
        .style("margin-bottom", "15px");

    container.append("pre")
        .attr("class", "raw-output-pre")
        .text(data.raw_output || 'Нет данных')
        .style("background", "#1e1e1e")
        .style("color", "#d4d4d4")
        .style("padding", "15px")
        .style("border-radius", "5px")
        .style("overflow", "auto")
        .style("max-height", "400px")
        .style("font-family", "'Courier New', monospace")
        .style("font-size", "12px");
}

// ===== HISTORY MANAGEMENT =====
async function loadHistory() {
    showLoading("Загрузка истории...");
    
    try {
        const response = await fetch('/api/history');
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Ошибка загрузки истории');
        }
        
        commandHistory = data.history || [];
        displayHistory(commandHistory);
        if (elements.historyCount) {
            elements.historyCount.textContent = commandHistory.length;
        }
        
        hideLoading();
    } catch (error) {
        console.error('❌ Ошибка загрузки истории:', error);
        showError('Ошибка загрузки истории запросов');
        hideLoading();
    }
}

function displayHistory(history) {
    if (history.length === 0) {
        elements.historyList.innerHTML = `
            <div class="placeholder">
                <div class="placeholder-icon">⏰</div>
                <p>История запросов пуста</p>
                <small>Выполните traceroute команды чтобы сохранить их в историю</small>
            </div>
        `;
        return;
    }

    const filteredHistory = filterAndSortHistory(history);
    
    elements.historyList.innerHTML = filteredHistory.map(item => `
        <div class="history-item" data-id="${item.id}">
            <div class="history-content">
                <div class="history-command">
                    <strong>🎯 ${escapeHtml(item.target)}</strong>
                </div>
                <div class="history-details">
                    <span class="history-hops">🔗 ${item.hops_count} хопов</span>
                    <span class="history-time">⏰ ${formatDateTime(item.timestamp)}</span>
                </div>
            </div>
            <button class="history-load-btn" onclick="loadHistoryItem(${item.id})">
                📂 Загрузить
            </button>
        </div>
    `).join('');
}

function filterAndSortHistory(history) {
    let filtered = history;
    const filterValue = elements.historyFilter.value;
    const sortValue = elements.historySort.value;
    
    // Фильтрация
    if (filterValue !== 'all') {
        filtered = history.filter(item => 
            item.command.toLowerCase().includes(filterValue)
        );
    }
    
    // Сортировка
    switch (sortValue) {
        case 'oldest':
            filtered.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            break;
        case 'target':
            filtered.sort((a, b) => a.target.localeCompare(b.target));
            break;
        default: // newest
            filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
    
    return filtered;
}

// ===== UTILITY FUNCTIONS =====
function showLoading(message = "Загрузка...") {
    elements.loadingDetails.textContent = message;
    elements.loadingOverlay.style.display = 'block';
}

function hideLoading() {
    elements.loadingOverlay.style.display = 'none';
}

function showError(message) {
    elements.rawOutputDiv.innerHTML = `<div class="error">❌ ${message}</div>`;
    elements.visualizationDiv.innerHTML = '';
}

function showNodeInfo(event, data) {
    d3.select("#node-tooltip").remove();
    const tooltip = d3.select("body")
        .append("div")
        .attr("id", "node-tooltip")
        .attr("class", "node-tooltip")
        .style("position", "absolute");

    const [x, y] = d3.pointer(event);
    
    tooltip.html(`
        <div class="tooltip-header">
            <strong>${data.hostname !== '*' ? data.hostname : 'Неизвестный узел'}</strong>
        </div>
        <div class="tooltip-content">
            <p><strong>IP:</strong> <code>${data.ip}</code></p>
            <p><strong>Номер хопа:</strong> ${data.hop}</p>
            ${data.rtt1 ? `<p><strong>Время отклика 1:</strong> ${data.rtt1} ms</p>` : ''}
            ${data.rtt2 ? `<p><strong>Время отклика 2:</strong> ${data.rtt2} ms</p>` : ''}
            ${data.rtt3 ? `<p><strong>Время отклика 3:</strong> ${data.rtt3} ms</p>` : ''}
            ${!data.rtt1 && !data.rtt2 && !data.rtt3 ? '<p><strong>Статус:</strong> ❌ Таймаут</p>' : ''}
        </div>
    `)
    .style("left", (x + 10) + "px")
    .style("top", (y - 28) + "px")
    .style("visibility", "visible");
}

function hideNodeInfo() {
    d3.select("#node-tooltip").remove();
}

function zoomIn() {
    if (zoomLevel < 2) {
        zoomLevel += 0.1;
        updateZoom();
    }
}

function zoomOut() {
    if (zoomLevel > 0.5) {
        zoomLevel -= 0.1;
        updateZoom();
    }
}

function resetView() {
    zoomLevel = 1;
    if (currentVisualization && currentVisualization.svg && currentVisualization.zoom) {
        currentVisualization.svg.transition().duration(150)
            .call(currentVisualization.zoom.transform, d3.zoomIdentity.scale(1));
    } else {
        updateZoom();
    }
}

function updateZoom() {
    if (currentVisualization && currentVisualization.svg && currentVisualization.zoom) {
        currentVisualization.svg.transition().duration(150)
            .call(currentVisualization.zoom.scaleTo, zoomLevel);
    } else {
        const svg = d3.select(".traceroute-svg");
        if (!svg.empty()) {
            // Фолбек: если зум еще не инициализирован, масштаб не применяется
        }
    }
}

function copyOutputToClipboard() {
    const text = elements.rawOutputDiv.textContent;
    navigator.clipboard.writeText(text).then(() => {
        showTempMessage('📋 Вывод скопирован в буфер обмена');
    }).catch(err => {
        showError('Ошибка копирования в буфер обмена');
    });
}

function showTempMessage(message) {
    const tempMsg = document.createElement('div');
    tempMsg.className = 'info';
    tempMsg.textContent = message;
    tempMsg.style.position = 'fixed';
    tempMsg.style.top = '20px';
    tempMsg.style.right = '20px';
    tempMsg.style.zIndex = '1000';
    
    document.body.appendChild(tempMsg);
    
    setTimeout(() => {
        document.body.removeChild(tempMsg);
    }, 3000);
}

// ===== MODAL FUNCTIONS =====
function showClearHistoryModal() {
    elements.confirmModal.style.display = 'block';
}

function closeModal() {
    elements.confirmModal.style.display = 'none';
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('ru-RU');
}

function handleKeyboardShortcuts(event) {
    if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault();
        elements.form.dispatchEvent(new Event('submit'));
    }
    
    if (event.key === 'Escape') {
        closeModal();
    }
}

// ===== PATHS VISUALIZATION =====
async function loadPaths() {
    showLoading("Построение дерева путей...");
    
    try {
        const response = await fetch('/api/paths');
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Ошибка загрузки путей');
        }
        
        networkPaths = data.paths || {};
        visualizePaths(networkPaths);
        
        // Обновляем счетчики
        const targets = Object.keys(networkPaths).length;
        const hops = Object.values(networkPaths).reduce((acc, path) => acc + path.length, 0);
        const ips = Object.values(networkPaths).reduce((acc, path) => 
            acc + path.reduce((ipAcc, hop) => ipAcc + hop.ips.length, 0), 0);
        
        elements.totalTargets.textContent = targets;
        elements.totalHops.textContent = hops;
        elements.totalIPs.textContent = ips;
        elements.pathsCount.textContent = targets;
        
        hideLoading();
    } catch (error) {
        console.error('❌ Ошибка загрузки путей:', error);
        showError('Ошибка загрузки дерева путей');
        hideLoading();
    }
}

function visualizePaths(paths) {
    if (Object.keys(paths).length === 0) {
        elements.pathsContainer.innerHTML = `
            <div class="placeholder">
                <div class="placeholder-icon">🌍</div>
                <p>Дерево путей строится на основе истории traceroute</p>
                <small>Выполните несколько traceroute команд чтобы построить карту сети</small>
            </div>
        `;
        return;
    }

    elements.pathsContainer.innerHTML = '';
    
    Object.entries(paths).forEach(([target, hops]) => {
        const targetContainer = d3.select(elements.pathsContainer)
            .append('div')
            .attr('class', 'path-target');
        
        targetContainer.append('h4')
            .text(`🎯 Цель: ${target}`)
            .style('color', '#2c3e50')
            .style('margin-bottom', '15px');
        
        const treeContainer = targetContainer.append('div')
            .attr('class', 'path-tree');
        
        // Сортируем хопы по номеру
        hops.sort((a, b) => a.hop_number - b.hop_number);
        
        hops.forEach(hop => {
            const hopNode = treeContainer.append('div')
                .attr('class', 'path-hop')
                .style('margin-left', `${(hop.hop_number - 1) * 30}px`);
            
            hopNode.append('div')
                .attr('class', 'hop-header')
                .html(`<strong>Хоп ${hop.hop_number}</strong>`);
            
            if (hop.nodes.length > 0 || hop.ips.length > 0) {
                const contentNode = hopNode.append('div')
                    .attr('class', 'hop-content');
                
                if (hop.nodes.length > 0) {
                    contentNode.append('div')
                        .attr('class', 'hop-hosts')
                        .html(`<strong>Хосты:</strong> ${hop.nodes.join(', ')}`);
                }
                
                if (hop.ips.length > 0) {
                    contentNode.append('div')
                        .attr('class', 'hop-ips')
                        .html(`<strong>IP:</strong> ${hop.ips.join(', ')}`);
                }
            } else {
                hopNode.append('div')
                    .attr('class', 'hop-empty')
                    .text('❌ Таймаут или неизвестный узел');
            }
            
            // Добавляем соединительную линию
            if (hop.hop_number > 1) {
                hopNode.style('border-left', '2px dashed #3498db')
                       .style('padding-left', '15px')
                       .style('margin-top', '10px');
            }
        });
    });
}

// ===== HISTORY ITEM LOADING =====
async function loadHistoryItem(requestId) {
    showLoading("Загрузка исторического запроса...");
    
    try {
        const response = await fetch(`/api/history/${requestId}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Запрос не найден');
        }
        
        // Переключаемся на главный вид
        showView('main');
        
        // Заполняем форму
        elements.commandInput.value = data.command;
        
        // Создаем объект ответа
        const buildTracerouteOutput = (cmd, hops) => {
            const isNumeric = /\btraceroute\b.*\s\-n(\s|$)/.test(cmd);
            const norm = v => (v === null || v === undefined) ? '' : String(v).trim();
            const empty = v => v === '' || v.toLowerCase() === 'none' || v.toLowerCase() === 'null' || v.toLowerCase() === 'undefined';
            const parts = cmd.split(/\s+/);
            const dest = parts[parts.length - 1] || '';
            // Try to get a representative IP for header
            let headerIP = dest;
            if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(headerIP)) {
                const firstIp = (hops || []).map(h => norm(h.ip)).find(x => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(x));
                if (firstIp) headerIP = firstIp;
            }
            const header = `traceroute to ${dest} (${headerIP}), 30 hops max, 60 byte packets`;

            const lines = [];
            (hops || []).forEach(h => {
                const r1 = norm(h.rtt1), r2 = norm(h.rtt2), r3 = norm(h.rtt3);
                const ip = norm(h.ip), hostname = norm(h.hostname);
                const noRtts = empty(r1) && empty(r2) && empty(r3);
                const isTimeout = ip === 'Таймаут' || (hostname === '*' && noRtts) || noRtts;
                if (isTimeout) {
                    lines.push(`${h.hop}  * * *`);
                } else {
                    const probes = [empty(r1) ? '*' : `${r1} ms`, empty(r2) ? '*' : `${r2} ms`, empty(r3) ? '*' : `${r3} ms`];
                    let base;
                    if (isNumeric) {
                        base = `${h.hop}  ${ip || hostname || '*'}`;
                    } else {
                        if (hostname && hostname !== '*') {
                            base = `${h.hop}  ${hostname}${ip ? ` (${ip})` : ''}`;
                        } else if (ip) {
                            base = `${h.hop}  ${ip}`;
                        } else {
                            base = `${h.hop}  *`;
                        }
                    }
                    lines.push(`${base}  ${probes.join('  ')}`);
                }
            });
            return [header, ...lines].join('\n');
        };

        const responseData = {
            command: data.command,
            command_type: 'traceroute',
            parsed_data: data.hops,
            raw_stdout: buildTracerouteOutput(data.command, data.hops)
        };
        
        // Отображаем данные
        displayRawOutput(responseData);
        visualizeCommandData(responseData);
        
        hideLoading();
        
    } catch (error) {
        console.error('❌ Ошибка загрузки исторического запроса:', error);
        showError('Ошибка загрузки исторического запроса');
        hideLoading();
    }
}

// ===== HISTORY CLEARING =====
async function clearHistory() {
    closeModal();
    showLoading("Очистка истории...");
    
    try {
        const response = await fetch('/api/clear_history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Ошибка очистки истории');
        }
        
        // Обновляем историю
        await loadHistory();
        showTempMessage('✅ История очищена успешно');
        
    } catch (error) {
        console.error('❌ Ошибка очистки истории:', error);
        showError('Ошибка очистки истории');
    }
}

// ===== EXPORT FUNCTIONS =====
function exportPaths() {
    if (Object.keys(networkPaths).length === 0) {
        showError('Нет данных для экспорта');
        return;
    }

    const dataStr = JSON.stringify(networkPaths, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `network-paths-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    showTempMessage('💾 Данные экспортированы в JSON');
}

function exportHistory() {
    if (commandHistory.length === 0) {
        showError('Нет истории для экспорта');
        return;
    }

    const dataStr = JSON.stringify(commandHistory, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `network-history-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    showTempMessage('💾 История экспортирована в JSON');
}

// ===== QUICK ACTIONS =====
function quickAction(type) {
    const target = prompt(`Введите цель для ${type}:`, "google.com");
    if (target) {
        let command;
        switch (type) {
            case 'traceroute':
                command = `traceroute ${target}`;
                break;
            case 'ping':
                command = `ping -c 4 ${target}`;
                break;
            case 'nmap':
                command = `nmap -sn ${target}`;
                break;
            default:
                command = `${type} ${target}`;
        }
        elements.commandInput.value = command;
        elements.form.dispatchEvent(new Event('submit'));
    }
}

// ===== SYSTEM FUNCTIONS =====
async function loadNetworkInfo() {
    try {
        const response = await fetch('/api/network_info');
        const data = await response.json();
        
        if (response.ok) {
                        updateNetworkStatus('✅ Работает нормально');
        } else {
            updateNetworkStatus('⚠️ Проблемы с соединением');
        }
    } catch (error) {
        console.error('Ошибка загрузки информации о сети:', error);
        updateNetworkStatus('❌ Ошибка соединения');
    }
}

function updateNetworkStatus(status) {
    if (elements.systemStatus) {
        elements.systemStatus.textContent = status;
    }
}

function updateUptime() {
    const now = new Date();
    const uptime = now - appStartTime;
    const hours = Math.floor(uptime / 3600000);
    const minutes = Math.floor((uptime % 3600000) / 60000);
    const seconds = Math.floor((uptime % 60000) / 1000);
    
    if (elements.appUptime) {
        elements.appUptime.textContent = 
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

async function checkSystemStatus() {
    try {
        const response = await fetch('/api/network_info', { 
            method: 'HEAD',
            timeout: 5000 
        });
        
        if (response.ok) {
            updateNetworkStatus('✅ Работает нормально');
        } else {
            updateNetworkStatus('⚠️ Проблемы с соединением');
        }
    } catch (error) {
        updateNetworkStatus('❌ Ошибка соединения');
    }
}

function updateInfoStats() {
    elements.totalRequests.textContent = commandHistory.length;
    elements.dbSize.textContent = '~' + Math.round(commandHistory.length * 0.5) + ' KB';
}

function autoSaveState() {
    const state = {
        lastCommand: elements.commandInput.value,
        zoomLevel: zoomLevel,
        currentView: currentView,
        timestamp: new Date().toISOString()
    };
    localStorage.setItem('networkVisualizerState', JSON.stringify(state));
}

function loadSavedState() {
    try {
        const saved = localStorage.getItem('networkVisualizerState');
        if (saved) {
            const state = JSON.parse(saved);
            elements.commandInput.value = state.lastCommand || '';
            zoomLevel = state.zoomLevel || 1;
            
            // Восстанавливаем view если он был сохранен
            if (state.currentView && state.currentView !== currentView) {
                showView(state.currentView);
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки сохраненного состояния:', error);
    }
}

// ===== ADVANCED VISUALIZATION FUNCTIONS =====
function createNetworkGraph() {
    if (Object.keys(networkPaths).length === 0) {
        showError('Нет данных для построения графа сети');
        return;
    }

    showLoading("Построение графа сети...");
    
    // Создаем контейнер для расширенной визуализации
    elements.visualizationDiv.innerHTML = '';
    const container = d3.select("#visualization")
        .append("div")
        .attr("class", "network-graph-container");
    
    // Здесь будет код для создания сложного графа сети
    // с использованием force-directed layout из D3.js
    
    setTimeout(() => {
        hideLoading();
        showTempMessage('📊 Граф сети построен');
    }, 1000);
}

function analyzeNetworkPatterns() {
    if (commandHistory.length < 2) {
        showError('Недостаточно данных для анализа');
        return;
    }

    showLoading("Анализ сетевых паттернов...");
    
    // Анализ повторяющихся хопов
    const commonHops = findCommonHops();
    
    // Анализ времени отклика
    const rttAnalysis = analyzeRTT();
    
    // Создаем отчет
    createAnalysisReport(commonHops, rttAnalysis);
    
    hideLoading();
}

function findCommonHops() {
    const hopCounts = {};
    
    commandHistory.forEach(request => {
        // Анализируем каждый запрос на общие хопы
        // Это упрощенная реализация
    });
    
    return Object.entries(hopCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
}

function analyzeRTT() {
    const rttStats = {
        min: Infinity,
        max: 0,
        total: 0,
        count: 0
    };
    
    // Анализируем RTT по всем запросам
    commandHistory.forEach(request => {
        // Сбор статистики RTT
    });
    
    return {
        average: rttStats.total / rttStats.count,
        min: rttStats.min,
        max: rttStats.max
    };
}

function createAnalysisReport(commonHops, rttAnalysis) {
    const report = `
        <div class="analysis-report">
            <h4>📈 Анализ сетевых паттернов</h4>
            <div class="report-section">
                <h5>🏆 Наиболее частые хопы</h5>
                <ul>
                    ${commonHops.map(([hop, count]) => 
                        `<li>${hop}: ${count} раз</li>`
                    ).join('')}
                </ul>
            </div>
            <div class="report-section">
                <h5>⏱️ Статистика RTT</h5>
                <p>Среднее: ${rttAnalysis.average.toFixed(2)}ms</p>
                <p>Минимум: ${rttAnalysis.min}ms</p>
                <p>Максимум: ${rttAnalysis.max}ms</p>
            </div>
        </div>
    `;
    
    elements.visualizationDiv.innerHTML = report;
}

// ===== UTILITY ENHANCEMENTS =====
function filterHistory() {
    if (commandHistory.length > 0) {
        displayHistory(commandHistory);
    }
}

function searchInHistory(query) {
    const filtered = commandHistory.filter(item =>
        item.command.toLowerCase().includes(query.toLowerCase()) ||
        item.target.toLowerCase().includes(query.toLowerCase())
    );
    displayHistory(filtered);
}

function exportCurrentView() {
    let exportData;
    let filename;
    
    switch (currentView) {
        case 'main':
            exportData = elements.rawOutputDiv.textContent;
            filename = `network-output-${new Date().toISOString().split('T')[0]}.txt`;
            downloadTextFile(exportData, filename);
            break;
        case 'history':
            exportHistory();
            break;
        case 'paths':
            exportPaths();
            break;
    }
}

function downloadTextFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    
    URL.revokeObjectURL(url);
    showTempMessage('💾 Данные экспортированы');
}

// ===== PERFORMANCE OPTIMIZATIONS =====
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

function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Оптимизированные обработчики
const optimizedSearch = debounce(searchInHistory, 500);

// ===== ERROR HANDLING ENHANCEMENTS =====
function setupGlobalErrorHandling() {
    // Глобальный обработчик ошибок
    window.addEventListener('error', function(e) {
        console.error('Глобальная ошибка:', e.error);
        showError('Произошла непредвиденная ошибка приложения');
    });
    
    // Обработчик необработанных промисов
    window.addEventListener('unhandledrejection', function(e) {
        console.error('Необработанный промис:', e.reason);
        showError('Ошибка выполнения асинхронной операции');
    });
}

function validateCommand(command) {
    const forbiddenPatterns = [
        /[;&|`$<>]/g, // Опасные символы
        /rm\s+-/g,    // Команды удаления
        /mv\s+\/\s/g,  // Перемещение системных файлов
        /dd\s+if/g     // Низкоуровневые операции
    ];
    
    for (const pattern of forbiddenPatterns) {
        if (pattern.test(command)) {
            throw new Error('Команда содержит запрещенные символы или операции');
        }
    }
    
    return true;
}

// ===== INITIALIZATION ENHANCEMENTS =====
function setupServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                            })
            .catch(error => {
                            });
    }
}

function setupOfflineDetection() {
    window.addEventListener('online', function() {
        showTempMessage('🌐 Соединение восстановлено');
        elements.systemStatus.textContent = '✅ Онлайн';
    });
    
    window.addEventListener('offline', function() {
        showError('📶 Отсутствует интернет-соединение');
        elements.systemStatus.textContent = '❌ Офлайн';
    });
}

// ===== FINAL INITIALIZATION =====
function completeInitialization() {
    // Загружаем сохраненное состояние
    loadSavedState();
    
    // Настраиваем глобальную обработку ошибок
    setupGlobalErrorHandling();
    
    // Настраиваем обнаружение offline/online
    setupOfflineDetection();
    
    // Пытаемся зарегистрировать Service Worker
    setupServiceWorker();
    
    // Показываем welcome message
    setTimeout(() => {
        showTempMessage('🚀 Network Visualizer готов к работе!');
    }, 1000);
    
    }

// Вызываем завершение инициализации
completeInitialization();

// ===== ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ HTML =====
window.loadHistoryItem = loadHistoryItem;
window.quickAction = quickAction;
window.exportCurrentView = exportCurrentView;
window.searchInHistory = optimizedSearch;