#!/usr/bin/env python3
"""Checks, on Borzo's SANDBOX only, what the courier booking journal's lookup relies on.

integration-service finds a booking whose answer was lost by scanning GET /orders for its reference
(BorzoApiClient.reconcileCreate). That is safe only if the list is newest first and a new order shows up within the
20 seconds the first look waits. This script books three sandbox orders, measures how long each takes to appear,
checks the order of the list, and cancels them. Run it once before CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED goes on:

    BORZO_SANDBOX_AUTH_TOKEN=... python3 scripts/delivery/borzo-sandbox-order-list-check.py

Standard library only. Exit code 0 means every check passed.
"""
import json
import os
import sys
import time
import urllib.request
import uuid

HOST = "robotapitest-in.borzodelivery.com"  # the sandbox; this script refuses any other host
BASE = os.environ.get("BORZO_SANDBOX_BASE_URL", f"https://{HOST}/api/business/1.8")
TOKEN = os.environ.get("BORZO_SANDBOX_AUTH_TOKEN", "")
LIST_LAG_SECONDS = 20


def call(method, path, body=None):
    request = urllib.request.Request(BASE + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                     headers={"X-DV-Auth-Token": TOKEN, "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=25) as response:
        answer = json.load(response)
    if not answer.get("is_successful"):
        sys.exit(f"Borzo refused {method} {path}: {answer}")
    return answer


def book(reference):
    point = {"address": "Madhapur, Hyderabad, Telangana 500081", "contact_person": {"phone": "919000000001", "name": "Sandbox"}}
    drop = dict(point, address="Gachibowli, Hyderabad, Telangana 500032", client_order_id=reference)
    return call("POST", "/create-order", {"type": "standard", "matter": "Packaged food", "vehicle_type_id": 8,
                                           "total_weight_kg": 1, "points": [point, drop]})["order"]["order_id"]


def main():
    if not TOKEN:
        sys.exit("Set BORZO_SANDBOX_AUTH_TOKEN (a sandbox token, never the production one).")
    if f"//{HOST}/" not in BASE:
        sys.exit(f"Refusing to run against {BASE}: only {HOST} is allowed.")
    booked, failures = [], []
    try:
        for _ in range(3):
            reference = uuid.uuid4().hex[:27]
            started = time.monotonic()
            order_id = book(reference)
            seen = None
            while seen is None and time.monotonic() - started < 60:
                orders = call("GET", "/orders?offset=0&count=50")["orders"]
                if any(p.get("client_order_id") == reference for o in orders for p in o.get("points", [])):
                    seen = time.monotonic() - started
                else:
                    time.sleep(1)
            booked.append(order_id)
            print(f"order {order_id}: in the list after {'never (60 s)' if seen is None else f'{seen:.1f} s'}")
            if seen is None or seen > LIST_LAG_SECONDS:
                failures.append(f"order {order_id} took longer than {LIST_LAG_SECONDS} s to appear in GET /orders")
            time.sleep(3)
        orders = call("GET", "/orders?offset=0&count=50")["orders"]
        ids = [int(o["order_id"]) for o in orders]
        created = [o["created_datetime"] for o in orders]
        if ids != sorted(ids, reverse=True):
            failures.append("GET /orders is not sorted by order_id, newest first")
        if any(later < earlier for earlier, later in zip(created[1:], created)):
            failures.append("a higher order_id has an earlier created_datetime: ids do not rise with creation time")
        if not set(booked) <= set(ids[:len(booked) + 5]):
            failures.append("the three new orders are not at the top of the list")
    finally:
        for order_id in booked:
            try:
                call("POST", "/cancel-order", {"order_id": order_id})
            except SystemExit as refused:
                print(f"could not cancel sandbox order {order_id}: {refused}")
    for failure in failures:
        print("FAIL:", failure)
    print("PASS" if not failures else f"{len(failures)} check(s) failed: keep the booking journal off and tell engineering")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
