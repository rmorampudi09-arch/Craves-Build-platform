#!/usr/bin/env python3
"""Build an exact source overlay, evidence manifest and full-source PDF handover.

Runs only after Java, PostgreSQL and web CI succeeds. No fonts, credentials,
production data, dependency caches or compiled service binaries are packaged.
"""
import argparse
import base64
import hashlib
import html
import json
import os
from pathlib import Path
import shutil
import subprocess
import textwrap
import zipfile
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Preformatted, Image

BASELINE='147f381b578207e95c7678d208ae2366bce92579'
README='services/notification-service/modules/pdf-documents/README.md'
EXCLUDED={'.ttf','.otf','.woff','.woff2','.pem','.p12','.pfx','.jks','.jar','.class'}

def git(*args):
    return subprocess.check_output(['git',*args])

def digest(data): return hashlib.sha256(data).hexdigest()

def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor('#dce1e6')); canvas.line(44,806,551,806)
    canvas.setFillColor(colors.HexColor('#5b6673')); canvas.setFont('Helvetica',8)
    canvas.drawString(44,817,'CRAVES | PDF DOCUMENTS | ENGINEERING HANDOVER')
    canvas.drawString(44,29,'Source implementation and CI evidence. Production acceptance is separate.')
    canvas.drawRightString(551,29,str(doc.page)); canvas.restoreState()

def handbook(output, paths, manifest, logo):
    styles=getSampleStyleSheet()
    styles.add(ParagraphStyle(name='BodyDoc',fontName='Helvetica',fontSize=10,leading=15,spaceAfter=9))
    styles.add(ParagraphStyle(name='CodeDoc',fontName='Courier',fontSize=7,leading=9,spaceAfter=8))
    styles.add(ParagraphStyle(name='PathDoc',fontName='Helvetica-Bold',fontSize=11,leading=15,spaceAfter=12,wordWrap='CJK'))
    story=[Spacer(1,42),Image(str(logo),width=76,height=76),Spacer(1,22),Paragraph('Craves PDF Documents',styles['Title']),
        Paragraph('Implementation, verification and operational handover',styles['Heading2']),Spacer(1,20),
        Paragraph('Source SHA: '+manifest['sourceSha'],styles['BodyDoc']),
        Paragraph('Four Java services and the existing Next.js customer/chef application. Complete source files follow the operational runbook.',styles['BodyDoc']),
        Paragraph('No download/upload recovery step is required. The archive is generated from version-controlled source, not from an unverified historical attachment.',styles['BodyDoc']),
        Paragraph('Scope: order summaries, payment receipts, subscription receipts, chef order activity, earnings and settlement allocations. Statutory tax invoices remain gated.',styles['BodyDoc']),PageBreak()]
    story += [Paragraph('Delivery evidence and boundaries',styles['Heading1'])]
    total=0
    for result in manifest['testEvidence']:
        total+=result['pdfTestsPassed']
        story.append(Paragraph(html.escape(f"{result['service']}: {result['tests']} owning-service tests; {result['pdfTestsPassed']} required PDF tests passed without skips. Other skipped tests: {result['skipped']}."),styles['BodyDoc']))
    story.append(Paragraph(f'{total} PDF-specific Java tests required by the evidence gate. Web lint, typecheck, test suite and production build passed before this artifact job.',styles['BodyDoc']))
    story.append(Paragraph('Examples are produced by the real Java renderer using synthetic fixtures. Live Azure storage authorization, APIM production routing, multilingual typography acceptance and real recipient inbox delivery are not established by CI.',styles['BodyDoc']))
    story.append(Paragraph('Conversation outcome: the request was to build one branded PDF module and complete GitHub work with minimal owner intervention. Earlier recovery-only status reports were contradicted by the repository. The continuation verified the existing code, removed the obsolete importer, wired the Orders screen, embedded the approved logo and added source-ownership and migration tests. This is a task handover, not a transcript of private reasoning or unrelated conversations.',styles['BodyDoc']))
    story.append(PageBreak())
    code=False; pending=[]
    def flush():
        if pending:
            text='\n'.join(pending); pending.clear()
            wrapped='\n'.join(textwrap.fill(line,width=112,replace_whitespace=False,drop_whitespace=False) if line else '' for line in text.splitlines())
            story.append(Preformatted(wrapped,styles['CodeDoc']))
    for line in Path(README).read_text().splitlines():
        if line.startswith('```'):
            if code: flush()
            code=not code; continue
        if code: pending.append(line); continue
        if not line.strip(): continue
        if line.startswith('## '): story.append(Paragraph(html.escape(line[3:]),styles['Heading1']))
        elif line.startswith('# '): story.append(Paragraph(html.escape(line[2:]),styles['Heading1']))
        elif line.startswith('|'):
            if not set(line.replace('|','').replace(' ','')) <= {'-'}: story.append(Paragraph(html.escape(line),styles['BodyDoc']))
        else: story.append(Paragraph(html.escape(line),styles['BodyDoc']))
    flush()
    story += [PageBreak(),Paragraph('Complete source appendix',styles['Heading1']),
        Paragraph('Each source file starts on a new page. Printed lines wrap for readability; repository files inside the ZIP preserve exact bytes. Branding data is accounted for by SHA-256 in the file manifest instead of printing base64 blocks. No font files are included.',styles['BodyDoc'])]
    for path in paths:
        if '.base64.' in path or path==README: continue
        file=Path(path)
        if file.suffix in EXCLUDED: raise ValueError('Forbidden artifact file')
        try: text=file.read_text(encoding='utf-8')
        except UnicodeDecodeError: continue
        story.append(PageBreak()); story.append(Paragraph(html.escape(path),styles['PathDoc']))
        for start in range(0,len(text.splitlines()),48):
            chunk=text.splitlines()[start:start+48]
            wrapped='\n'.join(textwrap.fill(line.expandtabs(4),width=112,replace_whitespace=False,drop_whitespace=False) if line else '' for line in chunk)
            story.append(Preformatted(wrapped,styles['CodeDoc']))
    document=SimpleDocTemplate(str(output),pagesize=A4,rightMargin=44,leftMargin=44,topMargin=49,bottomMargin=48,
        title='Craves PDF Documents - Engineering Handover',author='Craves Engineering')
    document.build(story,onFirstPage=footer,onLaterPages=footer)
    if document.page<50: raise RuntimeError('Full-source handover did not meet the required 50 pages')
    return document.page

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[2]; os.chdir(root)
    args.output.mkdir(parents=True,exist_ok=True)
    sha=git('rev-parse','HEAD').decode().strip()
    paths=sorted(p for p in git('diff','--name-only','--diff-filter=ACMRT','-z',BASELINE,'HEAD').decode().split('\0') if p)
    for path in paths:
        file=Path(path)
        if not file.is_file() or file.is_symlink() or file.suffix.lower() in EXCLUDED or file.name=='.env': raise ValueError('Unsafe delivery path: '+path)
    evidence=[json.loads(p.read_text()) for p in args.evidence.rglob('pdf-test-summary.json')]
    if {x['service'] for x in evidence}!={'notification-service','order-service','integration-service','subscription-service'}: raise ValueError('Four-service evidence missing')
    if not list(args.evidence.rglob('WEB_VERIFY_PASSED.txt')): raise ValueError('Web verification evidence missing')
    manifest={'schemaVersion':1,'sourceSha':sha,'baselineSha':BASELINE,'runtimeAcceptance':'NOT_PERFORMED',
        'gitHubRunId':os.getenv('GITHUB_RUN_ID'),'originalZipCompared':False,'testEvidence':evidence,
        'files':[{'path':p,'bytes':Path(p).stat().st_size,'sha256':digest(Path(p).read_bytes())} for p in paths]}
    brand=root/'services/notification-service/src/main/resources/documents'
    encoded=''.join((brand/('craves-logo-20260805.base64.'+p)).read_text().strip() for p in ['00','01','02','03','04a','04b'])
    png=base64.b64decode(encoded,validate=True)
    if digest(png)!='afb6751bb1291f5cba13f3223140cc42229cb00696e025f617766527d6c7fd07': raise ValueError('Logo checksum mismatch')
    logo=args.output/'craves-logo.png'; logo.write_bytes(png)
    pdf=args.output/'Craves-PDF-Documents-Handover.pdf'
    manifest['handoverPages']=handbook(pdf,paths,manifest,logo)
    logo.unlink()
    shutil.copyfile(README,args.output/'README.md')
    for sample in args.evidence.rglob('craves-*-example.pdf'): shutil.copyfile(sample,args.output/sample.name)
    (args.output/'FILE-MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
    archive=args.output/'Craves-PDF-Documents-Module.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as bundle:
        for path in paths: bundle.write(path,'repository/'+path)
        for extra in sorted(args.output.iterdir()):
            if extra.is_file() and extra!=archive: bundle.write(extra,'delivery/'+extra.name)
    print(json.dumps({'sourceSha':sha,'sourceFiles':len(paths),'requiredPdfTests':sum(x['pdfTestsPassed'] for x in evidence),
        'handoverPages':manifest['handoverPages'],'zipBytes':archive.stat().st_size,'zipSha256':digest(archive.read_bytes()),'runtimeAcceptance':'NOT_PERFORMED'},indent=2))

if __name__=='__main__': main()
