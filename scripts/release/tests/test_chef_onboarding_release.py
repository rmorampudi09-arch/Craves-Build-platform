import copy
import sys
from pathlib import Path
import unittest
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import chef_onboarding_release as release

class ChefReleaseGuardTests(unittest.TestCase):
    def app(self):
        return {'name':release.CHEF,'identity':{'type':'SystemAssigned'},'properties':{'configuration':{'activeRevisionsMode':'Single','ingress':{'traffic':[]},'secrets':[]},'template':{'containers':[{'name':'chef','image':'image-v1','env':[{'name':release.FLAG,'value':'false'},{'name':'PAYOUT_ENABLED','value':'false'}]}],'scale':{'minReplicas':1,'maxReplicas':1}}}}
    def test_only_explicit_chef_flag_changes_are_permitted(self):
        before=self.app();current=copy.deepcopy(before);current['properties']['template']['containers'][0]['env'][0]['value']='true'
        release.flag_guard(before,current,{release.FLAG:'true'})
        current['properties']['template']['containers'][0]['env'][1]['value']='true'
        with self.assertRaises(ValueError):release.flag_guard(before,current,{release.FLAG:'true'})
    def test_concurrent_image_or_secret_reference_blocks_activation(self):
        before=self.app();current=copy.deepcopy(before);container=current['properties']['template']['containers'][0]
        container['env'][0]['value']='true';container['image']='concurrent'
        with self.assertRaises(ValueError):release.flag_guard(before,current,{release.FLAG:'true'})
        container['image']='image-v1';container['env'][0]={'name':release.FLAG,'secretRef':'private-flag'}
        with self.assertRaises(ValueError):release.flag_guard(before,current,{release.FLAG:'true'})
    def test_disabled_finance_controls_never_become_enabled_by_chef_activation(self):
        bank=self.app();container=bank['properties']['template']['containers'][0]
        container['env']=[{'name':k,'value':'true'} for k in ('CRAVES_BANK_PROVIDER_ENABLED','CRAVES_BANK_WORKER_ENABLED')]+[{'name':k,'secretRef':'existing'} for k in ('CRAVES_BANK_DATA_KEYS_JSON','CRAVES_BANK_DATA_ACTIVE_KEY_ID','CRAVES_RAZORPAYX_KEY_ID','CRAVES_RAZORPAYX_KEY_SECRET','CRAVES_RAZORPAYX_ACCOUNT_NUMBER')]
        report={'bank':{'controls':{'submissions_enabled':False,'validation_enabled':True}}}
        with self.assertRaisesRegex(ValueError,'controls are disabled'):release.bank_available(bank,report)
        report['bank']['controls']['submissions_enabled']=True;release.bank_available(bank,report)
        container['env'][0]['value']='false'
        with self.assertRaisesRegex(ValueError,'already be enabled'):release.bank_available(bank,report)

    def settled_app(self,name):
        value=self.app();value['name']=name
        value['properties'].update(runningStatus='Running',provisioningState='Succeeded',latestRevisionName='current',latestReadyRevisionName='current')
        value['properties']['configuration']['ingress']['fqdn']='owned.azurecontainerapps.io'
        value['properties']['template']['containers'][0]['env'][0]['value']='true'
        return value

    def test_web_waits_for_full_single_revision_readiness_not_just_http(self):
        current=self.settled_app(release.WEB)
        with patch.object(release,'app',return_value=current),patch.object(release.inspect,'probe',return_value=(200,{})),patch.object(release,'ready_web',side_effect=[ValueError('Exactly the current web revision must be active'),None]) as ready,patch.object(release.time,'sleep') as sleep:
            self.assertEqual(release.wait_flags(release.WEB,current,{release.FLAG:'true'}),current)
            self.assertEqual(ready.call_count,2);sleep.assert_called_once_with(10)

    def test_configuration_and_unknown_readiness_errors_fail_immediately(self):
        current=self.settled_app(release.WEB)
        for message in ('Running web image differs from desired image','Running web template differs from desired configuration','Web traffic is split','unrecognized readiness failure'):
            with self.subTest(message=message),patch.object(release,'app',return_value=current),patch.object(release.inspect,'probe',return_value=(200,{})),patch.object(release,'ready_web',side_effect=ValueError(message)),patch.object(release.time,'sleep') as sleep:
                with self.assertRaisesRegex(ValueError,message):release.wait_flags(release.WEB,current,{release.FLAG:'true'})
                sleep.assert_not_called()

    def test_persistent_settling_failure_times_out_without_accepting_http_health(self):
        current=self.settled_app(release.WEB)
        with patch.object(release,'app',return_value=current),patch.object(release.inspect,'probe',return_value=(200,{})),patch.object(release,'ready_web',side_effect=ValueError('Exactly the current web revision must be active')) as ready,patch.object(release.time,'sleep'):
            with self.assertRaisesRegex(ValueError,'did not become healthy'):release.wait_flags(release.WEB,current,{release.FLAG:'true'})
            self.assertEqual(ready.call_count,120)

    def test_backend_does_not_use_web_readiness_and_concurrent_runtime_still_blocks(self):
        current=self.settled_app(release.CHEF)
        with patch.object(release,'app',return_value=current),patch.object(release.inspect,'probe',return_value=(200,{})),patch.object(release,'ready_web') as ready:
            self.assertEqual(release.wait_flags(release.CHEF,current,{release.FLAG:'true'}),current);ready.assert_not_called()
        before=copy.deepcopy(current);current['properties']['template']['containers'][0]['env'][1]['value']='true'
        with patch.object(release,'app',return_value=current),patch.object(release.inspect,'probe') as probe,patch.object(release.time,'sleep') as sleep:
            with self.assertRaisesRegex(ValueError,'Unrelated runtime'):release.wait_flags(release.CHEF,before,{release.FLAG:'true'})
            probe.assert_not_called();sleep.assert_not_called()

    def test_failed_full_readiness_still_restores_only_changed_web_flag(self):
        bank=self.settled_app(release.BANK);chef=self.settled_app(release.CHEF);web=self.settled_app(release.WEB)
        previous=copy.deepcopy(web);previous['properties']['template']['containers'][0]['env'][0]['value']='false'
        output=Mock()
        with patch.object(release,'preflight',return_value={}),patch.object(release,'applied'),patch.object(release,'bank_available'),patch.object(release,'verify_image'),patch.object(release,'app',side_effect=[bank,bank,chef,previous,chef,previous,web]),patch.object(release,'wait_flags',side_effect=[chef,ValueError('Chef activation revision did not become healthy')]),patch.object(release,'azure') as azure:
            with self.assertRaisesRegex(RuntimeError,'previous flag values restored'):release.activate('a'*40,output)
            self.assertEqual(azure.call_count,3)
            self.assertEqual(azure.call_args.args,('containerapp','update','-g',release.RG,'-n',release.WEB,'--set-env-vars',release.FLAG+'=false'))
            output.write_text.assert_not_called()

    def admin_app(self,image='old-admin'):
        value=self.settled_app(release.ADMIN);value['properties']['template']['containers'][0]['image']=image
        value['properties']['configuration']['ingress']['fqdn']='admin-origin.azurecontainerapps.io'
        return value

    def web_env(self):
        web=self.app();web['properties']['template']['containers'][0]['env']=[{'name':k,'value':'public'} for k in release.FIREBASE]
        return web

    def test_admin_deploy_refuses_an_app_that_does_not_serve_admin_craves_in(self):
        pages={release.ADMIN_HOST+'/sign-in':(200,b'static/chunks/a.js'),'https://admin-origin.azurecontainerapps.io/sign-in':(200,b'static/chunks/b.js')}
        with patch.object(release,'app',return_value=self.admin_app()),patch.object(release.inspect,'probe',side_effect=lambda url:pages[url]),patch.object(release,'build_image') as build,patch.object(release,'azure') as azure:
            with self.assertRaisesRegex(ValueError,'not served by'):release.deploy_admin(Path('.'),'a'*40,'1',Mock())
            build.assert_not_called();azure.assert_not_called()

    def test_admin_deploy_swaps_only_the_image_and_verifies_the_public_host(self):
        before=self.admin_app();after=self.admin_app('craves/admin-web@sha256:new')
        served={'value':b'static/chunks/old.js'}
        def probe(url):
            if url.endswith('/api/admin/me'):return (401,b'{}')
            return (200,served['value'])
        def azure(*args):served['value']=b'static/chunks/new.js'
        output=Mock()
        with patch.object(release,'app',side_effect=lambda name:self.web_env() if name==release.WEB else (after if served['value']==b'static/chunks/new.js' else before)),\
             patch.object(release.inspect,'probe',side_effect=probe),patch.object(release,'resolve_image',return_value='old-pinned'),\
             patch.object(release,'build_image',return_value='craves/admin-web@sha256:new') as build,patch.object(release,'source_guard'),\
             patch.object(release,'verify_image'),patch.object(release,'azure',side_effect=azure) as update,patch.object(release.time,'sleep'):
            release.deploy_admin(Path('.'),'a'*40,'1',output)
        self.assertEqual(build.call_args.kwargs['dockerfile'],'Dockerfile.admin')
        self.assertEqual(update.call_args_list[0].args,('containerapp','update','-g',release.RG,'-n',release.ADMIN,'--image','craves/admin-web@sha256:new','--no-wait'))
        self.assertEqual(update.call_count,1)

    def test_admin_deploy_restores_previous_image_when_it_never_verifies(self):
        before=self.admin_app();after=self.admin_app('craves/admin-web@sha256:new')
        state={'updated':False}
        def azure(*args):state['updated']=True
        with patch.object(release,'app',side_effect=lambda name:self.web_env() if name==release.WEB else (after if state['updated'] else before)),\
             patch.object(release.inspect,'probe',side_effect=lambda url:(401,b'') if url.endswith('/me') else (200,b'static/chunks/same.js')),\
             patch.object(release,'resolve_image',return_value='old-pinned'),patch.object(release,'build_image',return_value='craves/admin-web@sha256:new'),\
             patch.object(release,'source_guard'),patch.object(release,'verify_image',side_effect=ValueError('label')),patch.object(release,'azure',side_effect=azure) as update,patch.object(release.time,'sleep'):
            with self.assertRaisesRegex(RuntimeError,'previous admin image restore requested'):release.deploy_admin(Path('.'),'a'*40,'1',Mock())
        self.assertEqual(update.call_args.args,('containerapp','update','-g',release.RG,'-n',release.ADMIN,'--image','old-pinned','--no-wait'))

    def test_notification_deploy_swaps_only_the_image(self):
        before=self.settled_app(release.NOTIFICATION);after=copy.deepcopy(before)
        after['properties']['template']['containers'][0]['image']='craves/notification-service@sha256:new'
        state={'updated':False}
        def azure(*args):state['updated']=True
        with patch.object(release,'app',side_effect=lambda name:after if state['updated'] else before),patch.object(release,'resolve_image',return_value='old-pinned'),\
             patch.object(release,'build_image',return_value='craves/notification-service@sha256:new') as build,patch.object(release,'source_guard'),\
             patch.object(release,'verify_image'),patch.object(release,'azure',side_effect=azure) as update,patch.object(release.time,'sleep'):
            release.deploy_notification(Path('.'),'a'*40,'1',Mock())
        self.assertEqual(build.call_args.args[1:3],('services/notification-service','craves/notification-service'))
        self.assertEqual(update.call_args_list,[unittest.mock.call('containerapp','update','-g',release.RG,'-n',release.NOTIFICATION,'--image','craves/notification-service@sha256:new','--no-wait')])

    def test_notification_deploy_restores_previous_image_when_it_never_verifies(self):
        before=self.settled_app(release.NOTIFICATION);after=copy.deepcopy(before)
        after['properties']['template']['containers'][0]['image']='craves/notification-service@sha256:new'
        state={'updated':False}
        def azure(*args):state['updated']=True
        with patch.object(release,'app',side_effect=lambda name:after if state['updated'] else before),patch.object(release,'resolve_image',return_value='old-pinned'),\
             patch.object(release,'build_image',return_value='craves/notification-service@sha256:new'),patch.object(release,'source_guard'),\
             patch.object(release,'verify_image',side_effect=ValueError('label')),patch.object(release,'azure',side_effect=azure) as update,patch.object(release.time,'sleep'):
            with self.assertRaisesRegex(RuntimeError,'previous notification image restore requested'):release.deploy_notification(Path('.'),'a'*40,'1',Mock())
        self.assertEqual(update.call_args.args,('containerapp','update','-g',release.RG,'-n',release.NOTIFICATION,'--image','old-pinned','--no-wait'))

    def test_media_creates_public_photo_storage_and_points_catalog_at_it(self):
        before=self.settled_app(release.CATALOG);after=copy.deepcopy(before)
        after['properties']['template']['containers'][0]['env']+=[{'name':'CRAVES_STORAGE_ENDPOINT_VALUE','secretRef':'media-storage'},{'name':'CRAVES_STORAGE_MEDIA_CONTAINER','value':'media'}]
        state={'updated':False};calls=[]
        def azure(*args):
            calls.append(args)
            if args[:3]==('storage','account','list'):return []
            if args[:3]==('storage','account','check-name'):return {'nameAvailable':True}
            if args[:3]==('storage','container-rm','exists'):return {'exists':False}
            if args[:2]==('containerapp','update'):state['updated']=True
        conn='DefaultEndpointsProtocol=https;AccountName='+release.MEDIA_ACCOUNT+';AccountKey=k;EndpointSuffix=core.windows.net'
        secrets=[]
        def run(*args,**kwargs):
            if 'secret' in args:secrets.append(Path(args[args.index('--secrets')+1].split('=@')[1]).read_text())
            return conn if 'show-connection-string' in args else ''
        probes={'probe.txt':200,'comp=list':404}
        with patch.object(release,'app',side_effect=lambda name:after if state['updated'] else before),patch.object(release,'azure',side_effect=azure),\
             patch.object(release,'run',side_effect=run) as cli,patch.object(release.inspect,'probe',side_effect=lambda url:(next(v for k,v in probes.items() if k in url),b'')),\
             patch.object(release.time,'sleep'):
            release.configure_media(Mock())
        self.assertIn(('storage','container-rm','create','-g',release.RG,'--storage-account',release.MEDIA_ACCOUNT,'-n','media','--public-access','blob'),calls)
        self.assertEqual(calls[-1],('containerapp','update','-g',release.RG,'-n',release.CATALOG,'--set-env-vars','CRAVES_STORAGE_ENDPOINT_VALUE=secretref:media-storage','CRAVES_STORAGE_MEDIA_CONTAINER=media','--no-wait'))
        self.assertEqual(secrets,[conn])
        self.assertFalse(any(conn in arg for call in cli.call_args_list for arg in call.args))

    def test_media_refuses_a_listable_photo_container(self):
        before=self.settled_app(release.CATALOG)
        def azure(*args):
            if args[:3]==('storage','account','list'):return [{'name':release.MEDIA_ACCOUNT,'allowBlobPublicAccess':True}]
            if args[:3]==('storage','container-rm','exists'):return {'exists':True}
        with patch.object(release,'app',return_value=before),patch.object(release,'azure',side_effect=azure) as update,\
             patch.object(release,'run',return_value='DefaultEndpointsProtocol=https;AccountName='+release.MEDIA_ACCOUNT+';AccountKey=k'),\
             patch.object(release.inspect,'probe',return_value=(200,b'')),patch.object(release.time,'sleep'):
            with self.assertRaisesRegex(ValueError,'must not be listable'):release.configure_media(Mock())
        self.assertFalse(any(call.args[:2]==('containerapp','update') for call in update.call_args_list))

if __name__=='__main__':unittest.main()
