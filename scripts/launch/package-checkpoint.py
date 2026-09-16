"""Generate an honest checkpoint PDF and exact committed source overlay.

Not a deployment or launch approval. Never packages the working tree or secrets.
"""
import argparse
import hashlib
import html
import json
from pathlib import Path
import subprocess
import textwrap
import zipfile
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Preformatted

BASE = '39fca66a564d8d9809828d02a3e4ca24540cd043'
APPENDIX = [
    '.github/workflows/launch-regression-ci.yml',
    'scripts/launch/launch-regression.py',
    'scripts/launch/test_launch_evidence.py',
    'scripts/launch/test_workflow_gate.py',
    'scripts/apim/finance-response-privacy.py',
    'scripts/apim/tests/test_finance_response_privacy.py',
    'scripts/release/capture-launch-runtime.py',
    'scripts/release/capture-gateway-policy-fingerprints.py',
    'scripts/release/require-launch-p0-evidence.py',
    'services/subscription-service/src/test/java/in/craves/subscription/SubscriptionSchemaSnapshot.java',
    'services/subscription-service/src/test/java/in/craves/subscription/SubscriptionSchemaSnapshotTest.java',
    'apps/customer-web-next/src/components/auth/EmailVerificationPanel.tsx',
    'apps/customer-web-next/src/lib/email-verification-bff.ts',
    'apps/customer-web-next/src/lib/email-verification-client.ts',
]
DOCS = ['README.md', '2026-09-16-progress.md', 'OWNER_DECISIONS_20260916.md',
        'REPOSITORY_PROTECTION.md', 'FINANCE_RESPONSE_PRIVACY.md']


def git(*args):
    return subprocess.check_output(['git', *args])


def read(sha, path):
    return git('show', sha + ':' + path)


def clean(text):
    # Standard PDF fonts: keep the operational language readable and explicit.
    for old, new in [('₹', 'INR '), ('—', '-'), ('–', '-'), ('‑', '-'),
                     ('→', ' -> '), ('‘', "'"), ('’', "'"), ('“', '"'), ('”', '"')]:
        text = text.replace(old, new)
    return text


def footer(canvas, document):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor('#cf2414'))
    canvas.rect(40, 806, 515, 2, fill=1, stroke=0)
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(colors.HexColor('#555555'))
    canvas.drawString(40, 817, 'CRAVES | LAUNCH ENGINEERING CHECKPOINT | 16 SEPTEMBER 2026')
    canvas.drawString(40, 25, 'Implementation evidence - NOT public-launch acceptance')
    canvas.drawRightString(555, 25, str(document.page))
    canvas.restoreState()


def build_pdf(target, sha, manifest):
    styles = getSampleStyleSheet()
    styles['Heading1'].keepWithNext = True
    styles['Heading2'].keepWithNext = True
    styles.add(ParagraphStyle(name='BodyCraves', fontName='Helvetica', fontSize=10, leading=14, spaceAfter=9))
    styles.add(ParagraphStyle(name='PathCraves', fontName='Helvetica-Bold', fontSize=10, leading=14, wordWrap='CJK', spaceAfter=12))
    styles.add(ParagraphStyle(name='CodeCraves', fontName='Courier', fontSize=7.8, leading=10.3))
    body = styles['BodyCraves']
    story = [Spacer(1, 45), Paragraph('Craves', styles['Title']),
             Paragraph('Public-launch implementation checkpoint', styles['Heading1']),
             Spacer(1, 16), Paragraph('16 September 2026', body),
             Paragraph('Source: ' + sha, body),
             Paragraph('This report distinguishes working source, test evidence, live settings and unresolved acceptance. It is not a declaration that the app is ready for public launch.', body),
             Paragraph('The owner confirmed a monthly referral-reward cap of INR 1,500 per chef. Qualification uses the referred chef food subtotal; two INR 150 dishes qualify at INR 300. This does not authorize infrastructure spending or change ordinary food-sale earnings.', body),
             Paragraph('Main branch protection was saved and read back. Serving application images, live customer records and financial transactions were not changed by this launch checkpoint. No new APK was produced for these web and governance changes.', body),
             Paragraph('The ZIP contains complete changed source files at the exact commit above. Selected complete safety-critical files are printed in the appendix. No original private PDFs, credentials or dependency caches are included.', body),
             PageBreak(), Paragraph('How to use this handover', styles['Heading1']),
             Paragraph('Read the operational sections first, then the 46-finding register. CI passed means automated evidence for a particular source commit only; it does not mean deployed, inbox-verified, capacity-tested or accepted by a reviewer.', body),
             Paragraph('The conversation record below consists of documented owner decisions and engineering outcomes visible in this task. It is not represented as a complete verbatim transcript of every earlier task, which is unavailable here.', body),
             Paragraph('The source plan is Craves_Public_Launch_Fixing_Plan_2026-09-16.pdf, 69 pages, SHA-256 CFAAD0C1B125669823DB7B40536D4A38DEE3E715C08AC6BE9926D0F74BA9FF09. It remains unchanged.', body),
             Paragraph('Before deployment: an eligible independent reviewer must approve the candidate; preserve running migrations, service origins, security controls, payment mode and exact rollback images. Tests must run against disposable databases, never live data.', body),
             Paragraph('Owner actions still needed include genuine business declarations and policy decisions, controlled mailbox acceptance, support/alert owners and a separate budget for paid restore/load infrastructure. Do not invent these to mark findings complete.', body)]
    for name in DOCS:
        story.append(PageBreak())
        story.append(Paragraph('Operational record: ' + html.escape(name), styles['PathCraves']))
        for line in clean(read(sha, 'docs/launch-closure/' + name).decode()).splitlines():
            if not line.strip(): continue
            level = len(line) - len(line.lstrip('#'))
            if level and line[level:level+1] == ' ':
                style = styles['Heading1' if level == 1 else 'Heading2']
                story.append(Paragraph(html.escape(line[level:].strip()), style))
            else:
                story.append(Paragraph(html.escape(line).replace('`', ''), body))
    register = json.loads(read(sha, 'docs/launch-closure/closure-register.json'))
    story += [PageBreak(), Paragraph('All 46 findings: acceptance register', styles['Heading1']),
              Paragraph('None is Accepted at this checkpoint. Unset reviewer/date and a false closure gate are deliberate evidence boundaries, not hidden completion claims. The source plan controls the full acceptance criteria.', body)]
    for item in register['findings']:
        story.append(Paragraph(html.escape(item['id'] + ' - ' + item['title']), styles['Heading2']))
        story.append(Paragraph(html.escape('Package ' + item['package'] + ' | Status: ' + item['status'] + ' | Acceptance gate: not closed'), body))
        if item['evidence']:
            for evidence in item['evidence']:
                story.append(Paragraph(html.escape(clean(evidence)), body))
        else:
            story.append(Paragraph('No new finding-specific closure evidence has been recorded in this package. Follow the source plan and record tests, runtime evidence, reviewer and date before acceptance.', body))
    story += [PageBreak(), Paragraph('Complete selected source appendix', styles['Heading1']),
              Paragraph('These are complete committed files, not pseudocode or shortened extracts. Printed long lines wrap, tabs expand and non-ASCII source characters use Unicode escapes for font-safe display; the ZIP preserves exact source bytes. Other changed files are also delivered completely in the ZIP. No test-only intentional failure branch is included.', body)]
    for path in APPENDIX:
        original = read(sha, path).decode('utf-8')
        # Preserve every source character in a font-safe printed representation.
        content = ''.join(c if ord(c) < 127 else ('\\u%04x' % ord(c)) for c in original)
        wrapped = []
        for line in content.splitlines():
            wrapped.extend(textwrap.wrap(line.expandtabs(4), width=103, replace_whitespace=False,
                                         drop_whitespace=False) or [''])
        chunks = [wrapped[i:i+55] for i in range(0, len(wrapped), 55)]
        for number, chunk in enumerate(chunks, 1):
            story.append(PageBreak())
            story.append(Paragraph(html.escape(path) + f' (part {number}/{len(chunks)})', styles['PathCraves']))
            story.append(Preformatted('\n'.join(chunk), styles['CodeCraves']))
    document = SimpleDocTemplate(str(target), pagesize=A4, leftMargin=40, rightMargin=40,
                                topMargin=52, bottomMargin=46, title='Craves launch checkpoint', author='Craves Engineering')
    document.build(story, onFirstPage=footer, onLaterPages=footer)
    if document.page < 50: raise ValueError('Detailed handover must contain at least 50 substantive pages')
    return document.page


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    sha = git('rev-parse', 'HEAD').decode().strip()
    paths = sorted(p for p in git('diff', '--name-only', '--diff-filter=ACMRT', '-z', BASE, sha).decode().split('\0') if p)
    deleted = [p for p in git('diff', '--name-only', '--diff-filter=D', '-z', BASE, sha).decode().split('\0') if p]
    forbidden = {'.pem', '.p12', '.pfx', '.jks', '.keystore', '.class', '.jar', '.apk'}
    blobs = {}
    for path in paths:
        p = Path(path)
        if p.is_absolute() or '..' in p.parts or p.suffix.lower() in forbidden or p.name.startswith('.env'):
            raise ValueError('Unsafe source overlay path')
        blobs[path] = read(sha, path)
    manifest = {'schemaVersion': 1, 'sourceSha': sha, 'baselineSha': BASE,
                'publicLaunchAccepted': False, 'finalOwnerJourney': 'NOT_RUN',
                'deletedPaths': deleted,
                'files': [{'path': p, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for p, data in blobs.items()]}
    args.output.mkdir(parents=True, exist_ok=True)
    pdf = args.output / 'Craves-Launch-Checkpoint-20260916.pdf'
    archive = args.output / 'Craves-Launch-Checkpoint-Source-20260916.zip'
    if pdf.exists() or archive.exists(): raise ValueError('Choose a new output directory; do not overwrite delivered artifacts')
    manifest['handoverPages'] = build_pdf(pdf, sha, manifest)
    with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED) as bundle:
        for path, data in blobs.items(): bundle.writestr('repository/' + path, data)
        bundle.writestr('FILE-MANIFEST.json', json.dumps(manifest, indent=2) + '\n')
        bundle.writestr('README.md', read(sha, 'docs/launch-closure/README.md'))
        bundle.write(pdf, pdf.name)
    with zipfile.ZipFile(archive) as bundle:
        if bundle.testzip() is not None: raise ValueError('ZIP integrity failure')
        for path, data in blobs.items():
            if bundle.read('repository/' + path) != data: raise ValueError('Source overlay verification failure')
    print(json.dumps({'sha': sha, 'files': len(blobs), 'pages': manifest['handoverPages'],
                      'pdf': str(pdf.resolve()), 'zip': str(archive.resolve()),
                      'zipSha256': hashlib.sha256(archive.read_bytes()).hexdigest()}, indent=2))


if __name__ == '__main__': main()
