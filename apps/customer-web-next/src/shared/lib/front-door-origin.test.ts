import assert from "node:assert/strict";
import test from "node:test";
import { FRONT_DOOR_ID_HEADER, frontDoorCheckMisconfigured, frontDoorOriginDecision } from "./front-door-origin.ts";

const OURS = "59117d14-1c4f-402e-a98b-0fa1009de276";
const THEIRS = "0c0ffee0-0000-4000-8000-000000000000";
const report = { CRAVES_FRONT_DOOR_ID: OURS, CRAVES_FRONT_DOOR_CHECK: "report" };
const enforce = { CRAVES_FRONT_DOOR_ID: OURS, CRAVES_FRONT_DOOR_CHECK: "enforce" };
// Missing, empty, another profile's id, and near misses: the header must equal the id exactly.
const notOurs = [null, "", THEIRS, OURS.toUpperCase(), ` ${OURS}`, `${OURS} `, `${OURS},${THEIRS}`, `${THEIRS}, ${OURS}`];

test("off by default: unset, off or any other value allows every request", () => {
  for (const mode of [undefined, "", "off", "Report", "ENFORCE", " enforce", "enforce\n", "true", "1", "on"]) {
    for (const fdid of [...notOurs, OURS]) {
      assert.equal(frontDoorOriginDecision(fdid, { CRAVES_FRONT_DOOR_ID: OURS, CRAVES_FRONT_DOOR_CHECK: mode }), "allow", `mode ${JSON.stringify(mode)}`);
    }
    assert.equal(frontDoorCheckMisconfigured({ CRAVES_FRONT_DOOR_CHECK: mode }), false);
  }
  assert.equal(frontDoorOriginDecision(null, {}), "allow");
});

test("our id is allowed in report and in enforce", () => {
  assert.equal(frontDoorOriginDecision(OURS, report), "allow");
  assert.equal(frontDoorOriginDecision(OURS, enforce), "allow");
});

test("report: a missing or different id is reported, never denied", () => {
  for (const fdid of notOurs) assert.equal(frontDoorOriginDecision(fdid, report), "report", JSON.stringify(fdid));
});

test("enforce: a missing or different id is denied", () => {
  for (const fdid of notOurs) assert.equal(frontDoorOriginDecision(fdid, enforce), "deny", JSON.stringify(fdid));
});

test("the header name is matched in any case; Next hands it over lowercased", () => {
  assert.equal(FRONT_DOOR_ID_HEADER, "x-azure-fdid");
  for (const name of ["X-Azure-FDID", "x-azure-fdid", "X-AZURE-FDID"]) {
    const headers = new Headers({ [name]: OURS });
    assert.equal(frontDoorOriginDecision(headers.get(FRONT_DOOR_ID_HEADER), enforce), "allow", name);
  }
  assert.equal(frontDoorOriginDecision(new Headers({ "X-Azure-FDID": THEIRS }).get(FRONT_DOOR_ID_HEADER), enforce), "deny");
  assert.equal(frontDoorOriginDecision(new Headers().get(FRONT_DOOR_ID_HEADER), enforce), "deny");
});

test("a check mode with an empty id fails open and is flagged as misconfigured", () => {
  for (const mode of ["report", "enforce"]) {
    for (const id of [undefined, "", "   ", "\n"]) {
      const env = { CRAVES_FRONT_DOOR_ID: id, CRAVES_FRONT_DOOR_CHECK: mode };
      for (const fdid of [null, THEIRS, OURS]) assert.equal(frontDoorOriginDecision(fdid, env), "allow", `${mode} ${JSON.stringify(id)}`);
      assert.equal(frontDoorCheckMisconfigured(env), true);
    }
  }
  assert.equal(frontDoorCheckMisconfigured(enforce), false);
  assert.equal(frontDoorCheckMisconfigured(report), false);
});

test("whitespace around the id setting is ignored, so a pasted newline cannot lock everyone out", () => {
  const padded = { CRAVES_FRONT_DOOR_ID: ` ${OURS}\n`, CRAVES_FRONT_DOOR_CHECK: "enforce" };
  assert.equal(frontDoorOriginDecision(OURS, padded), "allow");
  assert.equal(frontDoorOriginDecision(THEIRS, padded), "deny");
  assert.equal(frontDoorCheckMisconfigured(padded), false);
});
