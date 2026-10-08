#!/usr/bin/env python3
"""Package complete changed files and a paginated, offline HTML handover."""
import argparse
import html
import json
import math
import pathlib
import subprocess
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = "a79d0d83de730715597956d82da9970b78323152"
def git(*args):
    return subprocess.check_output(["git", "-C", str(ROOT), *args], text=True).strip()

def source_chunks(text):
    # Keep original line contents; wrapping is visual, not a modified source file.
    chunk, cost = [], 0
    for line in text.splitlines(keepends=True):
        weight = max(1, math.ceil(len(line.expandtabs(4).rstrip("\r\n")) / 82))
        if chunk and cost + weight > 42:
            yield "".join(chunk)
            chunk, cost = [], 0
        chunk.append(line)
        cost += weight
    if chunk:
        yield "".join(chunk)

def build(output):
    output.mkdir(parents=True, exist_ok=True)
    files = [p for p in git("diff", "--name-only", BASE, "HEAD").splitlines() if (ROOT/p).is_file()]
    sha = git("rev-parse", "HEAD")
    sections = json.loads((ROOT/"docs/modules/chef-onboarding-v2/handover-sections.json").read_text(encoding="utf-8"))
    pages = []
    pages.append(("Craves Chef onboarding", "<p class='eyebrow'>Engineering handover · 8 October 2026</p><h2>Every Chef. Selected proof. Two kitchen photos. FSSAI learning and help.</h2><p>This document includes the task decisions, implementation, tests, manual release steps, pending live checks, and complete changed source files.</p><p><strong>Source:</strong> "+html.escape(sha)+"</p><p><strong>Base:</strong> "+BASE+"</p><p>The included ZIP is an overlay for the existing repository. Feature activation and a live deployment are separate from source verification.</p>"))
    for section in sections:
        pages.append((section["title"], "".join("<p>"+html.escape(p)+"</p>" for p in section["paragraphs"])))
    for offset in range(0,len(files),12):
        pages.append(("Changed file tree", "<p>Full runnable files are included in the ZIP at these exact repository paths.</p><ul class='file-list'>"+"".join("<li>"+html.escape(p)+"</li>" for p in files[offset:offset+12])+"</ul>"))
    for name in files:
        text = (ROOT/name).read_text(encoding="utf-8")
        chunks = list(source_chunks(text))
        for number, chunk in enumerate(chunks,1):
            pages.append(("Complete source file", "<p class='path'>"+html.escape(name)+"</p><p class='part'>File part "+str(number)+" of "+str(len(chunks))+"</p><pre>"+html.escape(chunk)+"</pre>"))
    if len(pages)<50:
        raise ValueError("Handover must contain at least 50 substantive pages")
    css = """
@page{size:A4;margin:0}
*{box-sizing:border-box}
body{margin:0;background:#e9edf1;color:#152134;font-family:Arial,sans-serif;font-size:11pt}
.page{width:210mm;height:297mm;margin:8mm auto;background:white;position:relative;padding:16mm 16mm 18mm;break-after:page;page-break-after:always;box-shadow:0 2px 10px #0002}
.page:last-child{break-after:auto;page-break-after:auto}
.brand{font-size:9pt;font-weight:bold;color:#e43b23;letter-spacing:1.1px;border-bottom:1px solid #d9e1e8;padding-bottom:4mm}
h1{font-size:21pt;line-height:1.18;margin:7mm 0 5mm}
h2{font-size:19pt;line-height:1.28}
p{font-size:10.5pt;line-height:1.65;margin:0 0 4mm;overflow-wrap:anywhere}
.eyebrow{color:#64748b}.path{font-family:monospace;font-size:9pt;font-weight:bold;line-height:1.4;margin-bottom:3mm}.part{font-size:8pt;color:#64748b;margin-bottom:3mm}
pre{font-family:"Courier New",monospace;font-size:8pt;line-height:12pt;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;margin:0}
.file-list{padding-left:5mm}.file-list li{font-family:monospace;font-size:9pt;line-height:1.5;margin-bottom:3mm;overflow-wrap:anywhere}
footer{position:absolute;bottom:9mm;left:16mm;right:16mm;border-top:1px solid #d9e1e8;padding-top:3mm;color:#64748b;font-size:8pt;display:flex;justify-content:space-between}
@media print{body{background:white}.page{margin:0;box-shadow:none}}
"""
    rendered = "<!doctype html><html lang='en'><head><meta charset='utf-8'><title>Craves Chef Onboarding Handover</title><style>"+css+"</style></head><body>"
    for number,(title,body) in enumerate(pages,1):
        rendered += "<section class='page'><div class='brand'>CRAVES / CHEF ONBOARDING V2</div><h1>"+html.escape(title)+"</h1><div class='page-content'>"+body+"</div><footer><span>Source "+sha[:12]+"</span><span>"+str(number)+" / "+str(len(pages))+"</span></footer></section>"
    rendered += "</body></html>"
    handover = output/"Craves-Chef-Onboarding-V2-Handover.html"
    handover.write_text(rendered,encoding="utf-8")
    manifest = {"base":BASE,"head":sha,"files":files,"handoverPages":len(pages),"format":"A4 paginated HTML; complete source appendix"}
    (output/"chef-onboarding-manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    with zipfile.ZipFile(output/"Craves-Chef-Onboarding-V2.zip","w",zipfile.ZIP_DEFLATED) as archive:
        for name in files:
            archive.write(ROOT/name,name)
        archive.write(handover,handover.name)
        archive.write(output/"chef-onboarding-manifest.json","chef-onboarding-manifest.json")
    with zipfile.ZipFile(output/"Craves-Chef-Onboarding-V2.zip") as archive:
        assert archive.testzip() is None
        assert set(files).issubset(archive.namelist())
    print(json.dumps(manifest,indent=2))

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",type=pathlib.Path,default=ROOT/"chef-onboarding-deliverables")
    build(parser.parse_args().output)
