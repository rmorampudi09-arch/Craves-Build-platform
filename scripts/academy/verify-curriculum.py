#!/usr/bin/env python3
"""Validate the merged Academy catalog; --git verifies every reviewed source at the pinned revision."""
import argparse
import json
import re
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--git', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
academy_root = root / 'services/auth-service/src/main/resources/academy'
engineering_root = academy_root / 'engineering'


def load(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


data = load(academy_root / 'curriculum.json')
index = load(engineering_root / 'index.json')
for field in ('version', 'sourceRevision', 'reviewedOn', 'evidenceLabel'):
    assert isinstance(index.get(field), str) and index[field].strip(), f'missing engineering metadata: {field}'
    data[field] = index[field]

by_id = {course['id']: course for course in data['courses']}
for filename in index['enhancements']:
    assert re.fullmatch(r'[a-z0-9-]+\.json', filename), f'invalid enhancement filename: {filename}'
    enhancement = load(engineering_root / filename)
    course_id = enhancement['courseId']
    assert course_id in by_id, f'unknown course enhancement: {course_id}'
    course = by_id[course_id]
    existing_sources = set(course['sources'])
    for source in enhancement.get('addSources', []):
        if source not in existing_sources:
            course['sources'].append(source)
            existing_sources.add(source)
    course['lessons'].extend(enhancement['lessons'])
    minutes_added = enhancement.get('minutesAdded', 0)
    assert isinstance(minutes_added, int) and minutes_added >= 0
    course['minutes'] += minutes_added

for filename in index['newCourses']:
    assert re.fullmatch(r'[a-z0-9-]+\.json', filename), f'invalid course filename: {filename}'
    addition = load(engineering_root / filename)
    course = addition['course']
    assert course['id'] not in by_id, f'duplicate added course: {course["id"]}'
    data['courses'].append(course)
    by_id[course['id']] = course

assert re.fullmatch(r'[a-f0-9]{40}', data['sourceRevision'])
assert re.fullmatch(r'[a-z0-9-]{1,64}', data['version'])
source_pattern = re.compile(
    r'(?:(?:services|apps)/[A-Za-z0-9_./-]+\.(?:java|ts|tsx|md)|'
    r'\.github/workflows/[A-Za-z0-9_.-]+\.ya?ml|'
    r'scripts/academy/[A-Za-z0-9_.-]+\.py)'
)

course_ids = set()
lesson_ids = set()
question_ids = set()
sources = set()
for course in data['courses']:
    assert course['id'] not in course_ids
    course_ids.add(course['id'])
    assert course['service'] and course['sources'] and course['lessons'] and course['minutes'] > 0
    for source in course['sources']:
        assert source_pattern.fullmatch(source) and '..' not in source, f'unsupported Academy source path: {source}'
        sources.add(source)
        if args.git:
            subprocess.run(
                ['git', 'cat-file', '-e', f"{data['sourceRevision']}:{source}"],
                cwd=root,
                check=True,
            )
    for lesson in course['lessons']:
        assert lesson['id'] not in lesson_ids
        lesson_ids.add(lesson['id'])
        assert all(lesson[key].strip() for key in ['title', 'overview', 'example', 'lab', 'pitfall'])
        assert len(lesson['steps']) >= 2 and len(lesson['questions']) == 2
        for step in lesson['steps']:
            assert step['label'].strip() and step['detail'].strip()
        for question in lesson['questions']:
            assert question['id'] not in question_ids
            question_ids.add(question['id'])
            assert len(question['options']) == 4 and len(set(question['options'])) == 4
            assert isinstance(question['answer'], int) and 0 <= question['answer'] < 4
            assert question['prompt'].strip() and question['explanation'].strip()

for course in data['courses']:
    assert all(required in course_ids and required != course['id'] for required in course['prerequisites'])

assert len(course_ids) == 10
assert len(lesson_ids) == 50
assert len(question_ids) == 100
assert data['version'] == 'academy-2026-09-13-v2'

versions = []
for file in (root / 'services/auth-service/src/main/resources/db/migration').glob('V*__*.sql'):
    version = tuple(int(value) for value in re.split('[._]', file.name.split('__')[0][1:]))
    assert version not in versions, f'Duplicate migration {file}'
    versions.append(version)

print(json.dumps({
    'version': data['version'],
    'courses': len(course_ids),
    'sections': len(lesson_ids),
    'questions': len(question_ids),
    'reviewedSourceFiles': len(sources),
    'revision': data['sourceRevision'],
    'sourceFilesVerifiedInGit': args.git,
}, indent=2))
