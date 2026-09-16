import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('web_shape', Path(__file__).parents[1] / 'inspect-customer-web-shape.py')
m = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(m)


class WebShapeTest(unittest.TestCase):
    def test_equal_is_empty_and_added_default_shape_is_explicit(self):
        self.assertEqual([], m.differences({'a': 1}, {'a': 1}))
        self.assertEqual([{'path':'$.a', 'desired':{'absent':True}, 'running':{'type':'NoneType','empty':True}}], m.differences({}, {'a':None}))

    def test_literal_settings_are_not_exported(self):
        result = m.differences({'env':[{'name':'BOUND', 'value':'PRIVATE_BEFORE'}]}, {'env':[{'name':'BOUND','value':'PRIVATE_AFTER'}]})
        self.assertEqual('$.env[0].value', result[0]['path'])
        self.assertNotIn('PRIVATE', json.dumps(result))
        self.assertNotIn('BOUND', json.dumps(result))

    def test_real_scalar_changes_are_not_hidden_as_empty(self):
        self.assertEqual({'type':'int','scalar':2}, m.differences({'replicas':1}, {'replicas':2})[0]['running'])
        self.assertNotEqual([], m.differences({'env':[]}, {'env':[{'value':'private'}]}))

    def test_mutating_or_unscoped_command_never_runs(self):
        with patch.object(m.subprocess, 'run') as run:
            for args in [('containerapp','update'), ('containerapp','show','-g','other','-n',m.APP)]:
                with self.assertRaises(ValueError): m.az(*args)
            run.assert_not_called()


if __name__ == '__main__': unittest.main()
