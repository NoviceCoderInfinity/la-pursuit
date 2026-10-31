Rebuild the demo video (needs ffmpeg, node with playwright, the app running on :3000):
  node cap1.mjs shots home|harvey|linear|scribe   # 2x screenshots of the app (run the four in parallel)
  node ev.mjs shots/harvey-evidence.png            # evidence drawer shot
  node cards.mjs .                                 # title cards + captions from cards.json
  python3 music.py music.wav 110                   # original ambient track
  python3 assemble.py .                            # -> Vantage-demo.mp4 (timeline + zooms are in assemble.py)
Edit the words in cards.json and the shot order/durations/zoom focus in assemble.py.
(The .mjs scripts import playwright; run them from a folder where playwright is installed.)

Live cut (the main video): node rec.mjs rec home|harvey|linear|scribe  (records real browser sessions), then python3 live.py (from src/, after copying cards/ and rec/ in place) -> Vantage-demo-live.mp4
