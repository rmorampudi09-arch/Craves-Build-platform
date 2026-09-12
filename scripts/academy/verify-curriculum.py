#!/usr/bin/env python3
"""Validate the course manifest; --git also verifies each exact reviewed source file."""
import argparse,json,re,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--git',action='store_true');args=p.parse_args()
root=Path(__file__).resolve().parents[2]
data=json.loads((root/'services/auth-service/src/main/resources/academy/curriculum.json').read_text())
assert re.fullmatch(r'[a-f0-9]{40}',data['sourceRevision'])
assert re.fullmatch(r'[a-z0-9-]{1,64}',data['version'])
ids=set();lessons=set();questions=set();sources=set()
for c in data['courses']:
 assert c['id'] not in ids;ids.add(c['id'])
 assert c['service'] and c['sources'] and c['lessons'] and c['minutes']>0
 for source in c['sources']:
  assert re.fullmatch(r'(services|apps)/[A-Za-z0-9_./-]+\.(java|ts|tsx|md)',source) and '..' not in source
  sources.add(source)
  if args.git: subprocess.run(['git','cat-file','-e',f"{data['sourceRevision']}:{source}"],cwd=root,check=True)
 for l in c['lessons']:
  assert l['id'] not in lessons;lessons.add(l['id'])
  assert all(l[k].strip() for k in ['title','overview','example','lab','pitfall'])
  assert len(l['steps'])>=2 and len(l['questions'])==2
  for q in l['questions']:
   assert q['id'] not in questions;questions.add(q['id'])
   assert len(q['options'])==4 and len(set(q['options']))==4
   assert isinstance(q['answer'],int) and 0<=q['answer']<4 and q['explanation'].strip()
for c in data['courses']: assert all(x in ids and x!=c['id'] for x in c['prerequisites'])
assert len(ids)==9 and len(lessons)==18 and len(questions)==36
versions=[]
for f in (root/'services/auth-service/src/main/resources/db/migration').glob('V*__*.sql'):
 version=tuple(int(x) for x in re.split('[._]',f.name.split('__')[0][1:]));assert version not in versions,f'Duplicate migration {f}';versions.append(version)
print(json.dumps({'courses':len(ids),'sections':len(lessons),'questions':len(questions),'reviewedSourceFiles':len(sources),'revision':data['sourceRevision'],'sourceFilesVerifiedInGit':args.git},indent=2))
