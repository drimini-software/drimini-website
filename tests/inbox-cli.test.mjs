import assert from "node:assert/strict";
import test from "node:test";
import { buildInboxQuery } from "../scripts/inbox.mjs";

const id = "75d63b3c-e16e-47e6-8276-53ad185ba87f";

test("the default inbox query lists only non-archived enquiries", () => {
  const query = buildInboxQuery([]);

  assert.match(query, /status != 'archived'/);
  assert.match(query, /ORDER BY created_at DESC/);
  assert.match(query, /LIMIT 100/);
});

test("show selects one validated enquiry", () => {
  const query = buildInboxQuery(["show", id]);

  assert.match(query, new RegExp(`WHERE id = '${id}'`));
  assert.match(query, /privacy_notice_version/);
});

test("status actions use only fixed values and a validated identifier", () => {
  assert.match(buildInboxQuery(["read", id]), /status = 'read'/);
  assert.match(buildInboxQuery(["archive", id]), /status = 'archived'/);
  assert.match(buildInboxQuery(["restore", id]), /status = 'read'/);
});

test("invalid identifiers cannot become SQL", () => {
  assert.throws(
    () => buildInboxQuery(["show", "' OR 1=1; --"]),
    /valid enquiry UUID/,
  );
});

test("deletion requires explicit confirmation", () => {
  assert.throws(
    () => buildInboxQuery(["delete", id]),
    /requires --confirm-delete/,
  );
  assert.equal(
    buildInboxQuery(["delete", id, "--confirm-delete"]),
    `DELETE FROM contact_enquiries WHERE id = '${id}';`,
  );
});

test("unknown actions are rejected", () => {
  assert.throws(() => buildInboxQuery(["explode"]), /Unknown inbox action/);
});
