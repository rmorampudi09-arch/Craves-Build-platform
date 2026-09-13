#!/usr/bin/env python3
"""Validate the actual merged Academy catalog and its existing API/source-viewer bounds.

--git verifies every source at the immutable teaching revision. Without --git,
structural validation is useful locally but is not source-provenance evidence.
--output writes the answer-stripped catalog for private review or size analysis.
"""
import argparse
import copy
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ACADEMY = ROOT / 'services/auth-service/src/main/resources/academy'
EXPECTED = ('academy-2026-09-13-v3', 15, 75, 175)
SOURCE_PATTERN = re.compile(
    r'(?:(?:services|apps)/[A-Za-z0-9_./-]+\.(?:java|ts|tsx|md)|'
    r'\.github/workflows/[A-Za-z0-9_.-]+\.ya?ml|scripts/academy/[A-Za-z0-9_.-]+\.py)'
)
NEW_COURSES = {'java-engineering', 'mobile-engineering', 'data-engineering', 'document-engineering', 'service-labs'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f'Duplicate JSON property: {key}')
        result[key] = value
    return result


def load(path):
    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=unique_object)


def text(value, label):
    require(isinstance(value, str) and bool(value.strip()), f'Missing text: {label}')


def merge_catalog():
    data = load(ACADEMY / 'curriculum.json')
    index = load(ACADEMY / 'engineering/index.json')
    for field in ('version', 'sourceRevision', 'reviewedOn', 'evidenceLabel'):
        text(index.get(field), field)
        data[field] = index[field]
    by_id = {}
    for course in data['courses']:
        require(course['id'] not in by_id, f'Duplicate base course: {course["id"]}')
        by_id[course['id']] = course
    for kind in ('enhancements', 'newCourses'):
        require(len(index[kind]) == len(set(index[kind])), f'Duplicate {kind} file')
        for filename in index[kind]:
            require(re.fullmatch(r'[a-z0-9-]+\.json', filename), f'Unsafe curriculum file: {filename}')
            addition = load(ACADEMY / 'engineering' / filename)
            if kind == 'enhancements':
                cid = addition['courseId']
                require(cid in by_id, f'Unknown enhancement course: {cid}')
                course = by_id[cid]
                course['sources'] = list(dict.fromkeys(course['sources'] + addition.get('addSources', [])))
                course['lessons'].extend(addition['lessons'])
                minutes = addition.get('minutesAdded', 0)
                require(type(minutes) is int and minutes >= 0, f'Invalid added minutes: {cid}')
                course['minutes'] += minutes
            else:
                course = addition['course']
                require(course['id'] not in by_id, f'Duplicate new course: {course["id"]}')
                data['courses'].append(course)
                by_id[course['id']] = course
    return data


def validate(data, verify_git=False):
    require(re.fullmatch(r'[a-f0-9]{40}', data['sourceRevision']), 'Unpinned source revision')
    require(re.fullmatch(r'[a-z0-9-]{1,64}', data['version']), 'Invalid content version')
    courses, lessons, questions, sources = {}, set(), set(), set()
    for course in data['courses']:
        cid = course['id']
        require(re.fullmatch(r'[a-z0-9-]{1,80}', cid) and cid not in courses, f'Invalid/duplicate course: {cid}')
        courses[cid] = course
        for field in ('service', 'title', 'description', 'level'):
            text(course.get(field), f'{cid}.{field}')
        require(type(course['minutes']) is int and course['minutes'] > 0, f'Invalid study estimate: {cid}')
        require(1 <= len(course['sources']) <= 10, f'Existing source-route index bound exceeded: {cid}')
        require(len(course['sources']) == len(set(course['sources'])), f'Duplicate source: {cid}')
        require(bool(course['lessons']), f'Empty course: {cid}')
        for source in course['sources']:
            require(SOURCE_PATTERN.fullmatch(source) and '..' not in source, f'Unreviewable source path: {source}')
            sources.add(source)
        for lesson in course['lessons']:
            lid = lesson['id']
            require(re.fullmatch(r'[a-z0-9-]{1,100}', lid) and lid not in lessons, f'Invalid/duplicate lesson: {lid}')
            lessons.add(lid)
            for field in ('title', 'overview', 'example', 'lab', 'pitfall'):
                text(lesson.get(field), f'{lid}.{field}')
            require(len(lesson['steps']) >= 2, f'Insufficient steps: {lid}')
            require(len(lesson['questions']) in (2, 3), f'Unexpected assessment size: {lid}')
            for step in lesson['steps']:
                text(step.get('label'), f'{lid}.step.label')
                text(step.get('detail'), f'{lid}.step.detail')
            if cid in NEW_COURSES:
                require(len(lesson['steps']) >= 6 and len(lesson['questions']) == 3, f'Incomplete applied lesson: {lid}')
                prose = ' '.join([lesson['overview'], lesson['example'], lesson['lab'], lesson['pitfall']] + [s['detail'] for s in lesson['steps']])
                require(len(prose.split()) >= 350, f'Applied lesson lacks substantive teaching: {lid}')
            for question in lesson['questions']:
                qid = question['id']
                require(qid not in questions, f'Duplicate question: {qid}')
                questions.add(qid)
                require(len(question['options']) == 4 and len(set(question['options'])) == 4, f'Invalid options: {qid}')
                for option in question['options']:
                    text(option, f'{qid}.option')
                require(type(question['answer']) is int and 0 <= question['answer'] < 4, f'Invalid answer: {qid}')
                text(question.get('prompt'), f'{qid}.prompt')
                text(question.get('explanation'), f'{qid}.explanation')
    visiting, visited = set(), set()

    def visit(cid):
        require(cid not in visiting, f'Cyclic course prerequisite: {cid}')
        if cid in visited:
            return
        visiting.add(cid)
        for dependency in courses[cid]['prerequisites']:
            require(dependency in courses and dependency != cid, f'Unknown/self prerequisite: {cid}/{dependency}')
            visit(dependency)
        visiting.remove(cid)
        visited.add(cid)

    for cid in courses:
        visit(cid)
    require((data['version'], len(courses), len(lessons), len(questions)) == EXPECTED, 'Curriculum version/count contract changed')
    require(NEW_COURSES <= courses.keys(), 'Missing applied engineering track')
    source_bytes = {}
    if verify_git:
        for source in sorted(sources):
            payload = subprocess.check_output(['git', 'show', f'{data["sourceRevision"]}:{source}'], cwd=ROOT)
            require(0 < len(payload) <= 262144, f'Existing source viewer byte bound exceeded: {source}')
            payload.decode('utf-8')
            source_bytes[source] = len(payload)
    public = copy.deepcopy(data)
    for course in public['courses']:
        for lesson in course['lessons']:
            for question in lesson['questions']:
                del question['answer']
                del question['explanation']
    size = len(json.dumps(public, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
    require(size <= 900000, 'Catalog too close to/exceeds existing one-MiB BFF response limit')
    versions = set()
    for path in (ROOT / 'services/auth-service/src/main/resources/db/migration').glob('V*__*.sql'):
        version = tuple(int(part) for part in re.split('[._]', path.name.split('__')[0][1:]))
        require(version not in versions, f'Duplicate migration: {path.name}')
        versions.add(version)
    return public, {
        'version': data['version'], 'courses': len(courses), 'sections': len(lessons),
        'questions': len(questions), 'reviewedSourceFiles': len(sources),
        'revision': data['sourceRevision'], 'sourceFilesVerifiedInGit': verify_git,
        'publicCatalogBytes': size, 'maximumReviewedSourceBytes': max(source_bytes.values(), default=None),
        'prerequisiteGraphAcyclic': True, 'firstCompletionXp': len(lessons) * 40 + len(courses) * 120,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--git', action='store_true')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    public, result = validate(merge_catalog(), args.git)
    if args.output:
        args.output.write_text(json.dumps(public, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
