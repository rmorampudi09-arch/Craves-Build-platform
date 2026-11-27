# Turns the live server's compose.json into one Container Apps YAML per service.
# Usage: python3 gen.py compose.json outdir ENV_ID ACR_SERVER SB_CONN_FILE
# Secrets never go to stdout: only names and counts are printed.
import json, re, sys, os

compose, out, env_id, acr, sbfile = sys.argv[1:6]
PGHOST = "pg-craves-prod.postgres.database.azure.com"
PORTS = {"admin": 3000, "web": 3000, "delivery-intel": 3000}
SKIP = {"postgres", "caddy"}
SECRET = re.compile(r"PASSWORD|SECRET|KEY|TOKEN|CONNECTION|CREDENTIAL|PRIVATE|SAS|DSN|AUTH|JWT|SIGNING|SALT|PEPPER|WEBHOOK")
sb_conn = open(sbfile).read().strip()
svcs = json.load(open(compose))["services"]
names = [n for n in svcs if n not in SKIP]


def port(n):
    return PORTS.get(n, 8080)


def fix(k, v):
    v = str(v)
    v = v.replace("postgres:5432", PGHOST + ":5432").replace("sslmode=disable", "sslmode=require")
    v = v.replace("https://gw.svc.craves.in", "http://gateway")
    for n in names:
        v = v.replace("https://%s.svc.craves.in" % n, "http://%s:%d" % (n, port(n)))
    # the old Service Bus must not be shared with the live server: use the new, empty namespace
    if "servicebus.windows.net" in v and "SharedAccessKey=" in v:
        v = sb_conn
    return v


def q(s):
    return json.dumps(s)  # JSON strings are valid YAML scalars


os.makedirs(out, exist_ok=True)
left = {}
for n in names:
    s = svcs[n]
    envs = s.get("environment") or {}
    if isinstance(envs, list):
        envs = dict(e.split("=", 1) for e in envs)
    image = acr + "/" + s["image"].split("azurecr.io/", 1)[-1]
    secrets, env = [("acr-pw", "__ACRPW__")], []
    for k, v in envs.items():
        v = fix(k, v)
        if "svc.craves.in" in v or "172.30." in v or "servicebus.windows.net" in v and v != sb_conn:
            left.setdefault(n, []).append(k)
        if SECRET.search(k) or "://" in v and "@" in v:
            sn = re.sub(r"[^a-z0-9]+", "-", k.lower()).strip("-")
            secrets.append((sn, v))
            env.append("      - name: %s\n        secretRef: %s" % (k, sn))
        else:
            env.append("      - name: %s\n        value: %s" % (k, q(v)))
    y = ["properties:", "  environmentId: " + env_id, "  configuration:", "    activeRevisionsMode: Single",
         "    ingress:", "      external: false", "      transport: tcp", "      targetPort: %d" % port(n),
         "      exposedPort: %d" % port(n), "    registries:", "    - server: " + acr,
         "      username: " + acr.split(".")[0], "      passwordSecretRef: acr-pw", "    secrets:"]
    y += ["    - name: %s\n      value: %s" % (a, q(b)) for a, b in secrets]
    y += ["  template:", "    containers:", "    - name: " + n, "      image: " + image,
          "      resources:", "        cpu: 0.5", "        memory: 1Gi"]
    cmd = s.get("command")
    if cmd:
        y.append("      args: " + json.dumps(cmd if isinstance(cmd, list) else cmd.split()))
    y += ["      env:"] + env
    # one copy each, like the live server: the services run timed jobs that must not run twice
    y += ["    scale:", "      minReplicas: 1", "      maxReplicas: 1"]
    open(os.path.join(out, n + ".yaml"), "w").write("\n".join(y) + "\n")
    print("%-17s port=%d env=%d secrets=%d image=%s" % (n, port(n), len(env), len(secrets) - 1, image.split("/", 1)[1]))
for n, ks in left.items():
    print("CHECK %s: %s" % (n, ",".join(ks)))
assert len(names) == 14, names
