import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('pin', Path(__file__).with_name('pin-reviewed-backends.py'))
pin = importlib.util.module_from_spec(spec); spec.loader.exec_module(pin)
SHA = 'a' * 40
DIGEST = 'sha256:' + 'b' * 64
REGISTRY = 'fixture.azurecr.io'


class PinTest(unittest.TestCase):
    def test_exact_tag_is_pinned_and_existing_digest_is_idempotent(self):
        target, changed = pin.image_plan('auth', SHA, REGISTRY, f'{REGISTRY}/craves/auth-service:{SHA}', DIGEST)
        self.assertTrue(changed)
        self.assertEqual((target, False), pin.image_plan('auth', SHA, REGISTRY, target, DIGEST))

    def test_mutable_wrong_unknown_and_changed_digest_are_rejected(self):
        for image in [f'{REGISTRY}/craves/auth-service:latest', f'{REGISTRY}/craves/order-service:{SHA}',
                      'foreign.azurecr.io/craves/auth-service:' + SHA,
                      f'{REGISTRY}/craves/auth-service@sha256:' + 'c' * 64]:
            with self.subTest(image=image), self.assertRaises(ValueError):
                pin.image_plan('auth', SHA, REGISTRY, image, DIGEST)

    def test_all_sources_are_checked_before_any_deployment(self):
        writes = []
        def read(args):
            if args[:2] == ['containerapp', 'show']:
                app = args[args.index('-n') + 1]
                service = next(s for s, a in pin.TARGETS.items() if a == app)
                return f'{REGISTRY}/craves/{service}-service:' + ('latest' if service == 'order' else SHA)
            return DIGEST
        with self.assertRaises(ValueError):
            pin.execute(dict.fromkeys(pin.TARGETS, SHA), read, lambda *a: writes.append(a), REGISTRY, 'group')
        self.assertEqual([], writes)

    def test_only_tagged_exact_images_are_deployed(self):
        writes = []
        def read(args):
            if args[:2] == ['containerapp', 'show']:
                app = args[args.index('-n') + 1]
                service = next(s for s, a in pin.TARGETS.items() if a == app)
                return f'{REGISTRY}/craves/{service}-service' + ('@' + DIGEST if service == 'auth' else ':' + SHA)
            return DIGEST
        pin.execute(dict.fromkeys(pin.TARGETS, SHA), read, lambda *a: writes.append(a), REGISTRY, 'group')
        self.assertEqual(['user-chef', 'order'], [row[3] for row in writes])
        self.assertTrue(all(row[2].endswith('@' + DIGEST) for row in writes))

    def test_concurrent_image_change_stops_before_write(self):
        calls = {}; writes = []
        def read(args):
            if args[:2] == ['containerapp', 'show']:
                app = args[args.index('-n') + 1]
                service = next(s for s, a in pin.TARGETS.items() if a == app)
                calls[service] = calls.get(service, 0) + 1
                return f'{REGISTRY}/craves/{service}-service:' + (SHA if calls[service] == 1 else 'other')
            return DIGEST
        with self.assertRaises(ValueError):
            pin.execute(dict.fromkeys(pin.TARGETS, SHA), read, lambda *a: writes.append(a), REGISTRY, 'group')
        self.assertEqual([], writes)


if __name__ == '__main__':
    unittest.main()
