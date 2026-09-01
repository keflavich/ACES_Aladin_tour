#!/usr/bin/env python3
"""Record an Aladin Lite tour to a video file for use as a screensaver.

The live tour needs a network connection to fetch HiPS tiles.  For machines
that may be offline (conference booths, travelling laptops), record the tour
once here and play the resulting MP4 with any video screensaver.

Usage
-----
    pip install playwright
    playwright install chromium

    python capture_tour.py --seconds 420 --out tour_4k.mp4

Requires ``ffmpeg`` on PATH.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

DEFAULT_URL = (
    "https://data.rc.ufl.edu/pub/adamginsburg/ACES_Aladin_tour/"
    "research_group_tour.html?kiosk=true&speed=1"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default=DEFAULT_URL,
                        help="tour URL; keep kiosk=true so no controls are recorded")
    parser.add_argument("--out", default="tour.mp4", help="output video file")
    parser.add_argument("--seconds", type=float, default=420.0,
                        help="how long to record (one full loop of the tour)")
    parser.add_argument("--fps", type=int, default=15,
                        help="capture frame rate; the tour pans slowly, 15 is plenty")
    parser.add_argument("--size", default="3840x2160", help="capture size, WxH")
    parser.add_argument("--settle", type=float, default=20.0,
                        help="seconds to wait for the first tiles before recording")
    parser.add_argument("--keep-frames", action="store_true",
                        help="do not delete the PNG frames after encoding")
    return parser.parse_args()


def check_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        sys.exit("ffmpeg not found on PATH; install it and re-run.")


def capture_frames(url: str, frame_dir: Path, width: int, height: int,
                   fps: int, seconds: float, settle: float) -> int:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("playwright not installed; run: pip install playwright && playwright install chromium")

    interval = 1.0 / fps
    n_frames = int(seconds * fps)
    captured = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--hide-scrollbars", "--mute-audio"])
        page = browser.new_page(viewport={"width": width, "height": height},
                                device_scale_factor=1)
        print(f"loading {url}")
        page.goto(url, wait_until="domcontentloaded")

        # Let Aladin initialize and pull the first layer of tiles.
        print(f"settling for {settle:.0f}s so the first waypoint is fully drawn")
        page.wait_for_timeout(int(settle * 1000))

        print(f"capturing {n_frames} frames at {fps} fps ({seconds:.0f}s)")
        start = time.monotonic()
        for i in range(n_frames):
            page.screenshot(path=str(frame_dir / f"frame_{i:06d}.png"), animations="allow")
            captured += 1
            if i % (fps * 10) == 0:
                print(f"  {i / fps:6.1f}s / {seconds:.0f}s", flush=True)
            # Keep wall-clock pace so the recording matches the tour's own timing.
            target = start + (i + 1) * interval
            drift = target - time.monotonic()
            if drift > 0:
                page.wait_for_timeout(int(drift * 1000))

        browser.close()

    return captured


def encode(frame_dir: Path, out: Path, fps: int) -> None:
    print(f"encoding {out}")
    subprocess.run(
        ["ffmpeg", "-y", "-framerate", str(fps),
         "-i", str(frame_dir / "frame_%06d.png"),
         "-c:v", "libx264", "-preset", "slow", "-crf", "20",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)],
        check=True,
    )


def main() -> None:
    args = parse_args()
    check_ffmpeg()

    try:
        width, height = (int(v) for v in args.size.lower().split("x"))
    except ValueError:
        sys.exit(f"--size must look like 3840x2160, got {args.size!r}")

    if "kiosk=true" not in args.url:
        print("warning: URL has no kiosk=true, so buttons will be recorded too",
              file=sys.stderr)

    frame_dir = Path(tempfile.mkdtemp(prefix="tour_frames_"))
    try:
        n = capture_frames(args.url, frame_dir, width, height,
                           args.fps, args.seconds, args.settle)
        print(f"captured {n} frames into {frame_dir}")
        encode(frame_dir, Path(args.out), args.fps)
    finally:
        if args.keep_frames:
            print(f"frames kept in {frame_dir}")
        else:
            shutil.rmtree(frame_dir, ignore_errors=True)

    print(f"done: {args.out}")


if __name__ == "__main__":
    main()
