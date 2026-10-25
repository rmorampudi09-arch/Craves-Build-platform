"""Every backend service must refuse to start in production when its build lacks code production runs.

See docs/runbooks/live-runtime-safety.md. Runs in launch regression CI (test_launch_*.py).
"""
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
SERVICES = sorted(p for p in (ROOT / 'services').iterdir() if (p / 'pom.xml').is_file())
CONTROLLER = re.compile(r'^@(RestController|Controller)\b', re.M)


def entries(service):
    """(class name, is live-only) for each non-comment line of the service's lock file."""
    lock = service / 'src/main/resources/live-runtime-lock.txt'
    for line in lock.read_text().splitlines():
        name = line.split('#', 1)[0].strip()
        if name:
            yield name, 'live-only' in line


def source(service, name):
    return service / 'src/main/java' / (name.replace('.', '/') + '.java')


class LiveRuntimeLockTest(unittest.TestCase):
    def test_every_service_checks_the_lock_before_starting(self):
        self.assertGreaterEqual(len(SERVICES), 8)
        for service in SERVICES:
            with self.subTest(service=service.name):
                main = next(p for p in (service / 'src/main/java').rglob('*.java')
                            if 'SpringApplication.run(' in p.read_text())
                text = main.read_text()
                self.assertTrue((main.parent / 'LiveRuntimeLock.java').is_file())
                self.assertIn('LiveRuntimeLock.verify();', text)
                self.assertLess(text.index('LiveRuntimeLock.verify();'), text.index('SpringApplication.run('),
                                'the lock must run before Spring (and Flyway) start')

    def test_listed_code_exists_or_is_marked_live_only(self):
        for service in SERVICES:
            for name, live_only in entries(service):
                with self.subTest(service=service.name, entry=name):
                    if live_only:
                        self.assertFalse(source(service, name).is_file(),
                                         f'{name} is now on main: drop "# live-only" from its lock line')
                    else:
                        self.assertTrue(source(service, name).is_file(),
                                        f'{name} is locked but missing. Restore it, or retire it on purpose '
                                        f'(remove the line in {service.name}/src/main/resources/live-runtime-lock.txt)')

    def test_every_controller_is_locked(self):
        for service in SERVICES:
            locked = {name for name, _ in entries(service)}
            java = service / 'src/main/java'
            for path in java.rglob('*.java'):
                if CONTROLLER.search(path.read_text()):
                    name = str(path.relative_to(java).with_suffix('')).replace('/', '.')
                    with self.subTest(service=service.name, controller=name):
                        self.assertIn(name, locked, f'add {name} to {service.name}/src/main/resources/live-runtime-lock.txt')


if __name__ == '__main__':
    unittest.main()
