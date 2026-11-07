"""Offline renders of VFL's most-used UI cues, rebuilt as layered physical sounds.

Each cue = transient + body + tail (room). Run: python3 scripts/sfx/render.py [seed]
Writes 48 kHz 24-bit stereo WAVs to scripts/sfx/out/.
"""
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
OUT = Path(__file__).parent / "out"
rng = np.random.default_rng(int(sys.argv[1]) if len(sys.argv) > 1 else 7)


def jit(x, amt=0.04):
    """Micro-variation: +/- amt relative."""
    return x * (1 + rng.uniform(-amt, amt))


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def env(dur, attack, decay_tau):
    """Fast exponential attack, exponential (not linear) release."""
    t = t_axis(dur)
    a = 1 - np.exp(-t / max(attack, 1e-4) * 5)
    return a * np.exp(-t / decay_tau)


def filt(x, kind, f, order=2):
    f = np.clip(np.atleast_1d(f), 20, SR / 2 - 100)
    return sosfilt(butter(order, f if len(f) > 1 else f[0], kind, fs=SR, output="sos"), x)


def swept_noise(dur, f0, f1, q=1.5, pink=True):
    """Noise through a bandpass whose centre glides exponentially f0->f1 (block-wise)."""
    n = rng.standard_normal(int(dur * SR))
    if pink:  # cheap pink: 1st-order lowpass blend
        n = 0.5 * n + filt(n, "lowpass", 800, 1) * 2
    out = np.zeros_like(n)
    blk = 256
    zi = None
    for i in range(0, len(n), blk):
        fc = f0 * (f1 / f0) ** (i / len(n))
        bw = fc / q
        sos = butter(2, [max(fc - bw / 2, 30), min(fc + bw / 2, SR / 2 - 200)], "bandpass", fs=SR, output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        out[i:i + blk], zi = sosfilt(sos, n[i:i + blk], zi=zi)
    return out / (np.abs(out).max() + 1e-9)


def modal(dur, f, ratios, decays, amps, detune=0.006):
    """Modal resonator bank (struck object): inharmonic partials, each its own exp decay."""
    t = t_axis(dur)
    s = np.zeros_like(t)
    for r, d, a in zip(ratios, decays, amps):
        fr = jit(f * r, detune)
        s += a * np.sin(2 * np.pi * fr * t + rng.uniform(0, 6.28)) * np.exp(-t / d)
    return s


def fm(dur, fc, ratio, index, index_tau):
    """FM tone whose brightness (index) decays: the material 'bloom' of brass/metal."""
    t = t_axis(dur)
    i = index * np.exp(-t / index_tau)
    return np.sin(2 * np.pi * fc * t + i * np.sin(2 * np.pi * fc * ratio * t))


def thump(dur, f0, f1, tau):
    """Pitch-dropping sub impact with a little soft saturation."""
    t = t_axis(dur)
    f = f1 + (f0 - f1) * np.exp(-t / (tau * 0.4))
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.tanh(1.8 * np.sin(ph)) * np.exp(-t / tau)


def room(dur=0.6, tau=0.12, damp=4000):
    """Small-arena IR: stereo decorrelated noise, exp decay, darkening."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((n, 2)) * np.exp(-t / tau)[:, None]
    ir = np.stack([filt(ir[:, c], "lowpass", damp) for c in range(2)], 1)
    ir[: int(0.012 * SR)] *= 0.2  # predelay feel
    return ir / np.sqrt((ir ** 2).sum(0))


def mix(layers, total, wet=0.18, ir=None):
    """layers: (signal, gain, start_sec, pan). Returns stereo with room tail."""
    n = int(total * SR)
    dry = np.zeros((n, 2))
    for sig, g, start, pan in layers:
        i = int(start * SR)
        seg = sig[: n - i] * g
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        dry[i:i + len(seg), 0] += seg * l
        dry[i:i + len(seg), 1] += seg * r
    ir = room() if ir is None else ir
    wetsig = np.stack([fftconvolve(dry[:, c], ir[:, c])[:n] for c in range(2)], 1)
    y = dry + wet * 0.35 * wetsig  # dry-forward
    y = filt(y.T, "highpass", 28).T  # kill DC / sub rumble
    fade = np.exp(-np.maximum(0, t_axis(total) - (total - 0.05)) / 0.012)  # exp tail fade
    y *= fade[:, None]
    return y / (np.abs(y).max() + 1e-9) * 0.89  # ~-1 dBFS


# ---------------------------------------------------------------- cues

def select():
    """Broadcast desk confirm: felt-tipped knuckle tap on a lacquered desk, a
    short hollow wood knock, and a tiny tick of glassy air in a tight room."""
    click = filt(rng.standard_normal(int(0.006 * SR)), "highpass", jit(3800)) * env(0.006, 0.0003, 0.0012)
    wood = modal(0.18, jit(212), [1, 2.32, 4.25, 6.6], [0.05, 0.026, 0.012, 0.007], [1, 0.5, 0.28, 0.12])
    sub = thump(0.14, 150, 62, 0.045)
    air = swept_noise(0.05, 1800, 900, q=2) * env(0.05, 0.002, 0.012)
    return mix([(click, 0.55, 0, 0), (wood, 0.6, 0.001, 0), (sub, 0.75, 0, 0), (air, 0.12, 0.002, 0)], 0.42, wet=0.12)


def drop():
    """A card slapped down on a felt-over-wood broadcast table: paper slap,
    heavy dull body thud, a low table resonance ringing under it."""
    slap = swept_noise(0.05, 2600, 700, q=1.1) * env(0.05, 0.0006, 0.011)
    body = thump(0.25, 140, 44, 0.08)
    table = modal(0.5, jit(96), [1, 1.58, 2.71, 3.9], [0.16, 0.09, 0.05, 0.025], [1, 0.45, 0.25, 0.1])
    felt = filt(rng.standard_normal(int(0.09 * SR)), "lowpass", 900) * env(0.09, 0.003, 0.025)
    return mix([(slap, 0.6, 0, 0), (body, 0.9, 0.002, 0), (table, 0.35, 0.003, 0), (felt, 0.3, 0.004, 0)], 0.7, wet=0.15)


def flip():
    """Stiff cardstock flipped fast: a rising air whip that pans across, the
    snap of the card's edge, then a soft landing tick."""
    whip = swept_noise(0.14, 450, 3400, q=1.3) * env(0.14, 0.05, 0.05)
    snap = filt(rng.standard_normal(int(0.01 * SR)), "bandpass", [2500, 7000]) * env(0.01, 0.0003, 0.002)
    card = modal(0.08, jit(1150), [1, 2.7, 5.1], [0.012, 0.007, 0.004], [1, 0.4, 0.2])
    land = thump(0.12, 170, 70, 0.035)
    n = len(whip)
    pans = np.linspace(-0.5, 0.5, n)
    lw = whip * np.cos((pans + 1) * np.pi / 4) * 1.4
    rw = whip * np.sin((pans + 1) * np.pi / 4) * 1.4
    y = mix([(snap, 0.5, 0.11, 0.3), (card, 0.25, 0.11, 0.3), (land, 0.55, 0.118, 0.2)], 0.55, wet=0.2)
    y[:n, 0] += lw * 0.35
    y[:n, 1] += rw * 0.35
    return y / np.abs(y).max() * 0.89


def deal():
    """A card skimming off the deck: a quick friction slide (paper on paper),
    then a light tap as it settles."""
    slide = swept_noise(0.07, 900, 2600, q=1.2) * env(0.07, 0.015, 0.025)
    grain = slide * (1 + 0.6 * np.sign(rng.standard_normal(len(slide))) * (rng.random(len(slide)) < 0.02))
    tap = modal(0.07, jit(640), [1, 2.4, 4.9], [0.014, 0.008, 0.004], [1, 0.4, 0.2])
    sub = thump(0.08, 160, 80, 0.025)
    return mix([(grain, 0.6, 0, -0.15), (tap, 0.4, 0.06, 0.1), (sub, 0.45, 0.06, 0.1)], 0.35, wet=0.14)


def sign():
    """Roster lock-in: a rubber stamp slammed into paper on a heavy desk, then
    a brass fifth (FM, bright attack mellowing) blooms into the arena."""
    hit = filt(rng.standard_normal(int(0.012 * SR)), "bandpass", [900, 5000]) * env(0.012, 0.0004, 0.003)
    body = thump(0.35, 135, 40, 0.11)
    desk = modal(0.4, jit(118), [1, 1.71, 2.93], [0.12, 0.06, 0.03], [1, 0.4, 0.2])
    d = 0.6
    brass = (fm(d, jit(293.66, 0.005), 1, 3.2, 0.12) + 0.8 * fm(d, jit(440, 0.005), 1, 2.6, 0.14))
    brass = filt(brass, "lowpass", 3200) * env(d, 0.02, 0.2)
    return mix([(hit, 0.5, 0, 0), (body, 0.9, 0.001, 0), (desk, 0.35, 0.002, 0), (brass, 0.28, 0.03, 0)], 1.1, wet=0.3,
               ir=room(0.8, 0.18))


def reveal():
    """Spotlight card reveal: a breathy riser swelling up, a deep low boom on
    the reveal, then a shimmering metallic chord (bell partials) ringing out."""
    rise = swept_noise(0.35, 300, 4200, q=1.0) * (t_axis(0.35) / 0.35) ** 2.2
    boom = thump(0.6, 110, 38, 0.2)
    chord = sum(modal(1.3, f, [1, 2.0, 2.76, 4.07], [0.5, 0.3, 0.16, 0.08], [1, 0.4, 0.25, 0.1])
                for f in (293.66, 440, 587.33, 659.25))
    sparkle = sum(np.pad(modal(0.25, jit(3500, 0.2), [1, 2.76], [0.05, 0.02], [1, 0.4]), (int(k * 0.045 * SR), int(0.5 * SR)))[:int(0.5 * SR)]
                  for k in range(5))
    return mix([(rise, 0.35, 0, 0), (boom, 0.85, 0.35, 0), (chord, 0.12, 0.355, 0), (sparkle, 0.05, 0.4, 0.3)], 1.8,
               wet=0.32, ir=room(0.9, 0.2))


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in [("select", select), ("drop", drop), ("flip", flip), ("deal", deal), ("sign", sign), ("reveal", reveal)]:
        y = fn()
        assert np.isfinite(y).all() and np.abs(y).max() > 0.5, name
        wavfile.write(OUT / f"{name}.wav", SR, (y * (2 ** 31 - 1)).astype(np.int32))
        print(f"{name}.wav  {len(y) / SR:.2f}s")
