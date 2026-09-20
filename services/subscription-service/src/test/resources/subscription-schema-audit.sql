-- Fixed read-only catalog projection: no application rows, financial data, grants or mutations.
-- Execute inside BEGIN READ ONLY with SET LOCAL search_path = pg_catalog.
-- Compare JSON structurally on the same PostgreSQL major; history and role grants are separate evidence.
WITH relations AS (
  SELECT c.* FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'subscription_schema' AND c.relkind IN ('r','p','v','m','S','f')
), objects AS (
  -- UNION must retain full TEXT identities: PostgreSQL name truncates long
  -- relation.constraint keys, creating ordering ties despite different objects.
  SELECT 'relations' AS kind, c.relname::text AS name, jsonb_build_object(
    'name',c.relname,'kind',c.relkind,'persistence',c.relpersistence,
    'rowSecurity',c.relrowsecurity,'forceRowSecurity',c.relforcerowsecurity,
    'options',coalesce(to_jsonb(c.reloptions),'[]'::jsonb),
    'partitionBound',pg_catalog.pg_get_expr(c.relpartbound,c.oid,false),
    'view',CASE WHEN c.relkind IN ('v','m') THEN pg_catalog.pg_get_viewdef(c.oid,false) ELSE NULL END) AS definition
  FROM relations c
  UNION ALL
  SELECT 'columns',c.relname||'.'||a.attname,jsonb_build_object(
    'relation',c.relname,'name',a.attname,'position',a.attnum,
    'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,
    'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid,false),'identity',a.attidentity,
    'generated',a.attgenerated,'collation',CASE WHEN a.attcollation=0 THEN NULL ELSE cn.nspname||'.'||co.collname END)
  FROM relations c JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
  LEFT JOIN pg_catalog.pg_collation co ON co.oid=a.attcollation
  LEFT JOIN pg_catalog.pg_namespace cn ON cn.oid=co.collnamespace
  UNION ALL
  SELECT 'constraints',c.relname||'.'||k.conname,jsonb_build_object(
    'relation',c.relname,'name',k.conname,'type',k.contype,
    'definition',pg_catalog.pg_get_constraintdef(k.oid,false),'validated',k.convalidated,
    'deferrable',k.condeferrable,'initiallyDeferred',k.condeferred,
    'updateAction',k.confupdtype,'deleteAction',k.confdeltype,'matchType',k.confmatchtype)
  FROM relations c JOIN pg_catalog.pg_constraint k ON k.conrelid=c.oid
  UNION ALL
  SELECT 'indexes',ic.relname,jsonb_build_object(
    'relation',c.relname,'name',ic.relname,'definition',pg_catalog.pg_get_indexdef(i.indexrelid,0,false),
    'unique',i.indisunique,'primary',i.indisprimary,'valid',i.indisvalid,'ready',i.indisready,
    'replicaIdentity',i.indisreplident,'nullsNotDistinct',i.indnullsnotdistinct)
  FROM relations c JOIN pg_catalog.pg_index i ON i.indrelid=c.oid
  JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid
  UNION ALL
  SELECT 'triggers',c.relname||'.'||t.tgname,jsonb_build_object(
    'relation',c.relname,'name',t.tgname,'enabled',t.tgenabled,
    'definition',pg_catalog.pg_get_triggerdef(t.oid,false))
  FROM relations c JOIN pg_catalog.pg_trigger t ON t.tgrelid=c.oid AND NOT t.tgisinternal
  UNION ALL
  SELECT 'policies',c.relname||'.'||p.polname,jsonb_build_object(
    'relation',c.relname,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
    'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid,false),
    'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid,false),
    'roles',(SELECT jsonb_agg(CASE WHEN role=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role) END ORDER BY role)
             FROM unnest(p.polroles) role))
  FROM relations c JOIN pg_catalog.pg_policy p ON p.polrelid=c.oid
  UNION ALL
  SELECT 'functions',p.proname||'('||pg_catalog.pg_get_function_identity_arguments(p.oid)||')',jsonb_build_object(
    'name',p.proname,'arguments',pg_catalog.pg_get_function_identity_arguments(p.oid),
    'definition',pg_catalog.pg_get_functiondef(p.oid),'securityDefiner',p.prosecdef,
    'configuration',coalesce(to_jsonb(p.proconfig),'[]'::jsonb),'volatility',p.provolatile,'parallel',p.proparallel)
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='subscription_schema' AND p.prokind IN ('f','p')
  UNION ALL
  SELECT 'sequences',c.relname,jsonb_build_object('name',c.relname,
    'type',pg_catalog.format_type(s.seqtypid,NULL),'start',s.seqstart,'increment',s.seqincrement,
    'minimum',s.seqmin,'maximum',s.seqmax,'cache',s.seqcache,'cycle',s.seqcycle)
  FROM relations c JOIN pg_catalog.pg_sequence s ON s.seqrelid=c.oid
), sections AS (
  SELECT kind,jsonb_agg(definition ORDER BY name COLLATE "C") AS definitions FROM objects GROUP BY kind
)
SELECT jsonb_build_object(
  'manifestVersion',1,'schema','subscription_schema',
  'schemaExists',EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='subscription_schema'),
  'relations',coalesce((SELECT definitions FROM sections WHERE kind='relations'),'[]'::jsonb),
  'columns',coalesce((SELECT definitions FROM sections WHERE kind='columns'),'[]'::jsonb),
  'constraints',coalesce((SELECT definitions FROM sections WHERE kind='constraints'),'[]'::jsonb),
  'indexes',coalesce((SELECT definitions FROM sections WHERE kind='indexes'),'[]'::jsonb),
  'triggers',coalesce((SELECT definitions FROM sections WHERE kind='triggers'),'[]'::jsonb),
  'policies',coalesce((SELECT definitions FROM sections WHERE kind='policies'),'[]'::jsonb),
  'functions',coalesce((SELECT definitions FROM sections WHERE kind='functions'),'[]'::jsonb),
  'sequences',coalesce((SELECT definitions FROM sections WHERE kind='sequences'),'[]'::jsonb)
)::text;
