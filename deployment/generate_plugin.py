#!/usr/bin/env python3
"""
Signal K Forward Watch Plugin Generator
Calls Ollama to generate each plugin file, verify agent reviews it.
Output saved to /home/boatiq/signalk-forward-watch/
"""
import json, requests, pathlib, time, textwrap

OLLAMA_URL   = "http://192.168.1.62:11434/api/generate"
VERIFY_URL   = "http://192.168.1.103:11436/verify"
MODEL        = "qwen3-coder:30b"
OUT_DIR      = pathlib.Path("/home/boatiq/signalk-forward-watch")
PHASES_FILE  = pathlib.Path(__file__).parent / "phases.json"

SYSTEM = """You are a Node.js expert writing a Signal K server plugin.
Write clean, working Node.js code using CommonJS (require/module.exports).
Return ONLY the complete file contents — no markdown fences, no explanation, no comments outside the code."""

def call_ollama(prompt):
    t0 = time.time()
    resp = requests.post(OLLAMA_URL, json={
        "model": MODEL,
        "prompt": prompt,
        "system": SYSTEM,
        "stream": False,
        "options": {"temperature": 0.1, "num_predict": 4096}
    }, timeout=300)
    resp.raise_for_status()
    elapsed = int(time.time() - t0)
    text = resp.json()["response"].strip()
    # Strip markdown fences if Ollama added them
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    print(f"  Ollama: {elapsed}s, {len(text)} chars")
    return text

def call_verify(code, filename, instruction):
    try:
        resp = requests.post(VERIFY_URL, json={
            "code": code,
            "filename": filename,
            "instruction": instruction[:800]
        }, timeout=120)
        if resp.status_code == 200:
            r = resp.json()
            status = r.get("status", "unknown")
            score  = r.get("score", "?")
            issues = r.get("issues", [])
            print(f"  Verify: {status} (score {score})")
            if issues:
                for i in issues[:3]:
                    print(f"    - {i}")
            return r
    except Exception as e:
        print(f"  Verify: offline ({e})")
    return None

def generate_phase(phase):
    name     = phase["phase"]
    outfile  = OUT_DIR / phase["target_file"]
    spec     = phase["spec"]

    print(f"\n{'='*60}")
    print(f"PHASE: {name}  ->  {phase['target_file']}")
    print(f"{'='*60}")

    prompt = f"""Write the complete contents of the file: {phase['target_file']}

SPECIFICATION:
{spec}

Return only the complete file. No explanation. No markdown fences."""

    code = call_ollama(prompt)

    # Verify
    result = call_verify(code, phase["target_file"], spec)
    if result and result.get("status") == "FAIL" and int(result.get("score", 100)) < 40:
        print("  Low score — requesting correction...")
        issues_text = "\n".join(result.get("issues", []))
        correction_prompt = f"""The code you wrote for {phase['target_file']} has issues:
{issues_text}

Original spec:
{spec}

Rewrite the complete file fixing all issues. Return only the file contents."""
        code = call_ollama(correction_prompt)
        print("  Correction applied.")

    # Save
    outfile.parent.mkdir(parents=True, exist_ok=True)
    outfile.write_text(code)
    print(f"  Saved: {outfile}")
    return code

def main():
    phases = json.loads(PHASES_FILE.read_text())
    print(f"Generating {len(phases)} plugin files using {MODEL}")
    print(f"Output: {OUT_DIR}\n")

    for phase in phases:
        generate_phase(phase)
        time.sleep(2)

    print(f"\n{'='*60}")
    print("ALL PHASES COMPLETE")
    print(f"{'='*60}")
    print(f"Plugin files written to: {OUT_DIR}")
    print("Next: npm install && review output")

if __name__ == "__main__":
    main()
