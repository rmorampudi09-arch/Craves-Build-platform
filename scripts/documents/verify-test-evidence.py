#!/usr/bin/env python3
"""Summarize real JUnit reports and reject skipped or absent PDF-specific tests."""
import argparse
import json
from pathlib import Path
import xml.etree.ElementTree as ET

REQUIRED = {
    'notification-service': {'DocumentModelsTest': 10, 'DocumentPdfRendererTest': 4,
        'DocumentRepositoryDbTest': 10, 'DocumentBrandTest': 2,
        'DocumentControllerTest': 5, 'DocumentMigrationDbTest': 1},
    'order-service': {'OrderDocumentSourceDbTest': 5},
    'integration-service': {'ChefDocumentSourceDbTest': 5},
    'subscription-service': {'SubscriptionDocumentSourceDbTest': 5},
}

def summarize(folder, service):
    result = {'service': service, 'tests': 0, 'failures': 0, 'errors': 0, 'skipped': 0, 'pdfTests': {}}
    for file in sorted(Path(folder).glob('TEST-*.xml')):
        suite = ET.parse(file).getroot()
        name = suite.attrib.get('name', '').rsplit('.', 1)[-1]
        counts = {key: int(suite.attrib.get(key, 0)) for key in ['tests', 'failures', 'errors', 'skipped']}
        for key, value in counts.items(): result[key] += value
        if name in REQUIRED[service]: result['pdfTests'][name] = counts
    if not result['tests'] or result['failures'] or result['errors']:
        raise ValueError('Owning-service tests failed or reports are missing')
    for name, minimum in REQUIRED[service].items():
        counts = result['pdfTests'].get(name)
        if counts is None or counts['tests'] < minimum or any(counts[k] for k in ['failures', 'errors', 'skipped']):
            raise ValueError('Required PDF test missing, skipped or failed: ' + name)
    result['pdfTestsPassed'] = sum(x['tests'] for x in result['pdfTests'].values())
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--service', required=True, choices=REQUIRED)
    parser.add_argument('--reports', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = summarize(args.reports, args.service)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
