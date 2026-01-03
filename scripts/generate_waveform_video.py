#!/usr/bin/env python3
"""Create a modern waveform video from an audio file with selectable styles.

This script offers a more design-forward alternative to the classic waveform
visualizer. It renders a progress-aware waveform with gradients, glow effects,
progress bars, and optional titles, then muxes it with the original audio into a
single video file.

Examples
--------
# Neon gradient waveform at 1080p, 60 fps
python scripts/generate_waveform_video.py input.wav output.mp4 --style neon --fps 60 --title "Deep Night Session"

# Clean light mode preview at 720p
python scripts/generate_waveform_video.py song.mp3 preview.mp4 --style minimal --width 1280 --height 720

Requirements
------------
- ffmpeg (installed on the system and available on PATH)
- Python packages listed in scripts/requirements.txt
"""

from __future__ import annotations

import argparse
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Tuple

import matplotlib

matplotlib.use("Agg")

import numpy as np
from matplotlib import pyplot as plt
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.patches import Rectangle
from moviepy.editor import AudioFileClip, VideoClip


@dataclass(frozen=True)
class WaveformStyle:
    """Visual style configuration for the waveform renderer."""

    background: Tuple[str, str]
    line: str
    accent: str
    grid: str
    title: str
    glow: bool = False


STYLES: dict[str, WaveformStyle] = {
    "neon": WaveformStyle(
        background=("#0b1224", "#111827"),
        line="#8b5cf6",
        accent="#a855f7",
        grid="#1f2937",
        title="#e0e7ff",
        glow=True,
    ),
    "minimal": WaveformStyle(
        background=("#f5f7fb", "#e5e7eb"),
        line="#111827",
        accent="#2563eb",
        grid="#d1d5db",
        title="#111827",
    ),
    "sunset": WaveformStyle(
        background=("#0f172a", "#312e81"),
        line="#f59e0b",
        accent="#f97316",
        grid="#1f2937",
        title="#f8fafc",
        glow=True,
    ),
    "forest": WaveformStyle(
        background=("#0f172a", "#0b3b2e"),
        line="#22c55e",
        accent="#10b981",
        grid="#0b3b2e",
        title="#ecfdf3",
    ),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a stylized waveform video from an audio file.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("audio", help="Path to the input audio file (any format ffmpeg supports)")
    parser.add_argument("output", help="Path to the output video file (e.g., output.mp4)")
    parser.add_argument(
        "--style",
        choices=sorted(STYLES),
        default="neon",
        help="Color and layout preset to use",
    )
    parser.add_argument("--fps", type=int, default=30, help="Frames per second for the video")
    parser.add_argument("--width", type=int, default=1920, help="Video width in pixels")
    parser.add_argument("--height", type=int, default=1080, help="Video height in pixels")
    parser.add_argument(
        "--sample-rate",
        type=int,
        default=44_100,
        help="Sample rate to decode audio for waveform analysis",
    )
    parser.add_argument(
        "--title",
        default=None,
        help="Optional title text to render above the waveform",
    )
    parser.add_argument(
        "--preset",
        default="medium",
        help="ffmpeg x264 preset passed to MoviePy",
    )
    return parser.parse_args()


def decode_audio(audio_path: str, sample_rate: int) -> np.ndarray:
    """Decode audio to a mono float waveform using ffmpeg.

    This keeps dependencies light while allowing almost any audio format to be
    processed, as long as ffmpeg can decode it.
    """

    command = [
        "ffmpeg",
        "-i",
        audio_path,
        "-f",
        "f32le",
        "-acodec",
        "pcm_f32le",
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "-",
    ]

    process = subprocess.run(
        command, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )

    if process.returncode != 0:
        raise RuntimeError(
            "ffmpeg failed to decode the audio file.\n" + process.stderr.decode()
        )

    audio = np.frombuffer(process.stdout, dtype=np.float32)
    if audio.size == 0:
        raise ValueError("Decoded audio is empty. Check the input file path and format.")
    return audio


def downsample_waveform(waveform: np.ndarray, target_points: int) -> np.ndarray:
    """Reduce waveform resolution to speed up rendering without losing shape."""

    if waveform.size <= target_points:
        return waveform

    indices = np.linspace(0, waveform.size - 1, target_points, dtype=np.int64)
    return waveform[indices]


class WaveformRenderer:
    """Render waveform frames with modern styling and motion cues."""

    def __init__(
        self,
        times: np.ndarray,
        waveform: np.ndarray,
        style: WaveformStyle,
        resolution: Tuple[int, int],
        title: str | None,
    ) -> None:
        self.times = times
        self.waveform = waveform
        self.style = style
        self.width, self.height = resolution
        self.title = title
        self.dpi = 100
        self.fig = plt.figure(figsize=(self.width / self.dpi, self.height / self.dpi), dpi=self.dpi)
        self.canvas = FigureCanvasAgg(self.fig)
        self.ax = self.fig.add_axes([0.05, 0.18, 0.9, 0.62])
        self.ax.set_xlim(0, times[-1])
        self.ax.set_ylim(-1.1, 1.1)
        self.ax.axis("off")
        self._setup_background()
        self._setup_waveform_layers()
        self._setup_progress_elements()
        if title:
            self._setup_title()

    def _setup_background(self) -> None:
        gradient = np.linspace(0, 1, 256)
        gradient = np.vstack((gradient, gradient))
        self.ax.imshow(
            gradient,
            aspect="auto",
            cmap=matplotlib.colors.LinearSegmentedColormap.from_list(
                "bg", [self.style.background[0], self.style.background[1]]
            ),
            extent=(0, self.times[-1], -1.1, 1.1),
            origin="lower",
            zorder=0,
        )
        for spine in self.ax.spines.values():
            spine.set_visible(False)
        self.ax.set_facecolor("none")

    def _setup_waveform_layers(self) -> None:
        shadow_width = 6 if self.style.glow else 0
        if shadow_width:
            self.ax.plot(
                self.times,
                self.waveform,
                color=self.style.line,
                linewidth=shadow_width,
                alpha=0.12,
                solid_capstyle="round",
                zorder=1,
            )
        self.ax.plot(
            self.times,
            self.waveform,
            color=self.style.grid,
            linewidth=2,
            alpha=0.35,
            zorder=2,
        )
        self.progress_line, = self.ax.plot(
            [], [], color=self.style.line, linewidth=2.8, zorder=4, solid_capstyle="round"
        )
        if self.style.glow:
            self.progress_glow, = self.ax.plot(
                [], [], color=self.style.accent, linewidth=9, alpha=0.06, zorder=3, solid_capstyle="round"
            )
        else:
            self.progress_glow = None

    def _setup_progress_elements(self) -> None:
        self.progress_ax = self.fig.add_axes([0.05, 0.08, 0.9, 0.06])
        self.progress_ax.set_xlim(0, self.times[-1])
        self.progress_ax.set_ylim(0, 1)
        self.progress_ax.axis("off")
        self.progress_ax.set_facecolor("none")
        self.progress_bg = Rectangle((0, 0.35), self.times[-1], 0.3, color=self.style.grid, alpha=0.3)
        self.progress_fill = Rectangle((0, 0.35), 0, 0.3, color=self.style.accent, alpha=0.9)
        self.progress_ax.add_patch(self.progress_bg)
        self.progress_ax.add_patch(self.progress_fill)
        self.playhead = self.ax.axvline(0, color=self.style.accent, linewidth=1.5, alpha=0.8, zorder=5)
        self.time_label = self.fig.text(
            0.95,
            0.92,
            "0:00",
            ha="right",
            va="center",
            color=self.style.title,
            fontsize=12,
            family="DejaVu Sans",
        )

    def _setup_title(self) -> None:
        self.fig.text(
            0.05,
            0.9,
            self.title,
            ha="left",
            va="center",
            color=self.style.title,
            fontsize=18,
            fontweight="bold",
            family="DejaVu Sans",
        )

    def _format_timestamp(self, seconds: float) -> str:
        minutes = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{minutes}:{secs:02d}"

    def make_frame(self, t: float) -> np.ndarray:
        idx = int(np.searchsorted(self.times, t, side="right"))
        idx = min(idx, self.waveform.size)

        self.progress_line.set_data(self.times[:idx], self.waveform[:idx])
        if self.progress_glow is not None:
            self.progress_glow.set_data(self.times[:idx], self.waveform[:idx])

        clamped_t = min(t, self.times[-1])
        self.playhead.set_xdata([clamped_t, clamped_t])
        self.progress_fill.set_width(clamped_t)
        self.time_label.set_text(self._format_timestamp(t))

        self.canvas.draw()
        frame = np.asarray(self.canvas.buffer_rgba())[:, :, :3]
        return frame


def main() -> None:
    args = parse_args()
    style = STYLES[args.style]

    audio_path = Path(args.audio)
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    waveform = decode_audio(str(audio_path), args.sample_rate)
    peak = np.max(np.abs(waveform))
    if peak == 0:
        raise ValueError("The decoded audio appears to be silent.")
    waveform = waveform / peak

    audio_clip = AudioFileClip(str(audio_path))
    duration = audio_clip.duration

    downsampled = downsample_waveform(waveform, target_points=6000)
    times = np.linspace(0, duration, downsampled.size)

    renderer = WaveformRenderer(
        times=times,
        waveform=downsampled,
        style=style,
        resolution=(args.width, args.height),
        title=args.title,
    )

    video_clip = VideoClip(renderer.make_frame, duration=duration)
    video_clip = video_clip.set_audio(audio_clip)
    video_clip.write_videofile(
        args.output,
        fps=args.fps,
        codec="libx264",
        audio_codec="aac",
        preset=args.preset,
        threads=4,
    )


if __name__ == "__main__":
    main()
