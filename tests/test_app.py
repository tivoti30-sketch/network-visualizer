import os
import types
import tempfile
import unittest
from unittest.mock import patch

import APP.app as app_module


def make_completed(stdout="", stderr="", returncode=0):
    return types.SimpleNamespace(stdout=stdout, stderr=stderr, returncode=returncode)


class NetworkVisualizerAPITests(unittest.TestCase):
    def setUp(self):
        # Use a temporary SQLite DB for each test to isolate state
        self.tmp_db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.addCleanup(lambda: (os.path.exists(self.tmp_db.name) and os.unlink(self.tmp_db.name)))
        app_module.HISTORY_DB = self.tmp_db.name
        app_module.init_database()

        self.app = app_module.app
        self.app.testing = True
        self.client = self.app.test_client()

    # 1) Missing command -> 400
    def test_api_run_command_missing_command(self):
        resp = self.client.post('/api/run_command', json={})
        self.assertEqual(resp.status_code, 400)
        data = resp.get_json()
        self.assertIn('error', data)
        self.assertEqual(data['error'], 'No command provided')

    # 2) Empty command -> 400
    def test_api_run_command_empty_command(self):
        resp = self.client.post('/api/run_command', json={'command': '   '})
        self.assertEqual(resp.status_code, 400)
        data = resp.get_json()
        self.assertEqual(data['error'], 'Empty command')

    # 3) Forbidden command -> 403 with allowed list
    def test_api_run_command_forbidden(self):
        resp = self.client.post('/api/run_command', json={'command': 'ls -la'})
        self.assertEqual(resp.status_code, 403)
        data = resp.get_json()
        self.assertIn('Command not allowed', data['error'])
        self.assertIn('traceroute', data['allowed_commands'])

    # 4) Traceroute parsing and DB saving
    @patch('APP.app.subprocess.run')
    def test_api_run_command_traceroute_parses_and_saves(self, mock_run):
        traceroute_output = (
            "traceroute to example.com (93.184.216.34), 30 hops max\n"
            " 1  router (192.168.1.1)  1.123 ms  1.234 ms  1.345 ms\n"
            " 2  * * *\n"
            " 3  example.com (93.184.216.34)  10.234 ms  10.345 ms  10.456 ms\n"
        )
        mock_run.return_value = make_completed(stdout=traceroute_output, stderr='', returncode=0)

        resp = self.client.post('/api/run_command', json={'command': 'traceroute example.com'})
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data['command_type'], 'traceroute')
        self.assertEqual(data['returncode'], 0)
        self.assertIsInstance(data['parsed_data'], list)
        self.assertGreaterEqual(len(data['parsed_data']), 3)

        # Ensure history saved
        hist_resp = self.client.get('/api/history')
        self.assertEqual(hist_resp.status_code, 200)
        hist = hist_resp.get_json()
        self.assertIn('history', hist)
        self.assertEqual(len(hist['history']), 1)
        item = hist['history'][0]
        self.assertEqual(item['target'], 'example.com')
        self.assertEqual(item['hops_count'], len(data['parsed_data']))

    # 5) Ping parsing
    @patch('APP.app.subprocess.run')
    def test_api_run_command_ping_parses_stats(self, mock_run):
        ping_output = (
            "PING example.com (93.184.216.34) 56(84) bytes of data.\n"
            "--- example.com ping statistics ---\n"
            "4 packets transmitted, 4 received, 0% packet loss, time 10ms\n"
            "rtt min/avg/max/mdev = 10.123/20.234/30.345/5.678 ms\n"
        )
        mock_run.return_value = make_completed(stdout=ping_output, stderr='', returncode=0)

        resp = self.client.post('/api/run_command', json={'command': 'ping -c 4 example.com'})
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data['command_type'], 'ping')
        self.assertEqual(data['parsed_data']['packets_transmitted'], 4)
        self.assertEqual(data['parsed_data']['packets_received'], 4)
        self.assertEqual(data['parsed_data']['packet_loss'], '0%')
        self.assertAlmostEqual(data['parsed_data']['rtt_avg'], 20.234)

    # 6) Paths endpoint structure after a saved traceroute
    @patch('APP.app.subprocess.run')
    def test_api_paths_returns_structure(self, mock_run):
        traceroute_output = (
            "traceroute to example.com (93.184.216.34), 30 hops max\n"
            " 1  router (192.168.1.1)  1.123 ms  1.234 ms  1.345 ms\n"
            " 2  * * *\n"
            " 3  example.com (93.184.216.34)  10.234 ms  10.345 ms  10.456 ms\n"
        )
        mock_run.return_value = make_completed(stdout=traceroute_output, stderr='', returncode=0)
        # Generate history
        self.client.post('/api/run_command', json={'command': 'traceroute example.com'})

        resp = self.client.get('/api/paths')
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn('paths', data)
        self.assertIn('example.com', data['paths'])
        hops = data['paths']['example.com']
        self.assertIsInstance(hops, list)
        self.assertGreaterEqual(len(hops), 2)
        # Ensure nodes and ips are lists
        for hop in hops:
            self.assertIn('nodes', hop)
            self.assertIn('ips', hop)
            self.assertIsInstance(hop['nodes'], list)
            self.assertIsInstance(hop['ips'], list)

    # 7) Clear history
    @patch('APP.app.subprocess.run')
    def test_api_clear_history_clears(self, mock_run):
        traceroute_output = (
            "traceroute to example.com (93.184.216.34), 30 hops max\n"
            " 1  router (192.168.1.1)  1.123 ms  1.234 ms  1.345 ms\n"
            " 2  * * *\n"
            " 3  example.com (93.184.216.34)  10.234 ms  10.345 ms  10.456 ms\n"
        )
        mock_run.return_value = make_completed(stdout=traceroute_output, stderr='', returncode=0)
        # Create history
        self.client.post('/api/run_command', json={'command': 'traceroute example.com'})
        hist_resp = self.client.get('/api/history')
        self.assertEqual(len(hist_resp.get_json()['history']), 1)

        # Clear
        clear_resp = self.client.post('/api/clear_history')
        self.assertEqual(clear_resp.status_code, 200)
        self.assertIn('History cleared successfully', clear_resp.get_json().get('message', ''))

        # Verify empty
        hist_resp2 = self.client.get('/api/history')
        self.assertEqual(len(hist_resp2.get_json()['history']), 0)

    # 8) Network info: fields present, external IP Unknown when curl fails
    @patch('APP.app.subprocess.run')
    def test_api_network_info_fields_and_external_ip_unknown_on_error(self, mock_run):
        def side_effect(args, capture_output=True, text=True, timeout=None):
            if args[:2] == ['ip', 'addr']:
                return make_completed(stdout='IP INFO', stderr='', returncode=0)
            if args[:3] == ['ip', 'route', 'show']:
                return make_completed(stdout='default via 192.168.1.1 dev eth0', stderr='', returncode=0)
            if args[:2] == ['curl', '-s']:
                raise Exception('curl failed')
            return make_completed(stdout='', stderr='unknown', returncode=1)

        mock_run.side_effect = side_effect

        resp = self.client.get('/api/network_info')
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn('ip_addresses', data)
        self.assertIn('default_route', data)
        self.assertIn('external_ip', data)
        self.assertEqual(data['external_ip'], 'Unknown')
        self.assertIn('hostname', data)
        self.assertIn('timestamp', data)

    # 9) run_command timeout handling
    @patch('APP.app.subprocess.run')
    def test_run_command_timeout(self, mock_run):
        mock_run.side_effect = app_module.subprocess.TimeoutExpired(cmd='cmd', timeout=120)
        stdout, stderr, rc = app_module.run_command('traceroute example.com')
        self.assertIsNone(stdout)
        self.assertEqual(rc, -1)
        self.assertIn('timed out', stderr)

    # 10) run_command generic exception handling
    @patch('APP.app.subprocess.run')
    def test_run_command_generic_exception(self, mock_run):
        mock_run.side_effect = OSError('boom')
        stdout, stderr, rc = app_module.run_command('ping -c 4 example.com')
        self.assertIsNone(stdout)
        self.assertEqual(rc, -1)
        self.assertIn('boom', stderr)


if __name__ == '__main__':
    unittest.main(verbosity=2)
