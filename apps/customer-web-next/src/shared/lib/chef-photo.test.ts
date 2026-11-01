import assert from "node:assert/strict";
import test from "node:test";
import { chefInitials, safeChefPhotoUrl } from "./chef-photo.ts";

test("only trimmed https chef pictures of a sane length are loaded", () => {
  const avatar = "https://craves.in/media/public/chef-avatars/chef-avatar-07.jpg";
  assert.equal(safeChefPhotoUrl(` ${avatar} `), avatar);
  for (const value of ["http://craves.in/a.jpg", "javascript:alert(1)", "data:image/png;base64,AAAA", "//craves.in/a.jpg", "", "   ", null, 42, `https://craves.in/${"a".repeat(2000)}`]) {
    assert.equal(safeChefPhotoUrl(value), null);
  }
});

test("initials are at most two uppercase letters", () => {
  assert.equal(chefInitials("asha  rao"), "AR");
  assert.equal(chefInitials("Lakshmi Devi Iyer"), "LD");
  assert.equal(chefInitials("Meena"), "M");
  assert.equal(chefInitials("  "), "");
  assert.equal(chefInitials(null), "");
  assert.equal(chefInitials(undefined), "");
});
