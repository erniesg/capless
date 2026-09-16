"""
Shared extraction library for YouTube and Hansard moment extraction.
Consolidates common functions to reduce duplication.
"""

from .extraction_common import (
    load_credentials,
    strip_html,
    fetch_from_r2,
    upload_to_r2,
    extract_moments_with_retry,
)

from .chunking import (
    chunk_by_sections,
    chunk_by_time,
)

__all__ = [
    'load_credentials',
    'strip_html',
    'fetch_from_r2',
    'upload_to_r2',
    'extract_moments_with_retry',
    'chunk_by_sections',
    'chunk_by_time',
]
