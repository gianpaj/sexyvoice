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

import matplotlib

matplotlib.use("Agg")

import numpy as np
from matplotlib import pyplot as plt
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.collections import LineCollection
from moviepy import AudioFileClip, VideoClip


@dataclass(frozen=True)
class WaveformStyle:
    """Visual style configuration for the waveform renderer."""

    background: tuple[str, str]
    line: str
    accent: str
    grid: str
    title: str
    glow: bool = False
    gradient_start: str | None = None
    gradient_end: str | None = None


STYLES: dict[str, WaveformStyle] = {
    "neon": WaveformStyle(
        background=("#0b1224", "#111827"),
        line="#8b5cf6",
        accent="#a855f7",
        grid="#1f2937",
        title="#e0e7ff",
        glow=True,
        gradient_start="#8B66FF",
        gradient_end="#FF3366",
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
        gradient_start="#f59e0b",
        gradient_end="#f97316",
    ),
    "forest": WaveformStyle(
        background=("#0f172a", "#0b3b2e"),
        line="#22c55e",
        accent="#10b981",
        grid="#0b3b2e",
        title="#ecfdf3",
        gradient_start="#22c55e",
        gradient_end="#10b981",
    ),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a stylized waveform video from an audio file.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "audio", help="Path to the input audio file (any format ffmpeg supports)"
    )
    parser.add_argument(
        "output", help="Path to the output video file (e.g., output.mp4)"
    )
    parser.add_argument(
        "--style",
        choices=sorted(STYLES),
        default="neon",
        help="Color and layout preset to use",
    )
    parser.add_argument(
        "--fps", type=int, default=30, help="Frames per second for the video"
    )
    parser.add_argument("--width", type=int, default=1280, help="Video width in pixels")
    parser.add_argument(
        "--height", type=int, default=720, help="Video height in pixels"
    )
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
        raise ValueError(
            "Decoded audio is empty. Check the input file path and format."
        )
    return audio


def downsample_waveform(waveform: np.ndarray, target_points: int) -> np.ndarray:
    """Reduce waveform resolution to speed up rendering without losing shape."""

    if waveform.size <= target_points:
        return waveform

    indices = np.linspace(0, waveform.size - 1, target_points, dtype=np.int64)
    return waveform[indices]


class WaveformRenderer:
    """Render waveform frames with modern styling and motion cues."""

    # Layout dimensions as fractions of figure size [left, bottom, width, height]
    MAIN_AXES_RECT = [0.05, 0.1, 0.9, 0.8]
    TITLE_X = 0.05
    TITLE_Y = 0.9

    def __init__(
        self,
        times: np.ndarray,
        waveform: np.ndarray,
        style: WaveformStyle,
        resolution: tuple[int, int],
        title: str | None,
    ) -> None:
        self.times = times
        self.waveform = waveform
        self.style = style
        self.width, self.height = resolution
        self.title = title
        self.dpi = 100
        self.fig = plt.figure(
            figsize=(self.width / self.dpi, self.height / self.dpi), dpi=self.dpi
        )
        self.canvas = FigureCanvasAgg(self.fig)
        self.ax = self.fig.add_axes(self.MAIN_AXES_RECT)
        self.fig.patch.set_facecolor(self.style.background[0])
        self.ax.set_xlim(0, times[-1])
        self.ax.set_ylim(-1.1, 1.1)
        self.ax.axis("off")
        self._setup_background()
        self._setup_waveform_layers()
        self._setup_progress_elements()
        if title:
            self._setup_title()

    def _setup_background(self) -> None:
        for spine in self.ax.spines.values():
            spine.set_visible(False)
        self.ax.set_facecolor(self.style.background[0])

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

        # Setup progress line with gradient if available
        if self.style.gradient_start and self.style.gradient_end:
            self.progress_line = None
            self.progress_glow = None
        else:
            (self.progress_line,) = self.ax.plot(
                [],
                [],
                color=self.style.line,
                linewidth=2.8,
                zorder=4,
                solid_capstyle="round",
            )
            if self.style.glow:
                (self.progress_glow,) = self.ax.plot(
                    [],
                    [],
                    color=self.style.accent,
                    linewidth=9,
                    alpha=0.06,
                    zorder=3,
                    solid_capstyle="round",
                )
            else:
                self.progress_glow = None

    def _setup_progress_elements(self) -> None:
        self.playhead = self.ax.axvline(
            0, color=self.style.accent, linewidth=1.5, alpha=0.8, zorder=5
        )

    def _setup_title(self) -> None:
        self.fig.text(
            self.TITLE_X,
            self.TITLE_Y,
            self.title,
            ha="left",
            va="center",
            color=self.style.title,
            fontsize=18,
            fontweight="bold",
        )

    def make_frame(self, t: float) -> np.ndarray:
        idx = int(np.searchsorted(self.times, t, side="right"))
        idx = min(idx, self.waveform.size)

        if self.progress_line is not None:
            self.progress_line.set_data(self.times[:idx], self.waveform[:idx])
            if self.progress_glow is not None:
                self.progress_glow.set_data(self.times[:idx], self.waveform[:idx])
        else:
            # Draw gradient waveform
            self._draw_gradient_waveform(idx)

        clamped_t = min(t, self.times[-1])
        self.playhead.set_xdata([clamped_t, clamped_t])

        self.canvas.draw()
        frame = np.asarray(self.canvas.buffer_rgba())[:, :, :3]
        return frame

    def _draw_gradient_waveform(self, idx: int) -> None:
        """Draw waveform with gradient color based on position."""
        if idx < 2:
            return

        times = self.times[:idx]
        waveform = self.waveform[:idx]

        # Create line segments
        points = np.array([times, waveform]).T.reshape(-1, 1, 2)
        segments = np.concatenate([points[:-1], points[1:]], axis=1)

        # Create colors with gradient
        colors = self._get_gradient_colors(idx)

        # Remove any existing gradient collections
        for artist in self.ax.collections[:]:
            artist.remove()

        # Add new line collection with gradient
        lc = LineCollection(segments, colors=colors, linewidth=2.8, zorder=4)
        self.ax.add_collection(lc)

    def _get_gradient_colors(self, idx: int) -> list:
        """Generate gradient colors from start to end."""
        if idx < 1:
            return []

        # Parse hex colors to RGB tuples
        start_rgb = self._hex_to_rgb(self.style.gradient_start)
        end_rgb = self._hex_to_rgb(self.style.gradient_end)

        colors = []
        for i in range(idx - 1):
            # Interpolate between start and end colors
            t = i / max(idx - 2, 1)
            r = start_rgb[0] * (1 - t) + end_rgb[0] * t
            g = start_rgb[1] * (1 - t) + end_rgb[1] * t
            b = start_rgb[2] * (1 - t) + end_rgb[2] * t
            colors.append((r / 255.0, g / 255.0, b / 255.0, 1.0))

        return colors

    def _hex_to_rgb(self, hex_color: str) -> tuple[int, int, int]:
        """Convert hex color to RGB tuple."""
        hex_color = hex_color.lstrip("#")
        return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))


def main() -> None:
    args = parse_args()
    style = STYLES[args.style]

    audio_path = Path(args.audio)
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    output_path = Path(args.output)
    if output_path.exists():
        response = input(
            f"Output file '{args.output}' already exists. Overwrite (Y/n): "
        )
        if response.lower() == "n":
            print("Cancelled.")
            return

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
    video_clip = video_clip.with_audio(audio_clip)
    video_clip.write_videofile(
        args.output,
        fps=args.fps,
        codec="libx264",
        audio_codec="aac",
        preset=args.preset,
    )


if __name__ == "__main__":
    main()
