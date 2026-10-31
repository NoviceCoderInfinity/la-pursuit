# Original ambient track: warm pad chords + soft pulse + airy shimmer. 100 BPM, ~110 s.
import numpy as np, wave, sys
SR = 44100; DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 110.0; BPM = 100; beat = 60 / BPM
t = np.arange(int(SR * DUR)) / SR
def note(m): return 440 * 2 ** ((m - 69) / 12)
prog = [[48, 55, 59, 64], [45, 52, 57, 60], [41, 48, 52, 57], [43, 50, 55, 59]]  # Cmaj7, Am7, Fmaj7, G
bar = 4 * beat * 2  # two bars per chord
pad = np.zeros_like(t)
for i in range(int(DUR / bar) + 1):
    ch = prog[i % 4]; s = i * bar; e = min(DUR, s + bar + 1.2)
    idx = (t >= s) & (t < e); tt = t[idx] - s
    env = np.minimum(1, tt / 1.2) * np.minimum(1, np.maximum(0, (e - s - tt)) / 1.2)
    for m in ch:
        f = note(m)
        for det in (-0.12, 0.0, 0.12):
            pad[idx] += env * np.sin(2 * np.pi * f * (1 + det / 100) * tt) * 0.05
        pad[idx] += env * np.sin(2 * np.pi * f * 2 * tt) * 0.012
# soft kick-like pulse on every beat after the intro
pulse = np.zeros_like(t)
k = np.arange(int(SR * 0.35)) / SR
kick = np.sin(2 * np.pi * (60 + 80 * np.exp(-k * 18)) * k) * np.exp(-k * 9) * 0.35
for b in np.arange(8 * beat, DUR - 4, beat):
    j = int(b * SR); pulse[j:j + len(kick)] += kick[: len(pulse) - j]
# shimmer: high arpeggio notes
shim = np.zeros_like(t)
arp = [76, 79, 83, 84, 83, 79]
for n, b in enumerate(np.arange(16 * beat, DUR - 6, beat / 2)):
    ch = prog[int(b // bar) % 4]; m = ch[n % 4] + 24
    j = int(b * SR); L = int(SR * 0.6); tt = np.arange(L) / SR
    tone = np.sin(2 * np.pi * note(m) * tt) * np.exp(-tt * 5) * 0.035
    shim[j:j + L] += tone[: len(shim) - j]
mix = pad + pulse + shim
# low-pass-ish smoothing and stereo width
mix = np.convolve(mix, np.ones(6) / 6, mode="same")
fade = np.minimum(1, t / 3) * np.minimum(1, (DUR - t) / 4)
mix *= fade
mix /= np.max(np.abs(mix)) * 1.15
L = mix; R = np.roll(mix, int(SR * 0.012))
st = (np.stack([L, R], 1) * 32767).astype(np.int16)
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
print("music", DUR, "s")
