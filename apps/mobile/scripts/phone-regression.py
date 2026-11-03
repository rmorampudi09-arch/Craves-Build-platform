#!/usr/bin/env python3
"""Read-only regression walk of the Craves app on a real Android phone (customer side, then chef side).

It taps only what it can see on screen, by text or accessibility label, and refuses anything that writes data
(see DENY), so it is safe on a live account. Each step checks the screen for error messages and takes a screenshot;
the run ends with a scan of the phone log for crashes.

Usage (phone on USB, app installed and signed in):
  python scripts/phone-regression.py [--serial SERIAL] [--out DIR] [--chef-dish "Potato Curry"] [--no-chef]
  python scripts/phone-regression.py --self-check
Writes DIR/NN-step.png and DIR/report.md. Exit code 1 when a step failed or the app crashed.
"""
import argparse
import datetime
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

PACKAGE = 'com.cravesapp'
CUSTOMER_TABS = ['Home', 'Chefs', 'Orders', 'Profile']
CHEF_TABS = ['Home', 'Orders', 'Menu', 'Earnings', 'Profile']
# Never tapped: every control that orders, pays, saves, sends, deletes or changes the kitchen.
DENY = re.compile(
    r'^(Add|Add to cart|Place order|Pay\b.*|Proceed to [Cc]heckout|Checkout|Continue payment|Save\b.*|Delete\b.*|'
    r'Remove\b.*|Submit\b.*|Send\b.*|Accept\b.*|Reject\b.*|Decline\b.*|Cancel order|Withdraw\b.*|Log out|Sign out\b.*|'
    r'Mark all\b.*|Clear\b.*|Stop\b.*|Reset|Go (online|offline)|Open kitchen|Close kitchen|Notify me|Copy\b.*|Share\b.*|'
    r'Reorder|Order again|Rate\b.*|Write a review|Discard\b.*)$')
ERROR_TEXT = re.compile(
    r"Something went wrong|[Cc]ouldn'?t load|could not be loaded|is unavailable|not available right now|Unable to|"
    r'Network request failed|undefined|NaN')
CRASH_LOG = re.compile(r'FATAL EXCEPTION|AndroidRuntime: |ReactNativeJS: .*(Error|Exception)|Unhandled promise')


class StepFailed(Exception):
    pass


class Phone:
    def __init__(self, serial):
        self.serial = serial
        self.size = (1080, 2400)

    def adb(self, *args, binary=False):
        cmd = ['adb'] + (['-s', self.serial] if self.serial else []) + list(args)
        out = subprocess.run(cmd, capture_output=True, timeout=60).stdout
        return out if binary else out.decode('utf-8', 'replace')

    def read_size(self):
        found = re.search(r'(\d+)x(\d+)', self.adb('shell', 'wm', 'size').splitlines()[-1])
        if found:
            self.size = (int(found.group(1)), int(found.group(2)))

    def nodes(self):
        for _ in range(3):
            self.adb('shell', 'uiautomator', 'dump', '/sdcard/craves-ui.xml')
            raw = self.adb('exec-out', 'cat', '/sdcard/craves-ui.xml')
            if raw.lstrip().startswith('<?xml'):
                return parse_nodes(raw)
            time.sleep(0.5)
        raise StepFailed('could not read the screen (uiautomator dump failed)')

    def find(self, pattern, nodes=None, lowest=False):
        """First match on screen, or with `lowest` the one nearest the bottom (the tab bar beats a same-named label)."""
        rx = re.compile(pattern)
        matches = [n for n in (nodes if nodes is not None else self.nodes())
                   if rx.search(n['text']) or rx.search(n['desc'])]
        if not matches:
            return None
        return max(matches, key=lambda n: n['y']) if lowest else matches[0]

    def wait_for(self, pattern, timeout=12.0, lowest=False):
        end = time.time() + timeout
        while True:
            node = self.find(pattern, lowest=lowest)
            if node:
                return node
            if time.time() > end:
                raise StepFailed(f'"{pattern}" did not appear')
            time.sleep(0.7)

    def scroll_to(self, pattern, tries=6, down=True):
        """Scrolls until a match sits clear of the floating tab bar."""
        for _ in range(tries + 1):
            node = self.find(pattern)
            if node and node['y'] < self.size[1] * 0.82:
                return node
            self.scroll(down=down)
        raise StepFailed(f'"{pattern}" not found after scrolling')

    def tap(self, pattern, timeout=12.0, scroll=False, up=False, lowest=False):
        node = self.scroll_to(pattern, down=not up) if scroll else self.wait_for(pattern, timeout, lowest)
        label = node['text'] or node['desc']
        if DENY.match(label.strip()):
            raise StepFailed(f'refused to tap "{label}" (it would change data)')
        self.adb('shell', 'input', 'tap', str(node['x']), str(node['y']))
        time.sleep(1.2)
        return label

    def back(self):
        self.adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')
        time.sleep(1.0)

    def scroll(self, down=True):
        w, h = self.size
        y1, y2 = (int(h * 0.75), int(h * 0.30)) if down else (int(h * 0.30), int(h * 0.75))
        self.adb('shell', 'input', 'swipe', str(w // 2), str(y1), str(w // 2), str(y2), '350')
        time.sleep(0.9)

    def screenshot(self, path):
        with open(path, 'wb') as f:
            f.write(self.adb('exec-out', 'screencap', '-p', binary=True))


def parse_nodes(raw):
    nodes = []
    for n in ET.fromstring(raw[raw.index('<?xml'):]).iter('node'):
        text, desc = n.get('text') or '', n.get('content-desc') or ''
        b = re.findall(r'\d+', n.get('bounds') or '')
        if (text or desc) and len(b) == 4:
            x1, y1, x2, y2 = map(int, b)
            nodes.append({'text': text, 'desc': desc, 'x': (x1 + x2) // 2, 'y': (y1 + y2) // 2})
    return nodes


def check_screen(phone):
    nodes = phone.nodes()
    if len(nodes) < 4:
        raise StepFailed('screen is (nearly) empty')
    for node in nodes:
        for value in (node['text'], node['desc']):
            if ERROR_TEXT.search(value):
                raise StepFailed(f'error on screen: "{value}"')
    return nodes


def tabs_visible(phone, tabs):
    nodes = phone.nodes()
    return all(phone.find(rf'^{t}$|^{t},', nodes) for t in tabs)


class Walk:
    def __init__(self, phone, out):
        self.phone, self.out, self.rows = phone, out, []

    def step(self, name, action):
        index = len(self.rows) + 1
        shot = f'{index:02d}-{re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")}.png'
        try:
            # The phone's screen-time reminder ("You've used … for 30 minutes") covers the app; OK only closes it.
            if self.phone.find(r"^You've used .* for "):
                self.phone.tap(r'^OK$')
            detail = action() or ''
            check_screen(self.phone)
            status = 'PASS'
        except StepFailed as e:
            status, detail = 'FAIL', str(e)
        except subprocess.TimeoutExpired:
            status, detail = 'FAIL', 'adb timed out'
        self.phone.screenshot(os.path.join(self.out, shot))
        self.rows.append((index, name, status, detail, shot))
        print(f'{index:02d} {status:4} {name}  {detail}', flush=True)
        return status == 'PASS'

    def snap(self, label):
        """Screenshot of an inner screen, taken before the step goes back (the step's own shot shows where it ends)."""
        self.phone.screenshot(os.path.join(self.out, f'{len(self.rows) + 1:02d}b-{label}.png'))

    def skip(self, name, why):
        self.rows.append((len(self.rows) + 1, name, 'SKIP', why, ''))
        print(f'{len(self.rows):02d} SKIP {name}  {why}', flush=True)


def tab(phone, name):
    phone.tap(rf'^{name}$|^{name},', lowest=True)
    return f'{name} tab'


def scroll_through(phone):
    for _ in range(2):
        phone.scroll(down=True)
        check_screen(phone)
    for _ in range(2):
        phone.scroll(down=False)


def switch_role(phone, row, tabs):
    """Taps a role-switch row on Profile, confirms the "Switch to … mode?" dialog, and waits for that role's tabs."""
    tab(phone, 'Profile')
    phone.tap(row, scroll=True)
    try:
        phone.tap(r'^(SWITCH|Switch)$', timeout=4)
    except StepFailed:
        pass
    end = time.time() + 20
    while not tabs_visible(phone, tabs):
        if time.time() > end:
            raise StepFailed(f'{"/".join(tabs)} tabs did not appear')
        time.sleep(1)


def run(args):
    phone = Phone(args.serial)
    phone.read_size()
    os.makedirs(args.out, exist_ok=True)
    walk = Walk(phone, args.out)
    phone.adb('logcat', '-c')

    def launch():
        phone.adb('shell', 'am', 'force-stop', PACKAGE)
        phone.adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1')
        end = time.time() + 25
        while time.time() < end:
            if tabs_visible(phone, CUSTOMER_TABS):
                return 'customer mode'
            if tabs_visible(phone, CHEF_TABS):
                switch_role(phone, r'^Switch to customer mode$', CUSTOMER_TABS)
                return 'opened in chef mode, switched to customer'
            time.sleep(1)
        raise StepFailed('app did not reach its tabs within 25 s')

    if not walk.step('Launch', launch):
        return walk

    def home():
        tab(phone, 'Home')
        phone.wait_for(r'₹')
        scroll_through(phone)

    def filters(tab_name):
        def action():
            tab(phone, tab_name)
            # Home's header hides the Filters button until the list is back at the very top.
            phone.tap(r'^Filters$', scroll=True, up=True)
            phone.wait_for(r'Sort')
            check_screen(phone)
            walk.snap('inner')
            phone.back()
        return action

    def kitchen_and_dish():
        tab(phone, 'Chefs')
        phone.tap(r'\d+(\.\d+)? ?k?m away')
        phone.wait_for(r'^Ratings & reviews$|\d+ dish')
        check_screen(phone)
        phone.tap(r'^₹ ?\d+')
        phone.wait_for(r'^Add$|^Add to cart$|Not cooking|Sold out')
        detail = 'kitchen page and dish sheet open'
        check_screen(phone)
        walk.snap('inner')
        phone.back()
        phone.back()
        return detail

    def orders():
        tab(phone, 'Orders')
        check_screen(phone)
        phone.tap(r'#[0-9A-Z]{6,}')
        phone.wait_for(r'^Order details$')
        phone.wait_for(r'^Total$')
        check_screen(phone)
        walk.snap('inner')
        phone.back()

    def saved():
        tab(phone, 'Profile')
        phone.tap(r'^Saved$')
        check_screen(phone)
        walk.snap('inner')
        phone.back()

    def privacy():
        tab(phone, 'Profile')
        phone.tap(r'^Settings$')
        phone.tap(r'^Privacy & security$')
        check_screen(phone)
        walk.snap('inner')
        phone.back()
        phone.back()

    def notifications():
        tab(phone, 'Home')
        phone.tap(r'^Notifications')
        check_screen(phone)
        walk.snap('inner')
        phone.back()

    walk.step('Customer Home scrolls', home)
    walk.step('Home Filter & Sort', filters('Home'))
    walk.step('Chefs Filter & Sort', filters('Chefs'))
    walk.step('Kitchen page and dish sheet', kitchen_and_dish)
    walk.step('Orders and an order page', orders)
    walk.step('Profile > Saved', saved)
    walk.step('Settings > Privacy & security', privacy)
    walk.step('Notifications', notifications)

    if args.no_chef:
        walk.skip('Chef side', '--no-chef')
        return walk
    try:
        tab(phone, 'Profile')
        phone.scroll_to(r'^Switch to Chef mode$')
    except StepFailed as e:
        walk.skip('Chef side', f'no chef mode on Profile ({e})')
        return walk

    def to_chef():
        switch_role(phone, r'^Switch to Chef mode$', CHEF_TABS)

    def chef_tab(name, scroll=True):
        def action():
            tab(phone, name)
            if scroll:
                scroll_through(phone)
        return action

    def chef_dish():
        tab(phone, 'Menu')
        phone.wait_for(r'₹')
        if args.chef_dish:
            phone.tap(re.escape(args.chef_dish).replace("'", "['’]"), scroll=True)
        else:
            phone.tap(r'^₹ ?\d+')
        phone.wait_for(r'Cuisine|Price|Dish name')
        check_screen(phone)
        walk.snap('inner')
        phone.back()
        if phone.find(r'^Discard'):
            raise StepFailed('leaving an untouched dish asked to discard changes')

    def to_customer():
        switch_role(phone, r'^Switch to customer mode$', CUSTOMER_TABS)

    if walk.step('Switch to chef mode', to_chef):
        walk.step('Chef Home scrolls', chef_tab('Home'))
        walk.step('Chef Orders', chef_tab('Orders'))
        walk.step('Chef Menu', chef_tab('Menu'))
        walk.step(f'Chef dish editor ({args.chef_dish or "first dish"})', chef_dish)
        walk.step('Chef Earnings scrolls', chef_tab('Earnings'))
        walk.step('Chef Profile', chef_tab('Profile', scroll=False))
        walk.step('Switch back to customer mode', to_customer)
    return walk


def report(walk, phone, out):
    log = phone.adb('logcat', '-d', '-v', 'brief')
    crashes = [line for line in log.splitlines() if CRASH_LOG.search(line)][:40]
    version = re.search(r'versionName=(\S+)', phone.adb('shell', 'dumpsys', 'package', PACKAGE))
    lines = [f'# Craves phone regression {datetime.datetime.now():%Y-%m-%d %H:%M}',
             f'App {version.group(1) if version else "?"} on {phone.serial or "default device"}', '',
             '| # | Step | Result | Detail | Screenshot |', '|---|---|---|---|---|']
    lines += [f'| {i} | {name} | {status} | {detail} | {shot} |' for i, name, status, detail, shot in walk.rows]
    lines += ['', f'Crash or JS error lines in the phone log: {len(crashes)}']
    lines += [f'    {line}' for line in crashes]
    with open(os.path.join(out, 'report.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    failed = [r for r in walk.rows if r[2] == 'FAIL']
    print(f'\n{len(walk.rows)} steps, {len(failed)} failed, {len(crashes)} crash/error log lines. Report: {out}/report.md')
    return 1 if failed or crashes else 0


def self_check():
    assert DENY.match('Add') and DENY.match('Place order') and DENY.match('Save changes') and DENY.match('Log out')
    assert not DENY.match('Switch to Chef mode') and not DENY.match('Saved') and not DENY.match('Filters')
    assert ERROR_TEXT.search("We couldn't load your orders") and not ERROR_TEXT.search('Not cooking today')
    sample = ('<?xml version="1.0"?><hierarchy><node text="Home" content-desc="" bounds="[0,2200][270,2400]">'
              '<node text="" content-desc="Filters" bounds="[900,300][1000,400]"/></node></hierarchy>')
    nodes = parse_nodes('UI dump\n' + sample)
    assert nodes == [{'text': 'Home', 'desc': '', 'x': 135, 'y': 2300}, {'text': '', 'desc': 'Filters', 'x': 950, 'y': 350}]
    print('self-check ok')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--serial', default=os.environ.get('ANDROID_SERIAL', ''))
    parser.add_argument('--out', default=f'phone-regression-{datetime.datetime.now():%Y%m%d-%H%M}')
    parser.add_argument('--chef-dish', default='', help='dish to open in the editor (default: the first dish)')
    parser.add_argument('--no-chef', action='store_true')
    parser.add_argument('--self-check', action='store_true')
    args = parser.parse_args()
    if args.self_check:
        self_check()
        sys.exit(0)
    phone = Phone(args.serial)
    sys.exit(report(run(args), phone, args.out))
