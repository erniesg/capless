#!/usr/bin/env python3
"""
YouTube Transcript Extractor - Using youtube-transcript-api
Fast, reliable transcript extraction without authentication
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
import sys
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
    TooManyRequests
)
import boto3
from botocore.exceptions import ClientError


def convert_to_vtt(transcript):
    """Convert transcript JSON to VTT format"""
    vtt_lines = ['WEBVTT\n']

    for i, entry in enumerate(transcript):
        start = entry['start']
        duration = entry['duration']
        end = start + duration

        start_time = format_timestamp(start)
        end_time = format_timestamp(end)

        vtt_lines.append(f'\n{i + 1}')
        vtt_lines.append(f'{start_time} --> {end_time}')
        vtt_lines.append(entry['text'])

    return '\n'.join(vtt_lines)


def format_timestamp(seconds):
    """Format seconds to HH:MM:SS.mmm"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f'{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}'


def upload_to_r2(vtt_content, date):
    """Upload VTT content to R2"""
    try:
        account_id = os.environ.get('R2_ACCOUNT_ID')
        access_key_id = os.environ.get('R2_ACCESS_KEY_ID')
        secret_access_key = os.environ.get('R2_SECRET_ACCESS_KEY')
        bucket_name = os.environ.get('R2_BUCKET_NAME', 'capless-preview')

        if not all([account_id, access_key_id, secret_access_key]):
            print('WARNING: R2 credentials not configured')
            return None

        s3_client = boto3.client(
            's3',
            endpoint_url=f'https://{account_id}.r2.cloudflarestorage.com',
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name='auto'
        )

        r2_key = f'youtube/transcripts/{date}.vtt'
        s3_client.put_object(
            Bucket=bucket_name,
            Key=r2_key,
            Body=vtt_content.encode('utf-8'),
            ContentType='text/vtt'
        )

        print(f'✅ Uploaded to R2: {r2_key}')
        return r2_key

    except Exception as e:
        print(f'❌ R2 upload error: {str(e)}')
        return None


class TranscriptHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        sys.stderr.write(f"[{self.log_date_time_string()}] {format % args}\n")

    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {
                'status': 'healthy',
                'service': 'youtube-transcript-extractor',
                'version': '2.0.0',
                'method': 'youtube-transcript-api (no auth required)'
            }
            self.wfile.write(json.dumps(response).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path != '/extract':
            self.send_response(404)
            self.end_headers()
            return

        try:
            content_length = int(self.headers['Content-Length'])
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))

            video_id = data.get('video_id')
            date = data.get('date')

            if not video_id or not date:
                self.send_error(400, 'Missing video_id or date')
                return

            print(f'🎬 Extracting transcript: {video_id} ({date})')

            # Check if transcript already exists in R2 before extraction
            account_id = os.environ.get('R2_ACCOUNT_ID')
            access_key_id = os.environ.get('R2_ACCESS_KEY_ID')
            secret_access_key = os.environ.get('R2_SECRET_ACCESS_KEY')
            bucket_name = os.environ.get('R2_BUCKET_NAME', 'capless-preview')

            if all([account_id, access_key_id, secret_access_key]):
                try:
                    s3_client = boto3.client(
                        's3',
                        endpoint_url=f'https://{account_id}.r2.cloudflarestorage.com',
                        aws_access_key_id=access_key_id,
                        aws_secret_access_key=secret_access_key,
                        region_name='auto'
                    )

                    r2_key = f'youtube/transcripts/{date}.vtt'
                    s3_client.head_object(Bucket=bucket_name, Key=r2_key)

                    # File exists - return early
                    print(f'✅ Transcript already exists in R2: {r2_key}')
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    response = {
                        'status': 'exists',
                        'video_id': video_id,
                        'date': date,
                        'r2_key': r2_key,
                        'message': 'Transcript already extracted'
                    }
                    self.wfile.write(json.dumps(response).encode())
                    return

                except ClientError as e:
                    if e.response['Error']['Code'] == '404':
                        print(f'📝 Transcript not found in R2, proceeding with extraction')
                    else:
                        print(f'⚠️  R2 check error: {str(e)}, proceeding anyway')

            try:
                # Get transcript (prefers manual, falls back to auto-generated)
                transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['en'])
                print(f'📝 Found {len(transcript)} entries')

                # Convert to VTT
                vtt_content = convert_to_vtt(transcript)
                print(f'📄 VTT size: {len(vtt_content)} bytes')

                # Upload to R2
                r2_key = upload_to_r2(vtt_content, date)

                # Success response
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                response = {
                    'status': 'success',
                    'video_id': video_id,
                    'date': date,
                    'transcript_length': len(vtt_content),
                    'transcript_entries': len(transcript),
                    'transcript_path': r2_key if r2_key else f'youtube/transcripts/{date}.vtt',
                    'uploaded_to_r2': r2_key is not None
                }
                self.wfile.write(json.dumps(response).encode())

            except TranscriptsDisabled:
                self.send_response(404)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'status': 'error',
                    'message': 'Transcripts disabled for this video',
                    'video_id': video_id
                }).encode())

            except NoTranscriptFound:
                self.send_response(404)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'status': 'error',
                    'message': 'No English transcript found',
                    'video_id': video_id
                }).encode())

            except VideoUnavailable:
                self.send_response(404)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'status': 'error',
                    'message': 'Video unavailable',
                    'video_id': video_id
                }).encode())

            except TooManyRequests:
                self.send_response(429)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'status': 'error',
                    'message': 'Rate limited. Try again later.',
                    'video_id': video_id
                }).encode())

        except Exception as e:
            print(f'❌ Error: {str(e)}')
            import traceback
            traceback.print_exc()
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'status': 'error',
                'message': str(e)
            }).encode())


def run_server(port=8080):
    server_address = ('', port)
    httpd = HTTPServer(server_address, TranscriptHandler)
    print(f'🚀 YouTube Transcript Extractor v2.0 running on port {port}')
    print('📚 Using youtube-transcript-api (fast, no auth required)')
    print('✅ Ready to process requests...')
    httpd.serve_forever()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    run_server(port)
