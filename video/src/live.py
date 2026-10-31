import subprocess, os
V = os.getcwd(); FPS = 30
def run(c):
    r = subprocess.run(c, capture_output=True, text=True)
    if r.returncode: print(r.stderr[-800:]); raise SystemExit(1)
def dur(f): return float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f],capture_output=True,text=True).stdout)
def card(name, sec):
    out = f"live/{name}.mp4"
    run(["ffmpeg","-y","-loop","1","-i",f"cards/{name}.png","-vf",f"scale=1920:1080,fade=in:st=0:d=0.4,fade=out:st={sec-0.4}:d=0.4,format=yuv420p","-t",str(sec),"-r",str(FPS),"-c:v","libx264","-preset","veryfast","-crf","18",out]); return out
def rec(name, keep, speed=1.1):
    src = f"rec/{name}.webm"; d = dur(src); st = max(0, d - keep); out = f"live/{name}.mp4"; L = keep / speed
    run(["ffmpeg","-y","-ss",f"{st:.2f}","-i",src,"-vf",f"setpts=PTS/{speed},fps={FPS},scale=1920:1080,fade=in:st=0:d=0.4,fade=out:st={L-0.5:.2f}:d=0.5,format=yuv420p","-an","-t",f"{L:.2f}","-c:v","libx264","-preset","veryfast","-crf","17",out]); return out
seq = [card("c01",2.6), card("c03",2.8), card("c04",3.0), rec("home",15,1.0),
       card("q1",2.4), rec("harvey",40,1.2), card("q2",2.4), rec("linear",30,1.2), card("q3",2.4), rec("scribe",30,1.2),
       card("e01",2.8), card("e02",3.2)]
open("live/list.txt","w").write("".join(f"file '{V}/{s}'\n" for s in seq))
run(["ffmpeg","-y","-f","concat","-safe","0","-i","live/list.txt","-c","copy","live/silent.mp4"])
D = dur("live/silent.mp4")
run(["python3","music.py","live/music.wav",str(D+1)])
run(["ffmpeg","-y","-i","live/silent.mp4","-i","live/music.wav","-filter_complex",f"[1:a]atrim=0:{D},afade=t=out:st={D-3:.2f}:d=3,volume=0.85[a]","-map","0:v","-map","[a]","-c:v","copy","-c:a","aac","-b:a","192k","-shortest","Vantage-demo-live.mp4"])
print(f"DONE {D:.1f}s")
