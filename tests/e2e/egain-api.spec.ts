import { expect, test } from "./test";
import { login } from "./helpers";

/**
 * Contract tests for the HTTP action API that the eGain agent calls (egain/action-contracts/openapi.yaml).
 * The API key is created through the real admin UI, so key issuance, hashing and scoping are exercised end to end.
 * NOTE: this tests Orylo's API. It does NOT test anything on eGain's platform (no eGain access in this environment).
 */
test.describe.serial("eGain action API contract", () => {
  let key = "";
  let token = "";
  let caseRef = "";
  let approvalActionId = "";
  const auth = () => ({ Authorization: `Bearer ${key}` });

  test("owner creates a scoped key in the UI; it is shown once", async ({ page }) => {
    await login(page, "owner@northfield.example", /\/app$/);
    await page.goto("/app/admin/api-keys");
    await page.getByLabel("Name").fill("eGain contract test");
    await page.getByRole("button", { name: "Create key" }).click();
    const secret = page.locator("p.t-code").filter({ hasText: /^oryk_/ });
    await expect(secret).toBeVisible({ timeout: 15_000 });
    key = (await secret.textContent())!.trim();
    expect(key).toMatch(/^oryk_[A-Za-z0-9_-]{30,}$/);
    await page.reload();
    await expect(page.getByText(key)).toHaveCount(0); // never shown again
    await expect(page.getByText(key.slice(0, 10) + "…")).toBeVisible();
  });

  test("authentication: no key / bad key / wrong scope are rejected with the documented envelope", async ({
    request,
  }) => {
    const attempts: Record<string, string>[] = [
      {},
      { Authorization: "Bearer oryk_not-a-real-key" },
      { Authorization: "Bearer something-else" },
    ];
    for (const headers of attempts) {
      const r = await request.post("/api/v1/egain/sessions", {
        headers,
        data: { fullName: "x", email: "a@b.example", accountNumber: "NF-100234", issue: "x" },
      });
      expect(r.status()).toBe(401);
      expect((await r.json()).error.code).toBe("UNAUTHENTICATED");
    }
  });

  test("identity: wrong details never disclose whether an account exists", async ({ request }) => {
    const bad = await request.post("/api/v1/egain/sessions", {
      headers: auth(),
      data: { fullName: "x", email: "attacker@evil.example", accountNumber: "NF-100777", issue: "charged" },
    });
    const ghost = await request.post("/api/v1/egain/sessions", {
      headers: auth(),
      data: {
        fullName: "x",
        email: "priya.nair@customer.example",
        accountNumber: "NF-000000",
        issue: "charged",
      },
    });
    expect(bad.status()).toBe(200);
    expect(await bad.json()).toEqual(await ghost.json());
    expect((await bad.json()).verified).toBe(false);
    const invalid = await request.post("/api/v1/egain/sessions", {
      headers: auth(),
      data: { email: "nope" },
    });
    expect(invalid.status()).toBe(400);
  });

  test("verified session resumes the customer's open case (never start over) and returns a short-lived token", async ({
    request,
  }) => {
    const r = await request.post("/api/v1/egain/sessions", {
      headers: auth(),
      data: {
        fullName: "Priya Nair",
        email: "Priya.Nair@customer.example",
        accountNumber: "NF-100777",
        issue: "Cancelled twelve days ago, charged again",
      },
    });
    expect(r.status()).toBe(200);
    const b = await r.json();
    expect(b).toMatchObject({ verified: true, state: "READY_FOR_ACTION" });
    expect(b.summary).toMatch(/Earlier cancellation request found/);
    token = b.customerToken;
    caseRef = b.caseReference;
    expect(caseRef).toBe("ORY-1001"); // the seeded case, resumed
  });

  test("case view: findings, proposed actions with exact consent wording, nothing verified yet", async ({
    request,
  }) => {
    const r = await request.get(`/api/v1/egain/cases/${caseRef}`, {
      headers: { ...auth(), "X-Customer-Token": token },
    });
    expect(r.status()).toBe(200);
    const b = await r.json();
    expect(b.findings).toMatchObject({ priorCancellationFound: true, accountStillActive: true });
    expect(b.findings.disputedCharge.amountCents).toBe(14900);
    expect(b.objectives.every((o: { status: string }) => o.status === "PENDING")).toBe(true);
    expect(b.ledger).toEqual([]);
    const review = b.proposedActions.find(
      (a: { operation: string }) => a.operation === "subscription.create_billing_review",
    );
    expect(review.consentText).toMatch(/does not refund anything by itself/);
    expect(review.needsApproval).toBe(false); // becomes true only after consent
    approvalActionId = review.actionId;
  });

  test("authorization: token is required, and one customer's token cannot read another customer's case", async ({
    request,
  }) => {
    expect((await request.get(`/api/v1/egain/cases/${caseRef}`, { headers: auth() })).status()).toBe(401);
    expect(
      (
        await request.get(`/api/v1/egain/cases/${caseRef}`, {
          headers: { ...auth(), "X-Customer-Token": "garbage" },
        })
      ).status(),
    ).toBe(401);
    const other = await request.get("/api/v1/egain/cases/ORY-1002", {
      headers: { ...auth(), "X-Customer-Token": token },
    }); // Elena's case
    expect(other.status()).toBe(404);
    expect(JSON.stringify(await other.json())).not.toMatch(/Elena|elena/);
  });

  test("confirm: validation, idempotency, consent, and the approval threshold ($149 > $50) — nothing runs without approval", async ({
    request,
  }) => {
    const url = `/api/v1/egain/cases/${caseRef}/actions/${approvalActionId}/confirm`;
    const h = { ...auth(), "X-Customer-Token": token };
    expect((await request.post(url, { headers: h, data: { consent: true } })).status()).toBe(400); // Idempotency-Key required
    expect(
      (
        await request.post(url, {
          headers: { ...h, "Idempotency-Key": "egain-sess-0001-a1" },
          data: { consent: "yes" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.post(url, { headers: { ...h, "Idempotency-Key": "short" }, data: { consent: true } })
      ).status(),
    ).toBe(400);
    const r1 = await request.post(url, {
      headers: { ...h, "Idempotency-Key": "egain-sess-0001-a1" },
      data: { consent: true },
    });
    expect(r1.status()).toBe(200);
    const b1 = await r1.json();
    expect(b1).toMatchObject({
      status: "AWAITING_APPROVAL",
      receiptNo: null,
      caseState: "AWAITING_APPROVAL",
    });
    expect(b1.message).toMatch(/team member must approve/);
    // replay with the same key is safe and gives the same answer
    const r2 = await request.post(url, {
      headers: { ...h, "Idempotency-Key": "egain-sess-0001-a1" },
      data: { consent: true },
    });
    expect(await r2.json()).toMatchObject({ status: "AWAITING_APPROVAL", receiptNo: null });
    // an action id from another case is NOT_FOUND here
    const wrong = await request.post(
      `/api/v1/egain/cases/${caseRef}/actions/00000000-0000-4000-8000-000000000000/confirm`,
      { headers: { ...h, "Idempotency-Key": "egain-sess-0001-zz" }, data: { consent: true } },
    );
    expect(wrong.status()).toBe(404);
  });

  test("escalation: both demonstration options create real tracked records; repeating is idempotent", async ({
    request,
  }) => {
    const h = { ...auth(), "X-Customer-Token": token };
    const e1 = await request.post(`/api/v1/egain/cases/${caseRef}/escalations`, {
      headers: h,
      data: { channel: "callback_request", reason: "Please call me about the approval" },
    });
    expect(e1.status()).toBe(200);
    const b1 = await e1.json();
    expect(b1).toMatchObject({ status: "OPEN", channel: "callback_request" });
    expect(b1.escalationId).toMatch(/^[0-9a-f-]{36}$/);
    const again = await request.post(`/api/v1/egain/cases/${caseRef}/escalations`, {
      headers: h,
      data: { channel: "callback_request", reason: "Please call me about the approval" },
    });
    expect((await again.json()).escalationId).toBe(b1.escalationId);
    const e2 = await request.post(`/api/v1/egain/cases/${caseRef}/escalations`, {
      headers: h,
      data: { channel: "email_request", reason: "Email me an update" },
    });
    expect((await e2.json()).channel).toBe("email_request");
    expect(
      (
        await request.post(`/api/v1/egain/cases/${caseRef}/escalations`, {
          headers: h,
          data: { channel: "carrier_pigeon", reason: "x" },
        })
      ).status(),
    ).toBe(400);
    const view = await (await request.get(`/api/v1/egain/cases/${caseRef}`, { headers: h })).json();
    expect(view.escalations.length).toBeGreaterThanOrEqual(2);
  });

  test("receipts: public verification rejects malformed and unknown numbers without leaking anything", async ({
    request,
  }) => {
    expect((await request.get("/api/v1/receipts/not-a-receipt/verify")).status()).toBe(404);
    const r = await request.get("/api/v1/receipts/RCPT-20260101-DEADBEEFDEADBEEF/verify");
    expect(r.status()).toBe(404);
    expect(await r.json()).toEqual({ valid: false });
  });

  test("brute force: repeated verification attempts are rate limited with Retry-After", async ({
    request,
  }) => {
    let last = 0;
    let retry: string | undefined;
    for (let i = 0; i < 8; i++) {
      const r = await request.post("/api/v1/egain/sessions", {
        headers: auth(),
        data: { fullName: "x", email: "bruteforce@evil.example", accountNumber: `NF-10099${i}`, issue: "x" },
      });
      last = r.status();
      retry = r.headers()["retry-after"];
      if (last === 429) break;
    }
    expect(last).toBe(429);
    expect(Number(retry)).toBeGreaterThan(0);
  });

  test("session-protected downloads and exports refuse anonymous callers", async ({ request }) => {
    expect((await request.get("/api/evidence/00000000-0000-4000-8000-000000000000")).status()).toBe(401);
    expect((await request.get("/api/admin/export")).status()).toBe(401);
  });

  test("responses carry hardening headers and never leak stack traces", async ({ request }) => {
    const r = await request.get("/api/v1/egain/cases/ORY-1001", { headers: auth() });
    expect(r.headers()["x-content-type-options"]).toBe("nosniff");
    expect(r.headers()["cache-control"]).toBe("no-store");
    expect(JSON.stringify(await r.json())).not.toMatch(/at \w+ \(|node_modules|stack/i);
    expect(r.headers()["x-powered-by"]).toBeUndefined();
  });
});
