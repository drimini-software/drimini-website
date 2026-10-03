import assert from "node:assert/strict";
import test from "node:test";
import { handleContactRequest, storeEnquiry } from "../functions/api/contact.ts";

const endpoint = "https://drimini.test/api/contact";
const testSecret = "1x0000000000000000000000000000000AA";
const database = { prepare() { throw new Error("not used directly"); } };

function environment(overrides = {}) {
  return {
    TURNSTILE_SECRET_KEY: testSecret,
    CONTACT_DB: database,
    ...overrides,
  };
}

function validBody(overrides = {}) {
  return new URLSearchParams({
    name: "Avery Stone",
    email: "avery@example.com",
    company: "Example Systems",
    role: "CTO",
    project: "We need help replacing a brittle operational system safely.",
    timeline: "This quarter",
    budget: "Still being scoped",
    consent: "acknowledged",
    "cf-turnstile-response": "XXXX.DUMMY.TOKEN.XXXX",
    ...overrides,
  });
}

function request(body = validBody(), overrides = {}) {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Origin: "https://drimini.test",
      ...overrides,
    },
    body,
  });
}

function successfulFetcher() {
  return async (input) => {
    const url = String(input);
    if (url.includes("turnstile/v0/siteverify")) {
      return Response.json({ success: true, hostname: "drimini.test", action: "contact" });
    }

    throw new Error(`Unexpected request: ${url}`);
  };
}

test("a valid enquiry is verified and stored", async () => {
  const stored = [];
  const response = await handleContactRequest(
    request(),
    environment(),
    successfulFetcher(),
    async (fields, receivedDatabase) => {
      stored.push(fields);
      assert.equal(receivedDatabase, database);
      return true;
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    message: "Thanks. Your message has been received.",
  });
  assert.equal(stored.length, 1);
  assert.equal(stored[0].email, "avery@example.com");
  assert.equal(stored[0].company, "Example Systems");
});

test("invalid fields are rejected before external services are called", async () => {
  let called = false;
  const response = await handleContactRequest(
    request(validBody({ email: "not-an-email" })),
    environment(),
    async () => {
      called = true;
      throw new Error("should not be called");
    },
    async () => {
      called = true;
      return true;
    },
  );

  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test("a failed Turnstile check prevents storage", async () => {
  let stored = false;
  const response = await handleContactRequest(
    request(),
    environment({ TURNSTILE_SECRET_KEY: "production-secret" }),
    async () => Response.json({ success: false }),
    async () => {
      stored = true;
      return true;
    },
  );

  assert.equal(response.status, 400);
  assert.equal(stored, false);
  assert.match((await response.json()).message, /Spam protection/);
});

test("the honeypot returns a generic success without storage", async () => {
  let called = false;
  const response = await handleContactRequest(
    request(validBody({ website: "https://spam.example" })),
    environment(),
    async () => {
      called = true;
      throw new Error("should not be called");
    },
    async () => {
      called = true;
      return true;
    },
  );

  assert.equal(response.status, 200);
  assert.equal(called, false);
});

test("missing D1 configuration fails closed", async () => {
  const response = await handleContactRequest(request(), environment({ CONTACT_DB: undefined }));

  assert.equal(response.status, 503);
  assert.match((await response.json()).message, /could not be received/);
});

test("cross-origin submissions are rejected", async () => {
  const response = await handleContactRequest(
    request(validBody(), { Origin: "https://unrelated.example" }),
    environment(),
  );

  assert.equal(response.status, 403);
});

test("storage uses a parameterized D1 insert and records the privacy notice version", async () => {
  let sql = "";
  let values = [];
  const fakeDatabase = {
    prepare(statement) {
      sql = statement;
      return {
        bind(...parameters) {
          values = parameters;
          return this;
        },
        async run() {
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
  };

  const result = await storeEnquiry(
    {
      name: "Avery Stone",
      email: "avery@example.com",
      company: "Example Systems",
      role: "CTO",
      project: "A sufficiently detailed project outline.",
      timeline: "This quarter",
      budget: "TBD",
    },
    fakeDatabase,
  );

  assert.equal(result, true);
  assert.match(sql, /INSERT INTO contact_enquiries/);
  assert.match(sql, /VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, 'new', \?\)/);
  assert.equal(values[3], "Avery Stone");
  assert.equal(values[4], "avery@example.com");
  assert.equal(values.at(-1), "2026-10-02");
});
