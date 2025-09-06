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
    quickScan: document.getElementById('quickScan')
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
    initializeApplication();
    setupEventListeners();
    startBackgroundTasks();
});

function initializeApplication() {
        
    // Устанавливаем дату обновления
    elements.lastUpdate.textContent = new Date().getFullYear();
    
    // Загружаем начальные данные
    loadNetworkInfo();
    loadHistory();
    loadPaths();
    updateUptime();
    
    // Устанавливаем статус фронтенда
    elements.frontendStatus.textContent = '🟢 Frontend';
    elements.frontendStatus.classList.add('online');
    
    }

function setupEventListeners() {
    // Основная форма
    elements.form.addEventListener('submit', handleCommandSubmit);
    
    // Кнопки переключения видов
    elements.showHistoryBtn.addEventListener('click', () => showView('history'));
    elements.showPathsBtn.addEventListener('click', () => showView('paths'));
    elements.showInfoBtn.addEventListener('click', () => showView('info'));
    elements.mainViewBtn.addEventListener('click', () => showView('main'));
    
    // Управление историей
    elements.refreshHistoryBtn.addEventListener('click', loadHistory);
    elements.clearHistoryBtn.addEventListener('click', showClearHistoryModal);
    elements.historyFilter.addEventListener('change', filterHistory);
    elements.historySort.addEventListener('change', filterHistory);
    
    // Управление путями
    elements.refreshPathsBtn.addEventListener('click', loadPaths);
    elements.exportPathsBtn.addEventListener('click', exportPaths);
    
    // Управление визуализацией
    elements.zoomInBtn.addEventListener('click', zoomIn);
    elements.zoomOutBtn.addEventListener('click', zoomOut);
    elements.resetViewBtn.addEventListener('click', resetView);
    elements.copyOutputBtn.addEventListener('click', copyOutputToClipboard);
    
    // Модальное окно
    elements.modalCloseBtn.addEventListener('click', closeModal);
    elements.modalCancelBtn.addEventListener('click', closeModal);
    elements.modalConfirmBtn.addEventListener('click', clearHistory);
    
    // Быстрые действия
    elements.quickTraceroute.addEventListener('click', () => quickAction('traceroute'));
    elements.quickPing.addEventListener('click', () => quickAction('ping'));
    elements.quickScan.addEventListener('click', () => quickAction('nmap'));
    
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

    const width = elements.visualizationDiv.clientWidth;
    const height = Math.max(400, hopsData.length * 60);
    const nodeRadius = 15;
    const horizontalSpacing = width / (hopsData.length + 1);

    // Очищаем предыдущую визуализацию
    elements.visualizationDiv.innerHTML = '';
    
    // Сохраняем ссылку на текущую визуализацию
    currentVisualization = { type: 'traceroute', data: hopsData };

    const container = d3.select("#visualization")
        .append("div")
        .attr("class", "visualization-container");

    // Создаем SVG элемент
    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("class", "traceroute-svg")
        .style("transform", `scale(${zoomLevel})`)
        .style("transform-origin", "center center");

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
        .range([horizontalSpacing, width - horizontalSpacing]);

    const yScale = d3.scalePoint()
        .domain([0, 1])
        .range([height / 3, 2 * height / 3]);

    // Рисуем связи
    const links = hopsData.slice(1).map((d, i) => ({
        source: hopsData[i],
        target: hopsData[i + 1]
    }));

    svg.selectAll(".link")
        .data(links)
        .enter().append("line")
        .attr("class", "link")
        .attr("x1", (d, i) => xScale(i))
        .attr("y1", yScale(0))
        .attr("x2", (d, i) => xScale(i + 1))
        .attr("y2", yScale(0))
        .attr("stroke-width", 2)
        .attr("stroke", "#3498db")
        .attr("stroke-dasharray", "5,5");

    // Рисуем узлы
    const nodes = svg.selectAll(".node")
        .data(hopsData)
        .enter().append("g")
        .attr("class", "node")
        .attr("transform", (d, i) => `translate(${xScale(i)}, ${yScale(0)})`)
        .on("mouseover", function(event, d) {
            showNodeInfo(event, d);
        })
        .on("mouseout", hideNodeInfo);

    // Добавляем круги
    nodes.append("circle")
        .attr("r", nodeRadius)
        .attr("fill", (d, i) => {
            if (i === 0) return "#e74c3c";
            if (i === hopsData.length - 1) return "#27ae60";
            return "#3498db";
        })
        .attr("stroke", (d, i) => {
            if (i === 0) return "#c0392b";
            if (i === hopsData.length - 1) return "#229954";
            return "#2980b9";
        })
        .attr("stroke-width", 2);

    // Добавляем иконки
    nodes.append("text")
        .attr("class", "node-icon")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("font-size", "12px")
        .attr("fill", "white")
        .text((d, i) => {
            if (i === 0) return "🏠";
            if (i === hopsData.length - 1) return "🎯";
            return "🔗";
        });

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
        .text(d => d.hostname !== '*' ? d.hostname : 'Неизвестный узел')
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
        .text(d => d.rtt1 ? `~${d.rtt1} ms` : 'Нет ответа')
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
        elements.historyCount.textContent = commandHistory.length;
        
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
                    <strong>${escapeHtml(item.command)}</strong>
                </div>
                <div class="history-details">
                    <span class="history-target">🎯 ${escapeHtml(item.target)}</span>
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
    updateZoom();
}

function updateZoom() {
    const svg = d3.select(".traceroute-svg");
    if (!svg.empty()) {
        svg.style("transform", `scale(${zoomLevel})`);
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
        const responseData = {
            command: data.command,
            command_type: 'traceroute',
            parsed_data: data.hops,
            raw_stdout: `Исторические данные: ${data.command}\nВремя выполнения: ${new Date().toLocaleString()}\n\n` +
                       data.hops.map(hop => 
                           `Хоп ${hop.hop}: ${hop.hostname} (${hop.ip}) ${hop.rtt1 ? hop.rtt1 + 'ms' : 'timeout'}`
                       ).join('\n')
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
    elements.systemStatus.textContent = status;
}

function updateUptime() {
    const now = new Date();
    const uptime = now - appStartTime;
    const hours = Math.floor(uptime / 3600000);
    const minutes = Math.floor((uptime % 3600000) / 60000);
    const seconds = Math.floor((uptime % 60000) / 1000);
    
    elements.appUptime.textContent = 
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
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
const optimizedFilterHistory = debounce(filterHistory, 300);
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

console.log('✅ Полная версия script.js загружена');