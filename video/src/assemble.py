# Builds the final video: each shot/card -> zoom clip (+ caption) -> concat -> music.
import os, subprocess, sys, json
V = sys.argv[1]; FPS = 30
T = [  # (image, caption-id or None, seconds, zoom: in|out, focus x,y as fractions)
 ("cards/c01", None, 2.6, "in", .5, .5), ("cards/c02", None, 3.0, "in", .5, .5), ("cards/c03", None, 3.0, "in", .5, .5),
 ("cards/c04", None, 3.2, "out", .5, .5),
 ("shots/home-hero", "home-hero", 3.4, "in", .5, .38), ("shots/home-personas", "home-personas", 3.4, "out", .5, .5),
 ("cards/q1", None, 2.4, "in", .5, .5),
 ("shots/harvey-trace", "harvey-trace", 3.0, "in", .18, .5), ("shots/harvey-brief", "harvey-brief", 3.8, "in", .35, .35),
 ("shots/harvey-field", "harvey-field", 3.4, "out", .5, .5), ("shots/harvey-truth", "harvey-truth", 3.4, "in", .4, .45),
 ("shots/harvey-evidence", "harvey-evidence", 3.4, "in", .82, .45), ("shots/harvey-constellation", "harvey-constellation", 3.2, "out", .45, .55),
 ("shots/harvey-chord", "harvey-chord", 3.2, "in", .45, .55), ("shots/harvey-deck", "harvey-deck", 4.0, "in", .5, .4),
 ("cards/q2", None, 2.4, "in", .5, .5),
 ("shots/linear-trace", "linear-trace", 3.2, "in", .15, .5), ("shots/linear-brief", "linear-brief", 3.8, "in", .35, .35), ("shots/linear-field", "linear-field", 3.2, "out", .45, .55),
 ("shots/linear-globe", "linear-globe", 3.4, "in", .4, .55),
 ("shots/linear-chord", "linear-chord", 3.2, "out", .45, .55),
 ("cards/q3", None, 2.4, "in", .5, .5),
 ("shots/scribe-brief", "scribe-brief", 3.6, "in", .35, .35), ("shots/scribe-globe", "scribe-globe", 3.2, "out", .45, .55),
 ("shots/scribe-constellation", "scribe-constellation", 3.2, "in", .45, .5), ("shots/scribe-deck", "scribe-deck", 3.8, "in", .5, .4), ("shots/scribe-deck2", "scribe-deck2", 3.6, "in", .4, .45),
 ("cards/e01", None, 3.0, "in", .5, .5), ("cards/e02", None, 3.6, "out", .5, .5),
]
os.makedirs(f"{V}/clips", exist_ok=True)
def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: print(r.stderr[-1500:]); raise SystemExit(1)
jobs = []
for i, (img, cap, sec, mode, fx, fy) in enumerate(T):
    src = f"{V}/{img}.png"
    if not os.path.exists(src): print("MISSING", src); continue
    sec = sec * 1.12; n = int(sec * FPS); out = f"{V}/clips/{i:02d}.mp4"
    zmax = 1.10 if img.startswith("shots") else 1.04
    z = f"1+({zmax}-1)*on/{n}" if mode == "in" else f"{zmax}-({zmax}-1)*on/{n}"
    x = f"(iw-iw/zoom)*{fx}"; y = f"(ih-ih/zoom)*{fy}"
    vf = f"scale=3840:2160:force_original_aspect_ratio=decrease,pad=3840:2160:(ow-iw)/2:(oh-ih)/2,zoompan=z='{z}':x='{x}':y='{y}':d={n}:s=1920x1080:fps={FPS},setsar=1"
    fade = f"fade=in:st=0:d=0.35,fade=out:st={sec-0.35:.2f}:d=0.35"
    if cap and os.path.exists(f"{V}/cards/cap-{cap}.png"):
        fc = f"[0:v]{vf}[b];[1:v]format=rgba,fade=in:st=0.35:d=0.45:alpha=1[c];[b][c]overlay=0:0,{fade},format=yuv420p[v]"
        cmd = ["ffmpeg", "-y", "-loop", "1", "-i", src, "-loop", "1", "-i", f"{V}/cards/cap-{cap}.png", "-filter_complex", fc, "-map", "[v]", "-frames:v", str(n), "-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", out]
    else:
        cmd = ["ffmpeg", "-y", "-loop", "1", "-i", src, "-vf", f"{vf},{fade},format=yuv420p", "-frames:v", str(n), "-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", out]
    jobs.append((out, cmd))
from concurrent.futures import ThreadPoolExecutor
with ThreadPoolExecutor(8) as ex:
    list(ex.map(lambda j: run(j[1]), jobs))
with open(f"{V}/clips/list.txt", "w") as f:
    for out, _ in jobs: f.write(f"file '{out}'\n")
run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", f"{V}/clips/list.txt", "-c", "copy", f"{V}/silent.mp4"])
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f"{V}/silent.mp4"], capture_output=True, text=True).stdout)
run(["ffmpeg", "-y", "-i", f"{V}/silent.mp4", "-i", f"{V}/music.wav", "-filter_complex", f"[1:a]atrim=0:{dur},afade=t=in:st=0:d=1.5,afade=t=out:st={dur-3:.2f}:d=3,volume=0.9[a]",
     "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", f"{V}/Vantage-demo.mp4"])
print(f"DONE {V}/Vantage-demo.mp4  {dur:.1f}s  clips={len(jobs)}")
