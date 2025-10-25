#!/usr/bin/env python3
"""
YouTube Transcript Extractor Container
Receives requests to extract YouTube video transcripts and save to R2

Uses scrape.do residential proxy to bypass YouTube's anti-bot protections
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import subprocess
import os
import sys
from urllib.parse import urlparse, parse_qs
import boto3
from botocore.exceptions import ClientError

# scrape.do proxy configuration
SCRAPE_DO_TOKEN = os.environ.get('SCRAPE_DO_TOKEN', '99863f3851994a20a8222502e63bf6c28b6abb4cf6e')
SCRAPE_DO_PROXY_URL = f"http://{SCRAPE_DO_TOKEN}:super=true@proxy.scrape.do:8080"

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

def download_cookies_from_r2():
    """Download YouTube cookies from R2"""
    try:
        # Get R2 credentials from environment
        account_id = os.environ.get('R2_ACCOUNT_ID')
        access_key_id = os.environ.get('R2_ACCESS_KEY_ID')
        secret_access_key = os.environ.get('R2_SECRET_ACCESS_KEY')
        bucket_name = os.environ.get('R2_BUCKET_NAME', 'capless-preview')

        if not all([account_id, access_key_id, secret_access_key]):
            print('WARNING: R2 credentials not configured - cannot download cookies')
            return False

        # Configure S3 client for R2
        s3_client = boto3.client(
            's3',
            endpoint_url=f'https://{account_id}.r2.cloudflarestorage.com',
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name='auto'
        )

        # Download cookies from R2
        r2_key = 'youtube/cookies.txt'
        cookie_path = '/app/cookies.txt'

        print(f'Downloading cookies from R2: {r2_key}')
        s3_client.download_file(bucket_name, r2_key, cookie_path)
        print(f'Successfully downloaded cookies to {cookie_path}')
        return True

    except ClientError as e:
        print(f'R2 cookies download error: {str(e)}')
        return False
    except Exception as e:
        print(f'Unexpected cookies download error: {str(e)}')
        return False

def upload_to_r2(file_path, date):
    """Upload VTT file to Cloudflare R2"""
    try:
        # Get R2 credentials from environment
        account_id = os.environ.get('R2_ACCOUNT_ID')
        access_key_id = os.environ.get('R2_ACCESS_KEY_ID')
        secret_access_key = os.environ.get('R2_SECRET_ACCESS_KEY')
        bucket_name = os.environ.get('R2_BUCKET_NAME', 'capless-preview')

        if not all([account_id, access_key_id, secret_access_key]):
            print('WARNING: R2 credentials not configured - skipping upload')
            return None

        # Configure S3 client for R2
        s3_client = boto3.client(
            's3',
            endpoint_url=f'https://{account_id}.r2.cloudflarestorage.com',
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name='auto'
        )

        # Upload file to R2
        r2_key = f'youtube/transcripts/{date}.vtt'
        print(f'Uploading to R2: {r2_key}')

        with open(file_path, 'rb') as f:
            s3_client.upload_fileobj(
                f,
                bucket_name,
                r2_key,
                ExtraArgs={'ContentType': 'text/vtt'}
            )

        print(f'Successfully uploaded to R2: {r2_key}')
        return r2_key

    except ClientError as e:
        print(f'R2 upload error: {str(e)}')
        return None
    except Exception as e:
        print(f'Unexpected upload error: {str(e)}')
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

            # Download cookies from R2 if available
            download_cookies_from_r2()

            # Try extraction with existing cookies first, retry with fresh cookies if auth error
            max_retries = 2
            result = None

            for attempt in range(max_retries):
                # Build yt-dlp command with scrape.do proxy support
                cmd = ['yt-dlp', '--write-auto-sub', '--sub-lang', 'en', '--skip-download', '--output', output_path]

                # Add scrape.do residential proxy (critical for bypassing YouTube blocking)
                cmd.extend(['--proxy', SCRAPE_DO_PROXY_URL])
                cmd.append('--no-check-certificate')  # Required for scrape.do proxy

                print(f'Attempt {attempt + 1}: Using scrape.do residential proxy')

                # Check if cookies file exists (optional - proxy is primary method)
                cookie_file = '/app/cookies.txt'
                if os.path.exists(cookie_file):
                    print(f'  + Using cookies from {cookie_file}')
                    cmd.extend(['--cookies', cookie_file])

                cmd.append(video_url)

                result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)

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

            print(f'Successfully extracted transcript for {video_id}: {len(vtt_content)} bytes')

            # Upload to R2
            r2_key = upload_to_r2(vtt_file, date)

            # Send success response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {
                'status': 'success',
                'video_id': video_id,
                'date': date,
                'transcript_length': len(vtt_content),
                'transcript_path': r2_key if r2_key else f'youtube/transcripts/{date}.vtt',
                'uploaded_to_r2': r2_key is not None
            }
            self.wfile.write(json.dumps(response).encode())

            # Cleanup
            if os.path.exists(vtt_file):
                os.remove(vtt_file)

        except subprocess.TimeoutExpired:
            self.send_response(504)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {'status': 'error', 'message': 'yt-dlp timeout (>180s)'}
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
