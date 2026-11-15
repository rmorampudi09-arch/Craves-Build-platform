// Craves browse load test at 5,000+ people (owner-approved; read-only public endpoints; no sign-in, orders or payments).
// Run on four generators with SHARE=0.25 each; all wait for START_AT (epoch seconds) so their minutes line up.
// Keep VUs per generator low: every VU holds its own connections, and a test machine holding several hundred
// open connections had its new connections time out on the machine (15 Nov 2026), which is not what users see.
// Totals: 100 req/s for 2 min, surge to 1,000 req/s (5,000 people at one request per 5 s) within 1 min,
// hold 5 min, 1,250 req/s (6,250 people) for 3 min. PLAN=ramp instead climbs 200, 500, 800, 1,000 req/s and holds
// 1,000 for 4 min. Prints one line per minute at the end.
import http from 'k6/http';
import { sleep } from 'k6';

const API = 'https://api.craves.in/api/v1/catalog';
const WEB = 'https://craves.in/hyderabad';
const SHARE = Number(__ENV.SHARE || 1);
const START_AT = Number(__ENV.START_AT || 0);
const BASE = { headers: { 'User-Agent': 'Craves-LoadTest/1.0 (k6; owner-approved)' }, timeout: '20s' };
const NAMES = ['discover-city', 'discover-nearby', 'kitchen', 'menu', 'web-city'];
const MINUTES = 13;
const rate = (total) => Math.max(1, Math.round(total * SHARE));

const perMinute = {};
for (let m = 0; m < MINUTES; m++) {
  perMinute[`http_req_duration{m:${m}}`] = ['p(95)<60000'];
  perMinute[`http_req_failed{m:${m}}`] = ['rate<=1'];
}
for (const n of NAMES) perMinute[`http_req_duration{name:${n}}`] = ['p(95)<60000'];

export const options = {
  discardResponseBodies: true,
  setupTimeout: '10m',
  scenarios: {
    browse: {
      executor: 'ramping-arrival-rate',
      startRate: rate(__ENV.PLAN === 'ramp' ? 50 : 100), timeUnit: '1s', preAllocatedVUs: rate(400), maxVUs: rate(2000),
      stages: __ENV.PLAN === 'ramp'
        ? [[200, '1m'], [500, '1m'], [500, '1m'], [800, '1m'], [800, '1m'], [1000, '1m'], [1000, '4m'], [0, '30s']]
          .map(([t, d]) => ({ target: rate(t), duration: d }))
        : [[100, '2m'], [1000, '1m'], [1000, '5m'], [1250, '30s'], [1250, '3m'], [0, '30s']]
          .map(([t, d]) => ({ target: rate(t), duration: d })),
    },
  },
  thresholds: Object.assign({
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '1m' }],
    http_req_duration: [{ threshold: 'p(95)<4000', abortOnFail: true, delayAbortEval: '1m' }],
  }, perMinute),
  summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  while (Date.now() / 1000 < START_AT) sleep(1);
  const r = http.get(`${API}/kitchens?city=Hyderabad`, Object.assign({ responseType: 'text' }, BASE));
  const body = r.json();
  const list = body.kitchens || body.items || body.content || body;
  const ids = list.map((k) => k.id).filter(Boolean);
  if (ids.length === 0) throw new Error('no kitchens to browse');
  return { ids, t0: Date.now() };
}

let logged = 0;
function get(url, name, t0) {
  const tags = { name, m: String(Math.floor((Date.now() - t0) / 60000)) };
  const res = http.get(url, Object.assign({ tags }, BASE));
  if ((res.status === 0 || res.status >= 400) && logged < 1 && __VU <= 200) {
    logged++;
    console.log(`ERR ${new Date().toISOString()} ${name} status=${res.status} ms=${Math.round(res.timings.duration)} ${res.error || ''}`);
  }
}

export default function (data) {
  const x = Math.random();
  const id = data.ids[Math.floor(Math.random() * data.ids.length)];
  if (x < 0.15) get(`${API}/kitchens?city=Hyderabad`, 'discover-city', data.t0);
  else if (x < 0.35) get(`${API}/kitchens?latitude=17.3850&longitude=78.4867&radiusKm=10`, 'discover-nearby', data.t0);
  else if (x < 0.60) get(`${API}/kitchens/${id}`, 'kitchen', data.t0);
  else if (x < 0.85) get(`${API}/kitchens/${id}/menu-items`, 'menu', data.t0);
  else get(WEB, 'web-city', data.t0);
}

export function handleSummary(data) {
  const v = (k) => (data.metrics[k] || {}).values || {};
  const r = (x) => (x === undefined ? '-' : Math.round(x));
  const out = ['min reqs errors p50 p95 p99'];
  for (let m = 0; m < MINUTES; m++) {
    const d = v(`http_req_duration{m:${m}}`);
    const f = v(`http_req_failed{m:${m}}`);
    const n = (f.passes || 0) + (f.fails || 0);
    if (n) out.push([m, n, f.passes || 0, r(d['p(50)']), r(d['p(95)']), r(d['p(99)'])].join(' '));
  }
  const reqs = v('http_reqs');
  const fl = v('http_req_failed');
  const dur = v('http_req_duration');
  out.push(`total reqs=${reqs.count} rate=${r(reqs.rate)} failed=${fl.passes || 0} p50=${r(dur['p(50)'])} p95=${r(dur['p(95)'])} p99=${r(dur['p(99)'])} dropped=${v('dropped_iterations').count || 0} vus_max=${v('vus_max').max}`);
  out.push('p95 by endpoint: ' + NAMES.map((n) => `${n}=${r(v(`http_req_duration{name:${n}}`)['p(95)'])}`).join(' '));
  return { stdout: out.join('\n') + '\n' };
}
