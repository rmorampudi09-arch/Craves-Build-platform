import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('health_repair', Path(__file__).with_name('repair_notification_health.py'))
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)


def app(extra=()):
    return {'properties': {'runningStatus':'Running','latestRevisionName':'ready','latestReadyRevisionName':'ready',
        'template': {'containers': [{'name':'app','image':repair.runtime.IMAGES['notification'],
            'env':[{'name':'CRAVES_TOKEN_REVOCATION_ENABLED','value':'false'}, *extra]}]}}}


class HealthRepairTests(unittest.TestCase):
    def test_only_explicitly_unused_redis_is_accepted(self):
        repair.validate(app())
        repair.validate(app([{'name':repair.SETTING,'value':'false'}]))

    def test_enabled_or_implicit_revocation_is_rejected(self):
        for value in ('true', '', None):
            candidate = app()
            candidate['properties']['template']['containers'][0]['env'][0]['value'] = value
            with self.assertRaises(repair.runtime.guard.GuardError):
                repair.validate(candidate)

    def test_any_configured_redis_is_rejected(self):
        for key in ('SPRING_DATA_REDIS_HOST','SPRING_REDIS_URL','SPRING_DATA_REDIS_PASSWORD'):
            with self.assertRaises(repair.runtime.guard.GuardError):
                repair.validate(app([{'name':key,'value':'configured'}]))

    def test_explicit_health_monitoring_is_not_overridden(self):
        with self.assertRaises(repair.runtime.guard.GuardError):
            repair.validate(app([{'name':repair.SETTING,'value':'true'}]))

    def test_external_configuration_requires_review(self):
        repair.validate(app([{'name':'SPRING_PROFILES_ACTIVE','value':'prod'}]))
        for key in ('SPRING_APPLICATION_JSON','SPRING_CONFIG_IMPORT','SPRING_PROFILES_ACTIVE'):
            with self.assertRaises(repair.runtime.guard.GuardError):
                repair.validate(app([{'name':key,'value':'configured'}]))
        with self.assertRaises(repair.runtime.guard.GuardError):
            repair.validate(app([{'name':'SPRING_PROFILES_INCLUDE','value':'other'}]))

    def test_unknown_image_is_rejected(self):
        candidate = app()
        candidate['properties']['template']['containers'][0]['image'] = 'another-version'
        with self.assertRaises(repair.runtime.guard.GuardError):
            repair.validate(candidate)

    def test_startup_overrides_are_rejected(self):
        with self.assertRaises(repair.runtime.guard.GuardError):
            repair.validate(app([{'name':'JAVA_TOOL_OPTIONS','value':'-Dspring.data.redis.host=example'}]))
        candidate = app()
        candidate['properties']['template']['containers'][0]['args'] = ['custom']
        with self.assertRaises(repair.runtime.guard.GuardError):
            repair.validate(candidate)


if __name__ == '__main__':
    unittest.main()

