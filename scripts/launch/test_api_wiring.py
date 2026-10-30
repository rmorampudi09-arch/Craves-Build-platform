"""Every address the apps call must exist in the backend (scripts/launch/api_wiring.py)."""
import importlib.util
import json
import tempfile
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('api_wiring', Path(__file__).with_name('api_wiring.py'))
wiring = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wiring)


def write(root, path, text):
    target = root / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(textwrap.dedent(text))


def fixture(root, controller_path='/api/v1/chef/application', web_path='/chef/application',
            mobile_base='/api/v1/rider', mobile_call='/support/issues'):
    write(root, 'services/user-chef-service/src/main/java/in/craves/userchef/web/ChefApplicationController.java', f'''
        @RestController
        @RequestMapping("{controller_path}")
        public class ChefApplicationController {{
            @GetMapping public Object get() {{ return null; }}
            @PostMapping("/proof-files") public Object upload() {{ return null; }}
        }}
    ''')
    write(root, 'services/integration-service/src/main/java/in/craves/integration/fleet/RiderController.java', '''
        @RestController
        @RequestMapping("/api/v1/rider")
        public class RiderController {
            @PostMapping("/support/issues") public Object report() { return null; }
            @GetMapping("/trips/{tripId}") public Object trip() { return null; }
        }
    ''')
    write(root, 'apps/customer-web-next/src/app/api/chef/application/route.ts', f'''
        import {{ apiBaseUrl }} from "@/shared/lib/server-api";
        export async function GET() {{
          return fetch(`${{apiBaseUrl()}}{web_path}`);
        }}
    ''')
    write(root, 'apps/mobile/src/features/rider/api/riderApi.ts', f'''
        const BASE = '{mobile_base}';
        const TRIPS_PATH = '/api/v1/rider/trips';
        export const report = (issue) => apiClient.post(`${{BASE}}{mobile_call}`, issue);
        export const trip = (id) => apiClient.get(`${{TRIPS_PATH}}/${{id}}`);
    ''')


class ApiWiringTest(unittest.TestCase):
    def missing(self, **kwargs):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(Path(tmp), **kwargs)
            return wiring.scan(Path(tmp))[2]

    def test_matching_wiring_passes(self):
        self.assertEqual(self.missing(), {})

    def test_renamed_backend_endpoint_is_caught(self):
        self.assertIn('/chef/application', self.missing(controller_path='/api/v1/chef/applications'))

    def test_wrong_web_address_is_caught(self):
        self.assertIn('/chef/aplication', self.missing(web_path='/chef/aplication'))

    def test_wrong_mobile_address_under_a_local_prefix_is_caught(self):
        self.assertIn('/rider/support/issue', self.missing(mobile_call='/support/issue'))

    def test_base_address_finished_with_an_id_passes(self):
        # TRIPS_PATH is only used as `${TRIPS_PATH}/${id}`, which matches /rider/trips/{tripId}.
        self.assertNotIn('/rider/trips', self.missing())

    def test_repository_has_no_address_without_an_endpoint(self):
        back, uses, missing = wiring.scan(ROOT)
        self.assertGreater(len(back), 300, 'backend endpoints were not found; the scanner is broken')
        self.assertGreater(len(uses), 100, 'app addresses were not found; the scanner is broken')
        allow = json.loads((ROOT / 'scripts/launch/api_wiring_allowlist.json').read_text())
        broken = {p: l[:3] for p, l in missing.items() if p not in allow}
        self.assertEqual(broken, {}, 'App calls a backend address that has no endpoint')
        self.assertEqual(sorted(p for p in allow if p not in missing), [], 'Remove stale allowlist entries')


if __name__ == '__main__':
    unittest.main()
