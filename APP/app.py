#!/usr/bin/env python3
import subprocess
import re
import os
import sqlite3
import sys
import platform
from datetime import datetime
from flask import Flask, request, jsonify, render_template

# Explicitly register a datetime adapter for sqlite3 (Python 3.12 deprecates default adapter)
try:
    sqlite3.register_adapter(datetime, lambda d: d.isoformat())
except Exception:
    pass

app = Flask(__name__)

# Глобальные переменные для хранения истории
HISTORY_DB = 'network_history.db'
# Отдельная БД для дерева путей (независимая от истории)
PATHS_DB = 'paths_tree.db'


# ============================
# ИНИЦИАЛИЗАЦИЯ БАЗ ДАННЫХ
# ============================

def init_paths_database():
    """Инициализация БД для агрегированного дерева путей."""
    try:
        conn = sqlite3.connect(PATHS_DB)
        cursor = conn.cursor()
        cursor.execute('PRAGMA foreign_keys = ON;')
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS targets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )''')
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS hop_nodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_id INTEGER NOT NULL,
            hop_number INTEGER NOT NULL,
            hostname TEXT NOT NULL,
            UNIQUE(target_id, hop_number, hostname)
        )''')
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS hop_ips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_id INTEGER NOT NULL,
            hop_number INTEGER NOT NULL,
            ip_address TEXT NOT NULL,
            UNIQUE(target_id, hop_number, ip_address)
        )''')
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS path_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            command TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            target TEXT,
            hops_count INTEGER
        )''')
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS path_hops (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER,
            hop_number INTEGER,
            hostname TEXT,
            ip_address TEXT,
            rtt1 REAL,
            rtt2 REAL,
            rtt3 REAL,
            FOREIGN KEY (request_id) REFERENCES path_requests (id)
        )''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_path_requests_timestamp ON path_requests(timestamp)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_path_hops_request_id ON path_hops(request_id)')
        
        conn.commit()
        conn.close()
    except Exception:
        pass

def init_database():
    """Инициализация базы данных для хранения истории."""
    try:
        conn = sqlite3.connect(HISTORY_DB)
        cursor = conn.cursor()
        
        cursor.execute('PRAGMA foreign_keys = ON;')
        
        # Таблица для хранения запросов
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            command TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            target TEXT,
            hops_count INTEGER
        )
        ''')
        
        # Таблица для хранения хопов
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS hops (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER,
            hop_number INTEGER,
            hostname TEXT,
            ip_address TEXT,
            rtt1 REAL,
            rtt2 REAL,
            rtt3 REAL,
            FOREIGN KEY (request_id) REFERENCES requests (id)
        )
        ''')
        
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_hops_request_id ON hops(request_id)')
        
        conn.commit()
        conn.close()
    except Exception:
        pass


# ============================
# CRUD ДЛЯ ИСТОРИИ
# ============================

def save_request_to_db(command, hops_data):
    """Сохраняет запрос и данные о хопах в базу данных."""
    try:
        conn = sqlite3.connect(HISTORY_DB)
        cursor = conn.cursor()
        
        cursor.execute('PRAGMA foreign_keys = ON;')
        
        target = command.split()[-1] if len(command.split()) > 1 else 'unknown'
        
        cursor.execute('''
        INSERT INTO requests (command, target, hops_count, timestamp)
        VALUES (?, ?, ?, ?)
        ''', (command, target, len(hops_data), datetime.now()))
        
        request_id = cursor.lastrowid
        
        for hop in hops_data:
            rtt1 = float(hop['rtt1']) if hop['rtt1'] and hop['rtt1'] != 'Нет ответа' else None
            rtt2 = float(hop['rtt2']) if hop['rtt2'] and hop['rtt2'] != 'Нет ответа' else None
            rtt3 = float(hop['rtt3']) if hop['rtt3'] and hop['rtt3'] != 'Нет ответа' else None
            
            cursor.execute('''
            INSERT INTO hops (request_id, hop_number, hostname, ip_address, rtt1, rtt2, rtt3)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                request_id,
                int(hop['hop']),
                hop['hostname'],
                hop['ip'],
                rtt1,
                rtt2,
                rtt3
            ))
        
        conn.commit()
        conn.close()
        return True
    except Exception:
        return False

def get_request_history():
    """Возвращает историю запросов."""
    try:
        conn = sqlite3.connect(HISTORY_DB)
        cursor = conn.cursor()
        
        cursor.execute('PRAGMA foreign_keys = ON;')
        
        cursor.execute('''
        SELECT id, command, target, hops_count, timestamp 
        FROM requests 
        ORDER BY timestamp DESC 
        LIMIT 50
        ''')
        
        requests = []
        for row in cursor.fetchall():
            requests.append({
                'id': row[0],
                'command': row[1],
                'target': row[2],
                'hops_count': row[3],
                'timestamp': row[4]
            })
        
        conn.close()
        return requests
    except Exception:
        return []

def get_request_details(request_id):
    """Возвращает детали конкретного запроса."""
    try:
        conn = sqlite3.connect(HISTORY_DB)
        cursor = conn.cursor()
        
        cursor.execute('PRAGMA foreign_keys = ON;')
        
        cursor.execute('SELECT command, target FROM requests WHERE id = ?', (request_id,))
        request_info = cursor.fetchone()
        if not request_info:
            return None
        
        cursor.execute('''
        SELECT hop_number, hostname, ip_address, rtt1, rtt2, rtt3
        FROM hops 
        WHERE request_id = ? 
        ORDER BY hop_number
        ''', (request_id,))
        
        hops = []
        for row in cursor.fetchall():
            hops.append({
                'hop': str(row[0]),
                'hostname': row[1],
                'ip': row[2],
                'rtt1': str(row[3]) if row[3] is not None else None,
                'rtt2': str(row[4]) if row[4] is not None else None,
                'rtt3': str(row[5]) if row[5] is not None else None
            })

        # Нормализация таймаутов для исторических записей
        normalized_hops = []
        for hop in hops:
            r1 = hop['rtt1']
            r2 = hop['rtt2']
            r3 = hop['rtt3']
            ip = (hop['ip'] or '').strip() if hop['ip'] is not None else ''
            hostname = hop['hostname'] or ''
            def _empty(v):
                if v is None:
                    return True
                s = str(v).strip().lower()
                return s in ('', 'none', 'null', 'undefined')
            no_rtts = _empty(r1) and _empty(r2) and _empty(r3)
            if no_rtts and (ip == '' or ip.upper() == 'N/A'):
                hop['ip'] = 'Таймаут'
                hop['hostname'] = '*' if not hostname else hostname
            normalized_hops.append(hop)
        
        conn.close()
        return {
            'command': request_info[0],
            'target': request_info[1],
            'hops': normalized_hops
        }
    except Exception:
        return None


# ============================
# ФУНКЦИИ ДЛЯ ДЕРЕВА ПУТЕЙ
# ============================

# CRUD для независимой истории путей (paths_tree.db)

def save_path_request_to_db(command, hops_data):
    """Сохраняет запрос пути и хопы в отдельную БД paths_tree.db."""
    try:
        conn = sqlite3.connect(PATHS_DB)
        cursor = conn.cursor()
        cursor.execute('PRAGMA foreign_keys = ON;')
        target = command.split()[-1] if len(command.split()) > 1 else 'unknown'
        cursor.execute('''
        INSERT INTO path_requests (command, target, hops_count, timestamp)
        VALUES (?, ?, ?, ?)
        ''', (command, target, len(hops_data), datetime.now()))
        request_id = cursor.lastrowid
        for hop in hops_data or []:
            def _to_float(v):
                try:
                    return float(v) if v not in (None, '', 'Нет ответа') else None
                except Exception:
                    return None
            rtt1 = _to_float(hop.get('rtt1'))
            rtt2 = _to_float(hop.get('rtt2'))
            rtt3 = _to_float(hop.get('rtt3'))
            cursor.execute('''
            INSERT INTO path_hops (request_id, hop_number, hostname, ip_address, rtt1, rtt2, rtt3)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                request_id,
                int(str(hop.get('hop', '0')).strip() or 0),
                hop.get('hostname'),
                hop.get('ip'),
                rtt1, rtt2, rtt3
            ))
        conn.commit()
        conn.close()
        return True
    except Exception:
        return False

def get_path_request_history():
    """Возвращает историю запросов для страницы путей."""
    try:
        conn = sqlite3.connect(PATHS_DB)
        cursor = conn.cursor()
        cursor.execute('PRAGMA foreign_keys = ON;')
        cursor.execute('''
        SELECT id, command, target, hops_count, timestamp
        FROM path_requests
        ORDER BY timestamp DESC
        LIMIT 50
        ''')
        items = []
        for row in cursor.fetchall():
            items.append({
                'id': row[0],
                'command': row[1],
                'target': row[2],
                'hops_count': row[3],
                'timestamp': row[4]
            })
        conn.close()
        return items
    except Exception:
        return []

def get_path_request_details(request_id):
    """Возвращает детали конкретного запроса для страницы путей."""
    try:
        conn = sqlite3.connect(PATHS_DB)
        cursor = conn.cursor()
        cursor.execute('PRAGMA foreign_keys = ON;')
        cursor.execute('SELECT command, target FROM path_requests WHERE id = ?', (request_id,))
        info = cursor.fetchone()
        if not info:
            conn.close()
            return None
        cursor.execute('''
        SELECT hop_number, hostname, ip_address, rtt1, rtt2, rtt3
        FROM path_hops
        WHERE request_id = ?
        ORDER BY hop_number
        ''', (request_id,))
        hops = []
        for row in cursor.fetchall():
            hops.append({
                'hop': str(row[0]),
                'hostname': row[1],
                'ip': row[2],
                'rtt1': str(row[3]) if row[3] is not None else None,
                'rtt2': str(row[4]) if row[4] is not None else None,
                'rtt3': str(row[5]) if row[5] is not None else None
            })
        # Нормализация таймаутов (как в истории)
        normalized_hops = []
        for hop in hops:
            r1, r2, r3 = hop['rtt1'], hop['rtt2'], hop['rtt3']
            ip = (hop['ip'] or '').strip() if hop['ip'] is not None else ''
            hostname = hop['hostname'] or ''
            def _empty(v):
                if v is None:
                    return True
                s = str(v).strip().lower()
                return s in ('', 'none', 'null', 'undefined')
            no_rtts = _empty(r1) and _empty(r2) and _empty(r3)
            if no_rtts and (ip == '' or ip.upper() == 'N/A'):
                hop['ip'] = 'Таймаут'
                hop['hostname'] = '*' if not hostname else hostname
            normalized_hops.append(hop)
        conn.close()
        return {
            'command': info[0],
            'target': info[1],
            'hops': normalized_hops
        }
    except Exception:
        return None

def _ensure_target_id(target: str) -> int:
    conn = sqlite3.connect(PATHS_DB)
    cursor = conn.cursor()
    cursor.execute('PRAGMA foreign_keys = ON;')
    cursor.execute('INSERT OR IGNORE INTO targets(name) VALUES (?)', (target,))
    conn.commit()
    cursor.execute('SELECT id FROM targets WHERE name = ?', (target,))
    row = cursor.fetchone()
    conn.close()
    return row[0] if row else None


def update_paths_aggregate(command: str, hops_data: list):
    """Обновляет агрегированную БД путей на основании результата traceroute."""
    try:
        parts = command.split()
        target = parts[-1] if parts else 'unknown'
        target_id = _ensure_target_id(target)
        if target_id is None:
            return
        conn = sqlite3.connect(PATHS_DB)
        cursor = conn.cursor()
        cursor.execute('PRAGMA foreign_keys = ON;')
        for hop in hops_data or []:
            try:
                hop_num = int(str(hop.get('hop', '')).strip())
            except Exception:
                continue
            hostname = (hop.get('hostname') or '').strip()
            ip = (hop.get('ip') or '').strip()
            if hostname and hostname not in ('*', 'Неизвестный узел'):
                cursor.execute('INSERT OR IGNORE INTO hop_nodes(target_id, hop_number, hostname) VALUES (?, ?, ?)',
                               (target_id, hop_num, hostname))
            if ip and ip not in ('Таймаут', 'N/A'):
                cursor.execute('INSERT OR IGNORE INTO hop_ips(target_id, hop_number, ip_address) VALUES (?, ?, ?)',
                               (target_id, hop_num, ip))
        conn.commit()
        conn.close()
    except Exception:
        pass


def get_all_paths():
    """Возвращает все пути из независимой БД paths_tree.db."""
    try:
        conn = sqlite3.connect(PATHS_DB)
        cursor = conn.cursor()
        cursor.execute('PRAGMA foreign_keys = ON;')
        cursor.execute('''
            SELECT t.name, n.hop_number, n.hostname
            FROM hop_nodes n
            JOIN targets t ON n.target_id = t.id
        ''')
        paths = {}
        for target, hop_number, hostname in cursor.fetchall():
            paths.setdefault(target, [])
            hop = next((h for h in paths[target] if h['hop_number'] == hop_number), None)
            if not hop:
                hop = {'hop_number': hop_number, 'nodes': set(), 'ips': set()}
                paths[target].append(hop)
            if hostname:
                hop['nodes'].add(hostname)
        cursor.execute('''
            SELECT t.name, i.hop_number, i.ip_address
            FROM hop_ips i
            JOIN targets t ON i.target_id = t.id
        ''')
        for target, hop_number, ip in cursor.fetchall():
            paths.setdefault(target, [])
            hop = next((h for h in paths[target] if h['hop_number'] == hop_number), None)
            if not hop:
                hop = {'hop_number': hop_number, 'nodes': set(), 'ips': set()}
                paths[target].append(hop)
            if ip:
                hop['ips'].add(ip)
        for target in paths:
            paths[target].sort(key=lambda x: x['hop_number'])
            for hop in paths[target]:
                hop['nodes'] = list(hop['nodes'])
                hop['ips'] = list(hop['ips'])
        conn.close()
        return paths
    except Exception:
        return {}

#


# ============================
# ОС-СПЕЦИФИКА
# ============================

def is_windows():
    return os.name == 'nt' or sys.platform.startswith('win')

def is_linux():
    return sys.platform.startswith('linux')


def build_command_args(user_command: str):
    """Построение аргументов для OS-специфичных команд/флагов (поддерживаются только traceroute/tracert)."""
    try:
        tokens = user_command.strip().split()
        if not tokens:
            return []
        cmd = tokens[0].lower()
        args = tokens[1:]
        if is_windows():
            if cmd in ('traceroute', 'tracert'):
                out = ['tracert']
                if '-n' in args or '-d' in args:
                    out.append('-d')
                if '-m' in args:
                    try:
                        i = args.index('-m'); out.extend(['-h', args[i+1]])
                    except Exception:
                        pass
                if '-w' in args:
                    try:
                        i = args.index('-w'); val = args[i+1]; ms = max(1, int(float(val) * 1000))
                        out.extend(['-w', str(ms)])
                    except Exception:
                        pass
                target = next((a for a in args if not a.startswith('-')), None)
                if target:
                    out.append(target)
                return out
        else:
            if cmd in ('tracert', 'traceroute'):
                out = ['traceroute']
                if '-d' in args or '-n' in args:
                    out.append('-n')
                if '-h' in args or '-m' in args:
                    try:
                        if '-h' in args:
                            i = args.index('-h'); out.extend(['-m', args[i+1]])
                        else:
                            i = args.index('-m'); out.extend(['-m', args[i+1]])
                    except Exception:
                        pass
                if '-w' in args:
                    try:
                        i = args.index('-w'); ms = int(args[i+1]); s = max(1, int(round(ms / 1000.0)))
                        out.extend(['-w', str(s)])
                    except Exception:
                        pass
                target = next((a for a in args if not a.startswith('-')), None)
                if target:
                    out.append(target)
                return out
        return tokens
    except Exception:
        return user_command.strip().split()


def run_command(command):
    """Безопасное выполнение системной команды (Windows/Linux)."""
    try:
        args = build_command_args(command)
        if not args:
            return "", "Empty command", 1
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=120
        )
        return result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired:
        return None, "Command timed out", -1
    except Exception as e:
        return None, str(e), -1


# ============================
# ПАРСИНГ ВЫВОДА
# ============================

def parse_traceroute(output: str):
    """Парсинг вывода traceroute/tracert для извлечения хопов (Linux/Windows)."""
    hops = []

    linux_patterns = [
        re.compile(r'^\s*(\d+)\s+([\w\.-]+)\s+\(([\d\.]+)\)\s+([\d\.]+)\s+ms\s+([\d\.]+)\s+ms\s+([\d\.]+)\s+ms'),
        re.compile(r'^\s*(\d+)\s+\*\s+\*\s+\*'),
        re.compile(r'^\s*(\d+)\s+(\*|[\w\.-]+)\s+(\*|\([\d\.]+\)|[\w\.-]+\s+\([\d\.]+\))\s+([\d\.*]+)\s+ms\s+([\d\.*]+)\s+ms\s+([\d\.*]+)\s+ms'),
        re.compile(r'^\s*(\d+)\s+([\w\.-]+)\s+\(([\d\.]+)\)\s+([\d\.]+)\s+ms'),
        re.compile(r'^\s*(\d+)\s+([\d\.]+)\s+([\d\.]+)\s+ms'),
    ]

    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        # Заголовки Linux/Windows
        if line.startswith('traceroute') or line.lower().startswith('tracing route to') or line.lower().startswith('over a maximum'):
            continue

        # Windows: таймаут строки
        m_to = re.match(r'^\s*(\d+).*(Request timed out\.|Превышен.*ожидания|Время ожидания истекло)', raw_line, re.IGNORECASE)
        if m_to:
            hops.append({
                'hop': m_to.group(1),
                'hostname': '*',
                'ip': 'Таймаут',
                'rtt1': None,
                'rtt2': None,
                'rtt3': None
            })
            continue

        # Windows: обычная строка с 3 значениями ms и узлом
        m_win = re.match(r'^\s*(\d+)\s+([<\d\s]+)ms\s+([<\d\s]+)ms\s+([<\d\s]+)ms\s+(.+)$', raw_line)
        if m_win:
            hop_num = m_win.group(1)
            def _ms_val(s: str):
                m = re.search(r'(\d+)', s)
                return m.group(1) if m else None
            r1 = _ms_val(m_win.group(2))
            r2 = _ms_val(m_win.group(3))
            r3 = _ms_val(m_win.group(4))
            host_part = m_win.group(5).strip()
            ip = None
            ip_br = re.search(r'\[([\d\.]+)\]', host_part)
            if ip_br:
                ip = ip_br.group(1)
                hostname = host_part.split('[')[0].strip().rstrip('.')
                hostname = hostname if hostname else '*'
            else:
                ip_m = re.search(r'(\d{1,3}(?:\.\d{1,3}){3})(?!.*\d)', host_part)
                ip = ip_m.group(1) if ip_m else None
                if ip and host_part.strip() == ip:
                    hostname = '*'
                else:
                    hostname = host_part.strip()
            hops.append({
                'hop': hop_num,
                'hostname': hostname or '*',
                'ip': ip or 'N/A',
                'rtt1': r1,
                'rtt2': r2,
                'rtt3': r3
            })
            continue

        # Linux: полный таймаут "N  * * *"
        timeout_only = re.match(r'^\s*(\d+)\s+\*\s+\*\s+\*', line)
        if timeout_only:
            hops.append({
                'hop': timeout_only.group(1),
                'hostname': '*',
                'ip': 'Таймаут',
                'rtt1': None,
                'rtt2': None,
                'rtt3': None
            })
            continue

        matched = False
        for pattern in linux_patterns:
            match = pattern.match(line)
            if match:
                matched = True
                groups = match.groups()
                hop_num = groups[0]
                if len(groups) >= 3:
                    if groups[1] == '*' and (len(groups) < 3 or groups[2] == '*'):
                        hops.append({
                            'hop': hop_num,
                            'hostname': '*',
                            'ip': 'Таймаут',
                            'rtt1': None,
                            'rtt2': None,
                            'rtt3': None
                        })
                    else:
                        hostname = groups[1] if groups[1] != '*' else '*'
                        # IP
                        ip = ''
                        if len(groups) > 2:
                            if groups[2].startswith('(') and groups[2].endswith(')'):
                                ip = groups[2][1:-1]
                            elif '.' in groups[2] and groups[2] != '*':
                                ip = groups[2]
                            else:
                                ip = 'N/A'
                        # RTT
                        rtt_values = []
                        for i in range(3, min(7, len(groups))):
                            if i < len(groups) and groups[i] and groups[i] != '*':
                                rtt_values.append(groups[i])
                        if not rtt_values and ip and ip != 'N/A':
                            rtt_values = [None, None, None]
                        hops.append({
                            'hop': hop_num,
                            'hostname': hostname,
                            'ip': ip,
                            'rtt1': rtt_values[0] if len(rtt_values) > 0 else None,
                            'rtt2': rtt_values[1] if len(rtt_values) > 1 else None,
                            'rtt3': rtt_values[2] if len(rtt_values) > 2 else None
                        })
                break
        if matched:
            continue

        # Универсальный fallback (например traceroute -n)
        try:
            m = re.match(r'^\s*(\d+)\s+(.*)$', line)
            if m:
                hop_num = m.group(1)
                rest = m.group(2)
                if '*' in rest:
                    hops.append({
                        'hop': hop_num,
                        'hostname': '*',
                        'ip': 'Таймаут',
                        'rtt1': None,
                        'rtt2': None,
                        'rtt3': None
                    })
                else:
                    ip_match = re.search(r'(\d{1,3}(?:\.\d{1,3}){3})', rest)
                    ip = ip_match.group(1) if ip_match else 'N/A'
                    rtts = re.findall(r'([\d\.]+)\s*ms', rest)
                    hops.append({
                        'hop': hop_num,
                        'hostname': ip if ip != 'N/A' else '*',
                        'ip': ip,
                        'rtt1': rtts[0] if len(rtts) > 0 else None,
                        'rtt2': rtts[1] if len(rtts) > 1 else None,
                        'rtt3': rtts[2] if len(rtts) > 2 else None
                    })
        except Exception:
            pass

    return hops




# ============================
# FLASK ROUTES
# ============================

@app.route('/')
def index():
    """Главная страница - отдаем HTML."""
    return render_template('index.html')

@app.route('/paths')
def paths_page():
    """Страница дерева путей."""
    return render_template('paths.html')

@app.route('/api/run_command', methods=['POST'])
def api_run_command():
    """API endpoint для выполнения команды."""
    try:
        data = request.get_json()
        if not data or 'command' not in data:
            return jsonify({'error': 'No command provided'}), 400
        
        user_command = data.get('command', '').strip()
        if not user_command:
            return jsonify({'error': 'Empty command'}), 400
        if len(user_command) > 1024:
            return jsonify({'error': 'Command too long'}), 400

        # Разрешаем только определенные команды в целях безопасности (Linux/Windows)
        if is_windows():
            allowed_commands = [
                'tracert',
                'nslookup'
            ]
        else:
            allowed_commands = [
                'traceroute',
                'dig',
                'nslookup',
                'whois'
            ]
        is_allowed = any(user_command.startswith(cmd) for cmd in allowed_commands)
        if not is_allowed:
            return jsonify({'error': 'Command not allowed', 'allowed_commands': allowed_commands}), 403

        stdout, stderr, returncode = run_command(user_command)

        parsed_data = None
        command_type = None

        if user_command.startswith(('traceroute', 'tracert')):
            command_type = 'traceroute'
            if stdout:
                parsed_data = parse_traceroute(stdout)
                if parsed_data:
                    save_request_to_db(user_command, parsed_data)
        elif user_command.startswith(('dig', 'nslookup', 'whois')):
            command_type = 'dns'
            if stdout:
                parsed_data = {'raw_output': stdout[:1000] + '...' if len(stdout) > 1000 else stdout}
        
        response = {
            'command': user_command,
            'command_type': command_type,
            'raw_stdout': stdout,
            'raw_stderr': stderr,
            'returncode': returncode,
            'parsed_data': parsed_data
        }
        return jsonify(response)

    except Exception as e:
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/api/batch_traceroute', methods=['POST'])
def api_batch_traceroute():
    """Выполняет traceroute для списка целей последовательно и сохраняет результаты в историю.
    Формат запроса:
    {
      "targets": ["8.8.8.8", "1.1.1.1"],
      "options": { "numeric": true, "max_hops": 30, "wait_ms": 3000 }
    }
    Также поддерживает ключ "ips" как синоним "targets".
    """
    try:
        data = request.get_json() or {}
        targets = data.get('targets') or data.get('ips') or []
        if not isinstance(targets, list):
            return jsonify({'error': 'targets must be a list'}), 400
        # Нормализация и фильтрация целей
        cleaned = []
        for t in targets:
            s = str(t).strip()
            if s:
                cleaned.append(s)
        targets = cleaned
        if not targets:
            return jsonify({'error': 'No targets provided'}), 400
        if len(targets) > 50:
            return jsonify({'error': 'Too many targets (max 50)'}), 400

        options = data.get('options') or {}
        numeric = bool(options.get('numeric'))
        max_hops = options.get('max_hops')
        wait_ms = options.get('wait_ms')

        results = []
        for target in targets:
            parts = ['traceroute']
            if numeric:
                parts.append('-n')
            if isinstance(max_hops, int) and max_hops > 0:
                parts.extend(['-m', str(max_hops)])
            if isinstance(wait_ms, int) and wait_ms > 0:
                parts.extend(['-w', str(wait_ms)])
            parts.append(target)
            user_command = ' '.join(parts)

            stdout, stderr, returncode = run_command(user_command)

            parsed = None
            if stdout:
                parsed = parse_traceroute(stdout)
                if parsed:
                    # Сохраняем в основную историю
                    save_request_to_db(user_command, parsed)
                    # Обновляем агрегированное дерево путей (без сохранения per-request в PATHS DB)
                    try:
                        update_paths_aggregate(user_command, parsed)
                    except Exception:
                        pass

            results.append({
                'target': target,
                'command': user_command,
                'raw_stdout': stdout,
                'raw_stderr': stderr,
                'returncode': returncode,
                'hops': parsed
            })

        return jsonify({'count': len(results), 'results': results})
    except Exception as e:
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/api/history', methods=['GET'])
def api_history():
    """API для получения истории запросов."""
    try:
        history = get_request_history()
        return jsonify({'history': history})
    except Exception as e:
        return jsonify({'error': f'Error getting history: {str(e)}'}), 500

@app.route('/api/history/<int:request_id>', methods=['GET'])
def api_history_details(request_id):
    """API для получения деталей конкретного запроса."""
    try:
        details = get_request_details(request_id)
        if not details:
            return jsonify({'error': 'Request not found'}), 404
        return jsonify(details)
    except Exception as e:
        return jsonify({'error': f'Error getting request details: {str(e)}'}), 500

@app.route('/api/history/<int:request_id>', methods=['DELETE'])
def api_history_delete(request_id):
    """Удаление одной записи истории по ID (включая ее хопы)."""
    try:
        conn = sqlite3.connect(HISTORY_DB)
        cursor = conn.cursor()
        cursor.execute('PRAGMA foreign_keys = ON;')
        cursor.execute('SELECT 1 FROM requests WHERE id = ?', (request_id,))
        exists = cursor.fetchone() is not None
        if not exists:
            conn.close()
            return jsonify({'error': 'Request not found'}), 404
        cursor.execute('DELETE FROM hops WHERE request_id = ?', (request_id,))
        cursor.execute('DELETE FROM requests WHERE id = ?', (request_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Request deleted successfully', 'id': request_id})
    except Exception as e:
        return jsonify({'error': f'Error deleting request: {str(e)}'}), 500

@app.route('/api/paths_run_command', methods=['POST'])
def api_paths_run_command():
    try:
        data = request.get_json()
        if not data or 'command' not in data:
            return jsonify({'error': 'No command provided'}), 400
        user_command = data.get('command', '').strip()
        if not user_command:
            return jsonify({'error': 'Empty command'}), 400
        if len(user_command) > 1024:
            return jsonify({'error': 'Command too long'}), 400
        if is_windows():
            allowed_commands = ['tracert', 'nslookup']
        else:
            allowed_commands = ['traceroute', 'dig', 'nslookup', 'whois']
        if not any(user_command.startswith(cmd) for cmd in allowed_commands):
            return jsonify({'error': 'Command not allowed', 'allowed_commands': allowed_commands}), 403
        stdout, stderr, returncode = run_command(user_command)
        parsed_data = None
        command_type = None
        if user_command.startswith(('traceroute', 'tracert')):
            command_type = 'traceroute'
            if stdout:
                parsed_data = parse_traceroute(stdout)
                if parsed_data:
                    save_path_request_to_db(user_command, parsed_data)
                    try:
                        update_paths_aggregate(user_command, parsed_data)
                    except Exception:
                        pass
        elif user_command.startswith(('dig', 'nslookup', 'whois')):
            command_type = 'dns'
            if stdout:
                parsed_data = {'raw_output': stdout[:1000] + '...' if len(stdout) > 1000 else stdout}
        return jsonify({
            'command': user_command,
            'command_type': command_type,
            'raw_stdout': stdout,
            'raw_stderr': stderr,
            'returncode': returncode,
            'parsed_data': parsed_data
        })
    except Exception as e:
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/api/paths_history', methods=['GET'])
def api_paths_history():
    try:
        return jsonify({'history': get_path_request_history()})
    except Exception as e:
        return jsonify({'error': f'Error getting paths history: {str(e)}'}), 500

@app.route('/api/paths_history/<int:request_id>', methods=['GET'])
def api_paths_history_details(request_id):
    try:
        details = get_path_request_details(request_id)
        if not details:
            return jsonify({'error': 'Request not found'}), 404
        return jsonify(details)
    except Exception as e:
        return jsonify({'error': f'Error getting request details: {str(e)}'}), 500

@app.route('/api/paths_history/<int:request_id>', methods=['DELETE'])
def api_paths_history_delete(request_id):
    try:
        conn = sqlite3.connect(PATHS_DB)
        cursor = conn.cursor()
        cursor.execute('PRAGMA foreign_keys = ON;')
        cursor.execute('SELECT 1 FROM path_requests WHERE id = ?', (request_id,))
        exists = cursor.fetchone() is not None
        if not exists:
            conn.close()
            return jsonify({'error': 'Request not found'}), 404
        cursor.execute('DELETE FROM path_hops WHERE request_id = ?', (request_id,))
        cursor.execute('DELETE FROM path_requests WHERE id = ?', (request_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Request deleted successfully', 'id': request_id})
    except Exception as e:
        return jsonify({'error': f'Error deleting request: {str(e)}'}), 500

@app.route('/api/paths', methods=['GET'])
def api_paths():
    """API для получения всех путей для построения дерева."""
    try:
        paths = get_all_paths()
        return jsonify({'paths': paths})
    except Exception as e:
        return jsonify({'error': f'Error getting paths: {str(e)}'}), 500




@app.route('/api/network_info', methods=['GET'])
def api_network_info():
    """API для получения информации о сетевых интерфейсах (Windows/Linux, с fallback)."""
    try:
        # IP info
        ip_info = ''
        try:
            res = subprocess.run(['ip', 'addr', 'show'], capture_output=True, text=True)
            if res.returncode == 0:
                ip_info = res.stdout
        except Exception:
            pass
        if not ip_info and is_windows():  # Windows fallback
            try:
                res = subprocess.run(['ipconfig', '/all'], capture_output=True, text=True)
                if res.returncode == 0:
                    ip_info = res.stdout
            except Exception:
                pass
        if not ip_info:
            ip_info = 'Error getting IP info'

        # Default route
        default_route = ''
        try:
            res = subprocess.run(['ip', 'route', 'show', 'default'], capture_output=True, text=True)
            if res.returncode == 0:
                default_route = res.stdout
        except Exception:
            pass
        if not default_route and is_windows():
            try:
                res = subprocess.run(['route', 'print'], capture_output=True, text=True)
                if res.returncode == 0:
                    default_route = res.stdout
            except Exception:
                pass
        if not default_route:
            default_route = 'No default route'

        # External IP
        external_ip = 'Unknown'
        try:
            res = subprocess.run(['curl', '-s', 'ifconfig.me'], capture_output=True, text=True, timeout=5)
            if res.returncode == 0 and res.stdout.strip():
                external_ip = res.stdout.strip()
        except Exception:
            pass
        if external_ip == 'Unknown' and is_windows():
            try:
                res = subprocess.run(['powershell', '-Command', '(Invoke-WebRequest -UseBasicParsing ifconfig.me).Content'], capture_output=True, text=True, timeout=8)
                if res.returncode == 0 and res.stdout.strip():
                    external_ip = res.stdout.strip()
            except Exception:
                pass

        try:
            hostname = os.uname().nodename
        except Exception:
            hostname = platform.node()

        return jsonify({
            'ip_addresses': ip_info,
            'default_route': default_route,
            'external_ip': external_ip,
            'hostname': hostname,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({'error': f'Error getting network info: {str(e)}'}), 500

@app.route('/api/clear_history', methods=['POST'])
def api_clear_history():
    """API для очистки истории."""
    try:
        conn = sqlite3.connect(HISTORY_DB)
        cursor = conn.cursor()
        cursor.execute('PRAGMA foreign_keys = ON;')
        cursor.execute('DELETE FROM hops')
        cursor.execute('DELETE FROM requests')
        conn.commit()
        conn.close()
        return jsonify({'message': 'History cleared successfully'})
    except Exception as e:
        return jsonify({'error': f'Error clearing history: {str(e)}'}), 500

@app.route('/api/clear_paths', methods=['POST'])
def api_clear_paths():
    """Очистка независимой БД дерева путей."""
    try:
        conn = sqlite3.connect(PATHS_DB)
        cursor = conn.cursor()
        cursor.execute('PRAGMA foreign_keys = ON;')
        cursor.execute('DELETE FROM path_hops')
        cursor.execute('DELETE FROM path_requests')
        cursor.execute('DELETE FROM hop_nodes')
        cursor.execute('DELETE FROM hop_ips')
        cursor.execute('DELETE FROM targets')
        conn.commit()
        conn.close()
        return jsonify({'message': 'Paths DB cleared successfully'})
    except Exception as e:
        return jsonify({'error': f'Error clearing paths: {str(e)}'}), 500


# ============================
# ERROR HANDLERS
# ============================

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500


# ============================
# ИНИЦИАЛИЗАЦИЯ И ��АПУСК
# ============================

# Инициализация при импорте
init_database()
init_paths_database()

if __name__ == '__main__':
    # Создаем папки если они не существуют (внутри пакета APP)
    base_dir = os.path.dirname(__file__)
    os.makedirs(os.path.join(base_dir, 'templates'), exist_ok=True)
    os.makedirs(os.path.join(base_dir, 'static', 'css'), exist_ok=True)
    os.makedirs(os.path.join(base_dir, 'static', 'js'), exist_ok=True)
    
    # Запускаем сервер
    app.run(host='0.0.0.0', port=5000, debug=True)
