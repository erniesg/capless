"""
Capless Parliament Video Transcription with Whisper
Two-step workflow: Extract audio → Transcribe with word-level timestamps
"""
import modal
from pathlib import Path
import subprocess
import json
from datetime import datetime

# Define Modal app with cleaner name
app = modal.App("capless-api")

# Docker image with ffmpeg and faster-whisper
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "faster-whisper==1.0.1",
        "boto3",
        "requests",
    )
)

# R2 bucket mount for audio storage
r2_bucket = modal.CloudBucketMount(
    bucket_name="capless-preview",
    bucket_endpoint_url="https://5b25778cf6d9821373d913f5236e1606.r2.cloudflarestorage.com",
    secret=modal.Secret.from_name("r2-credentials"),
    read_only=False,
)

# ============================================================================
# STEP 1: Extract Audio from Video
# ============================================================================

@app.function(
    image=image,
    cloud_bucket_mounts={"/r2": r2_bucket},
    timeout=3600,
)
def extract_audio(session_date: str) -> dict:
    """Extract audio from MP4 video in R2 and save back to R2"""
    print(f"[Audio Extraction] Starting for session: {session_date}")

    video_path = f"/r2/youtube/videos/{session_date}.mp4"
    audio_path = f"/r2/youtube/audio/{session_date}.mp3"

    if not Path(video_path).exists():
        raise FileNotFoundError(f"Video not found: {video_path}")

    print(f"[Audio Extraction] Video found: {video_path}")

    # Extract audio (64kbps for speech, 16kHz sample rate)
    cmd = [
        "ffmpeg",
        "-i", video_path,
        "-vn",
        "-acodec", "libmp3lame",
        "-b:a", "64k",
        "-ar", "16000",
        "-y",
        audio_path
    ]

    print(f"[Audio Extraction] Running ffmpeg...")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr}")

    audio_size = Path(audio_path).stat().st_size

    # Get duration
    duration_cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        audio_path
    ]
    duration_result = subprocess.run(duration_cmd, capture_output=True, text=True)
    duration_seconds = float(duration_result.stdout.strip())

    print(f"[Audio Extraction] Complete! Size: {audio_size / 1024 / 1024:.2f} MB, Duration: {duration_seconds / 60:.2f} min")

    return {
        "session_date": session_date,
        "audio_r2_key": f"youtube/audio/{session_date}.mp3",
        "audio_size_mb": round(audio_size / 1024 / 1024, 2),
        "duration_minutes": round(duration_seconds / 60, 2),
        "extracted_at": datetime.now().isoformat(),
    }


# ============================================================================
# STEP 2: Transcribe Audio with Faster-Whisper (Word-Level Timestamps)
# ============================================================================

@app.function(
    image=image,
    gpu="T4",
    cloud_bucket_mounts={"/r2": r2_bucket},
    timeout=3600,
)
def transcribe_audio(session_date: str) -> dict:
    """Transcribe audio with faster-whisper and word-level timestamps"""
    from faster_whisper import WhisperModel

    print(f"[Transcription] Starting for session: {session_date}")

    audio_path = f"/r2/youtube/audio/{session_date}.mp3"
    transcript_path = f"/r2/youtube/transcripts-whisper/{session_date}.vtt"
    json_path = f"/r2/youtube/transcripts-whisper/{session_date}.json"

    if not Path(audio_path).exists():
        raise FileNotFoundError(f"Audio not found: {audio_path}")

    print(f"[Transcription] Loading Whisper large-v3 model...")
    model = WhisperModel("large-v3", device="cuda", compute_type="float16")

    print("[Transcription] Transcribing with word-level timestamps...")
    segments, info = model.transcribe(
        str(audio_path),
        word_timestamps=True,
        language="en",
        beam_size=5,
        vad_filter=True,
    )

    # Convert to VTT format
    vtt_lines = ["WEBVTT\n"]
    json_data = {
        "session_date": session_date,
        "language": info.language,
        "duration": info.duration,
        "segments": []
    }

    segment_count = 0
    word_count = 0

    for segment in segments:
        segment_count += 1
        segment_data = {
            "id": segment.id,
            "start": segment.start,
            "end": segment.end,
            "text": segment.text.strip(),
            "words": []
        }

        vtt_lines.append(f"\n{format_timestamp(segment.start)} --> {format_timestamp(segment.end)}")
        vtt_lines.append(segment.text.strip())

        if segment.words:
            for word in segment.words:
                word_count += 1
                segment_data["words"].append({
                    "word": word.word,
                    "start": word.start,
                    "end": word.end,
                    "probability": word.probability
                })

        json_data["segments"].append(segment_data)

    # Write files
    Path(transcript_path).parent.mkdir(parents=True, exist_ok=True)
    Path(transcript_path).write_text("\n".join(vtt_lines))
    Path(json_path).write_text(json.dumps(json_data, indent=2))

    print(f"[Transcription] Complete! Segments: {segment_count}, Words: {word_count}")

    return {
        "session_date": session_date,
        "transcript_r2_key": f"youtube/transcripts-whisper/{session_date}.vtt",
        "json_r2_key": f"youtube/transcripts-whisper/{session_date}.json",
        "segment_count": segment_count,
        "word_count": word_count,
        "duration_minutes": round(info.duration / 60, 2),
        "language": info.language,
        "transcribed_at": datetime.now().isoformat(),
    }


def format_timestamp(seconds: float) -> str:
    """Format seconds to VTT timestamp (HH:MM:SS.mmm)"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"


# ============================================================================
# Protected Web Endpoint: Full Pipeline
# ============================================================================

@app.function(image=image)
@modal.fastapi_endpoint(
    method="POST",
    label="transcribe",  # Clean endpoint name
    requires_proxy_auth=True,  # Requires Modal-Key and Modal-Secret headers
)
def transcribe_session(data: dict) -> dict:
    """
    Protected web endpoint for full transcription pipeline

    POST body:
    {
        "session_date": "2024-10-15",
        "skip_audio_extraction": false
    }

    Authentication: Modal proxy auth (Modal-Key and Modal-Secret headers)
    """
    session_date = data.get("session_date")
    skip_audio = data.get("skip_audio_extraction", False)

    if not session_date:
        return {"error": "session_date required"}, 400

    print(f"[Pipeline] Starting for session: {session_date}")
    result = {"session_date": session_date, "steps": {}}

    try:
        # Step 1: Extract audio (if not skipped)
        if not skip_audio:
            print("[Pipeline] Step 1: Extracting audio...")
            audio_result = extract_audio.remote(session_date)
            result["steps"]["audio_extraction"] = audio_result
            print(f"[Pipeline] Audio extracted: {audio_result['audio_r2_key']}")
        else:
            print("[Pipeline] Skipping audio extraction")
            result["steps"]["audio_extraction"] = {"skipped": True}

        # Step 2: Transcribe
        print("[Pipeline] Step 2: Transcribing with Whisper...")
        transcript_result = transcribe_audio.remote(session_date)
        result["steps"]["transcription"] = transcript_result
        print(f"[Pipeline] Transcription complete: {transcript_result['transcript_r2_key']}")

        result["status"] = "success"
        return result

    except Exception as e:
        print(f"[Pipeline] Error: {str(e)}")
        result["status"] = "error"
        result["error"] = str(e)
        return result, 500


# ============================================================================
# Local Test Entrypoint
# ============================================================================

@app.local_entrypoint()
def test():
    """Test with one session"""
    session_date = "2024-10-15"

    print(f"=== Testing transcription pipeline for {session_date} ===\n")

    # Step 1: Extract audio
    print("STEP 1: Extracting audio...")
    audio_result = extract_audio.remote(session_date)
    print(f"✓ Audio extracted: {json.dumps(audio_result, indent=2)}\n")

    # Step 2: Transcribe
    print("STEP 2: Transcribing...")
    transcript_result = transcribe_audio.remote(session_date)
    print(f"✓ Transcription complete: {json.dumps(transcript_result, indent=2)}\n")

    print("=== Pipeline test complete! ===")
