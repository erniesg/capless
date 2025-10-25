#!/usr/bin/env python3
"""
YouTube Transcript Extractor Container
Receives requests to extract YouTube video transcripts and save to R2
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import subprocess
import os
import sys
from urllib.parse import urlparse, parse_qs

def is_auth_error(error_message):
    """Detect if error is related to authentication"""
    auth_keywords = [
        'Sign in to confirm',
        'not a bot',
        'cookies are no longer valid',
        'cookies have been rotated'
    ]
    return any(keyword in error_message for keyword in auth_keywords)

def extract_fresh_cookies():
    """Extract fresh cookies from Chrome browser"""
    try:
        cookie_file = '/tmp/fresh_cookies.txt'
        print('Extracting fresh cookies from Chrome...')
        result = subprocess.run([
            'yt-dlp',
            '--cookies-from-browser', 'chrome',
            '--cookies', cookie_file,
            '--skip-download',
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ'  # Dummy URL
        ], capture_output=True, text=True, timeout=15)

        if os.path.exists(cookie_file):
            print(f'Fresh cookies extracted successfully to {cookie_file}')
            return cookie_file
        else:
            print('Failed to extract fresh cookies')
            return None
    except Exception as e:
        print(f'Cookie extraction error: {str(e)}')
        return None

class TranscriptHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        """Override to use structured logging"""
        sys.stderr.write(f"[{self.log_date_time_string()}] {format % args}\n")

    def do_GET(self):
        """Health check endpoint"""
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {
                'status': 'healthy',
                'service': 'youtube-transcript-extractor',
                'version': '1.0.0'
            }
            self.wfile.write(json.dumps(response).encode())
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Not Found')

    def do_POST(self):
        """Extract transcript endpoint"""
        if self.path != '/extract':
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Not Found')
            return

        try:
            # Parse request body
            content_length = int(self.headers['Content-Length'])
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))

            video_id = data.get('video_id')
            date = data.get('date')

            if not video_id or not date:
                self.send_error(400, 'Missing video_id or date')
                return

            # Extract transcript using yt-dlp
            video_url = f'https://www.youtube.com/watch?v={video_id}'
            output_path = f'/tmp/{date}'

            print(f'Extracting transcript for {video_id} (date: {date})')

            # Try extraction with existing cookies first, retry with fresh cookies if auth error
            max_retries = 2
            result = None

            for attempt in range(max_retries):
                # Build yt-dlp command with optional cookie support
                cmd = ['yt-dlp', '--write-auto-sub', '--sub-lang', 'en', '--skip-download', '--output', output_path]

                # Check if cookies file exists
                cookie_file = '/app/cookies.txt'
                if os.path.exists(cookie_file):
                    print(f'Attempt {attempt + 1}: Using cookies from {cookie_file}')
                    cmd.extend(['--cookies', cookie_file])
                else:
                    print(f'Attempt {attempt + 1}: No cookies - proceeding without authentication')

                cmd.append(video_url)

                result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

                # Check if extraction succeeded
                if result.returncode == 0:
                    break

                # Check if error is auth-related
                error_msg = result.stderr or 'yt-dlp extraction failed'
                print(f'Attempt {attempt + 1} failed: {error_msg}')

                # If auth error and not last attempt, try refreshing cookies
                if is_auth_error(error_msg) and attempt < max_retries - 1:
                    print('Auth error detected - attempting to refresh cookies')
                    fresh_cookie_file = extract_fresh_cookies()
                    if fresh_cookie_file:
                        # Copy fresh cookies to expected location
                        subprocess.run(['cp', fresh_cookie_file, '/app/cookies.txt'], check=True)
                        print('Retrying with fresh cookies...')
                        continue
                    else:
                        print('Failed to extract fresh cookies - will not retry')
                        break

                # Non-auth error or last attempt - don't retry
                break

            if result.returncode != 0:
                error_msg = result.stderr or 'yt-dlp extraction failed'
                print(f'Final error extracting {video_id}: {error_msg}')
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                response = {
                    'status': 'error',
                    'message': error_msg,
                    'video_id': video_id,
                    'date': date,
                    'retries_attempted': attempt + 1
                }
                self.wfile.write(json.dumps(response).encode())
                return

            # Check if VTT file was created
            vtt_file = f'{output_path}.en.vtt'
            if not os.path.exists(vtt_file):
                print(f'No VTT file found for {video_id} at {vtt_file}')
                self.send_response(404)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                response = {
                    'status': 'error',
                    'message': 'No captions found for this video',
                    'video_id': video_id,
                    'date': date
                }
                self.wfile.write(json.dumps(response).encode())
                return

            # Read VTT content
            with open(vtt_file, 'r', encoding='utf-8') as f:
                vtt_content = f.read()

            # TODO: Upload to R2 (Phase 1.3)
            # For now, just return success with transcript length
            print(f'Successfully extracted transcript for {video_id}: {len(vtt_content)} bytes')

            # Send success response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {
                'status': 'success',
                'video_id': video_id,
                'date': date,
                'transcript_length': len(vtt_content),
                'transcript_path': f'youtube/transcripts/{date}.vtt'  # Future R2 path
            }
            self.wfile.write(json.dumps(response).encode())

            # Cleanup
            if os.path.exists(vtt_file):
                os.remove(vtt_file)

        except subprocess.TimeoutExpired:
            self.send_response(504)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {'status': 'error', 'message': 'yt-dlp timeout (>30s)'}
            self.wfile.write(json.dumps(response).encode())

        except Exception as e:
            print(f'Unexpected error: {str(e)}')
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {'status': 'error', 'message': str(e)}
            self.wfile.write(json.dumps(response).encode())

def run_server(port=8080):
    server_address = ('', port)
    httpd = HTTPServer(server_address, TranscriptHandler)
    print(f'YouTube Transcript Extractor running on port {port}')
    print('Ready to process requests...')
    httpd.serve_forever()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    run_server(port)
