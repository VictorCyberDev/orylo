import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Action Gateway acceptance on the DEPLOYED site (LIVE_PUBLIC_URL, REVIEWER_CODE).
 *
 * WHAT THIS IS: a client we control calling the same five HTTP endpoints, with the same auth model, that an eGain action would use.
 * WHAT THIS IS NOT: evidence of an eGain-originated call. Nothing here touches eGain's platform; it proves the deployed gateway
 * behaves correctly for whichever caller the owner configures. Every result is labelled `notEgainOriginated: true`.
 *
 * It mints a temporary key through the real admin UI, uses a seeded customer other than the judge scenario (Priya, not Jordan),
 * and revokes the key in the last test. It changes demo data: reset afterwards (DEMO_RESET_ON_BUILD=1 redeploy, then back to 0).
 */
const BASE = process.env.LIVE_PUBLIC_URL;
const REVIEWER = process.env.REVIEWER_CODE;
test.skip(!BASE || !REVIEWER, "set LIVE_PUBLIC_URL and REVIEWER_CODE");

async function ownerLogin(page: Page) {
  await page.goto(`${BASE}/demo`);
  await page.getByLabel("Reviewer code").fill(REVIEWER!);
  await page.getByRole("button", { name: "Show reviewer sign-in details" }).click();
  const pw = page.locator("span.t-code").first();
  await expect(pw).toBeVisible({ timeout: 20_000 });
  const password = (await pw.textContent())!.trim();
  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel(/^Email/).fill("owner@northfield.example");
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
}

test.describe.serial("deployed Action Gateway (not eGain-originated)", () => {
  let key = "";
  let token = "";
  let caseRef = "";
  let cancelActionId = "";
  let reviewActionId = "";
  let receiptNo = "";
  const evidence: Record<string, unknown> = { notEgainOriginated: true };
  const auth = () => ({ Authorization: `Bearer ${key}` });
  const api = (p: string) => `${BASE}${p}`;

  test.afterAll(() => {
    mkdirSync("docs/evidence/public", { recursive: true });
    writeFileSync(
      "docs/evidence/public/gateway-live.json",
      JSON.stringify({ ranAt: new Date().toISOString(), site: BASE, ...evidence }, null, 2),
    );
  });

  test("owner mints a temporary scoped key in the real admin UI (shown once)", async ({ page }) => {
    await ownerLogin(page);
    await page.goto(`${BASE}/app/admin/api-keys`);
    await page.getByLabel("Name").fill("live gateway test (temporary)");
    await page.getByRole("button", { name: "Create key" }).click();
    const secret = page.locator("p.t-code").filter({ hasText: /^oryk_/ });
    await expect(secret).toBeVisible({ timeout: 20_000 });
    key = (await secret.textContent())!.trim();
    expect(key).toMatch(/^oryk_[A-Za-z0-9_-]{30,}$/);
    await page.reload();
    await expect(page.getByText(key)).toHaveCount(0);
    evidence.keyIssued = true;
  });

  test("authentication: missing, malformed and unknown keys are refused with the documented envelope", async ({
    request,
  }) => {
    const statuses: number[] = [];
    for (const headers of [
      {},
      { Authorization: "Bearer oryk_not-a-real-key" },
      { Authorization: "Bearer x" },
    ] as Record<string, string>[]) {
      const r = await request.post(api("/api/v1/egain/sessions"), {
        headers,
        data: { fullName: "x", email: "a@b.example", accountNumber: "NF-100777", issue: "x" },
      });
      statuses.push(r.status());
      expect(r.status()).toBe(401);
      expect((await r.json()).error.code).toBe("UNAUTHENTICATED");
    }
    evidence.unauthenticatedStatuses = statuses;
  });

  test("identity: wrong details and a nonexistent account are indistinguishable (no enumeration)", async ({
    request,
  }) => {
    const wrongEmail = await request.post(api("/api/v1/egain/sessions"), {
      headers: auth(),
      data: { fullName: "x", email: "attacker@evil.example", accountNumber: "NF-100777", issue: "charged" },
    });
    const ghost = await request.post(api("/api/v1/egain/sessions"), {
      headers: auth(),
      data: {
        fullName: "x",
        email: "priya.nair@customer.example",
        accountNumber: "NF-000000",
        issue: "charged",
      },
    });
    expect(wrongEmail.status()).toBe(200);
    expect(await wrongEmail.json()).toEqual(await ghost.json());
    expect((await wrongEmail.json()).verified).toBe(false);
    evidence.identityNoEnumeration = true;
  });

  test("verified session resumes the customer's existing case and returns a short-lived token", async ({
    request,
  }) => {
    const r = await request.post(api("/api/v1/egain/sessions"), {
      headers: auth(),
      data: {
        fullName: "Priya Nair",
        email: "priya.nair@customer.example",
        accountNumber: "NF-100777",
        issue: "Cancelled twelve days ago, charged again",
      },
    });
    expect(r.status()).toBe(200);
    const b = await r.json();
    expect(b.verified).toBe(true);
    token = b.customerToken;
    caseRef = b.caseReference;
    expect(caseRef).toMatch(/^ORY-\d+$/);
    evidence.sessionState = b.state;
    evidence.caseReference = caseRef;
  });

  test("case view lists the proposed actions with exact consent wording; nothing is verified before consent", async ({
    request,
  }) => {
    const r = await request.get(api(`/api/v1/egain/cases/${caseRef}`), {
      headers: { ...auth(), "X-Customer-Token": token },
    });
    expect(r.status()).toBe(200);
    const b = await r.json();
    expect(b.ledger).toEqual([]);
    const cancel = b.proposedActions.find(
      (a: { operation: string }) => a.operation === "subscription.correct_cancellation",
    );
    const review = b.proposedActions.find(
      (a: { operation: string }) => a.operation === "subscription.create_billing_review",
    );
    expect(cancel?.consentText).toBeTruthy();
    expect(review?.consentText).toMatch(/does not refund anything by itself/);
    cancelActionId = cancel.actionId;
    reviewActionId = review.actionId;
    evidence.consentTextShown = true;
  });

  test("authorization: token required; a different customer's case is invisible (404, no leak)", async ({
    request,
  }) => {
    expect((await request.get(api(`/api/v1/egain/cases/${caseRef}`), { headers: auth() })).status()).toBe(
      401,
    );
    expect(
      (
        await request.get(api(`/api/v1/egain/cases/${caseRef}`), {
          headers: { ...auth(), "X-Customer-Token": "garbage" },
        })
      ).status(),
    ).toBe(401);
    const other = await request.get(api("/api/v1/egain/cases/ORY-1002"), {
      headers: { ...auth(), "X-Customer-Token": token },
    });
    expect(other.status()).toBe(404);
    expect(JSON.stringify(await other.json())).not.toMatch(/Elena/i);
    evidence.crossCustomerStatus = other.status();
  });

  test("consent must be an explicit boolean and a stable Idempotency-Key is mandatory", async ({
    request,
  }) => {
    const url = api(`/api/v1/egain/cases/${caseRef}/actions/${cancelActionId}/confirm`);
    const h = { ...auth(), "X-Customer-Token": token };
    const statuses = {
      noIdempotencyKey: (await request.post(url, { headers: h, data: { consent: true } })).status(),
      consentAsString: (
        await request.post(url, {
          headers: { ...h, "Idempotency-Key": "live-gw-0001-c1" },
          data: { consent: "yes" },
        })
      ).status(),
      noConsentField: (
        await request.post(url, { headers: { ...h, "Idempotency-Key": "live-gw-0001-c1" }, data: {} })
      ).status(),
      shortKey: (
        await request.post(url, { headers: { ...h, "Idempotency-Key": "short" }, data: { consent: true } })
      ).status(),
    };
    expect(Object.values(statuses)).toEqual([400, 400, 400, 400]);
    evidence.consentValidation = statuses;
  });

  test("consented cancellation: the exact permitted change runs, is read back, and returns a receipt; replay is safe", async ({
    request,
  }) => {
    const url = api(`/api/v1/egain/cases/${caseRef}/actions/${cancelActionId}/confirm`);
    const h = { ...auth(), "X-Customer-Token": token, "Idempotency-Key": "live-gw-0001-cancel" };
    const first = await request.post(url, { headers: h, data: { consent: true } });
    expect(first.status()).toBe(200);
    const b1 = await first.json();
    expect(b1.status).toBe("EXECUTED");
    expect(b1.verification?.verified).toBe(true);
    expect(b1.receiptNo).toMatch(/^RCPT-\d{8}-[0-9A-F]{16}$/);
    receiptNo = b1.receiptNo;
    const replay = await request.post(url, { headers: h, data: { consent: true } });
    const b2 = await replay.json();
    expect(["EXECUTED", "DUPLICATE"]).toContain(b2.status);
    expect(b2.receiptNo).toBe(receiptNo); // same receipt: no second change
    evidence.cancellation = {
      status: b1.status,
      verified: b1.verification.verified,
      replayStatus: b2.status,
      sameReceiptOnReplay: true,
    };
  });

  test("billing review above the $50 threshold waits for a person: pending, no receipt, no refund", async ({
    request,
  }) => {
    const url = api(`/api/v1/egain/cases/${caseRef}/actions/${reviewActionId}/confirm`);
    const h = { ...auth(), "X-Customer-Token": token, "Idempotency-Key": "live-gw-0001-review" };
    const r = await request.post(url, { headers: h, data: { consent: true } });
    expect(r.status()).toBe(200);
    const b = await r.json();
    expect(b).toMatchObject({ status: "AWAITING_APPROVAL", receiptNo: null });
    expect(b.message).toMatch(/team member must approve/);
    expect(JSON.stringify(b)).not.toMatch(/refund(ed)? (issued|completed|processed)/i);
    evidence.billingReview = { status: b.status, receiptNo: b.receiptNo, caseState: b.caseState };
  });

  test("the receipt verifies publicly; a tampered number is rejected without leaking anything", async ({
    request,
  }) => {
    const ok = await request.get(api(`/api/v1/receipts/${receiptNo}/verify`));
    expect(ok.status()).toBe(200);
    expect((await ok.json()).valid).toBe(true);
    const last = receiptNo.slice(-1);
    const tampered = receiptNo.slice(0, -1) + (last === "0" ? "1" : "0");
    const bad = await request.get(api(`/api/v1/receipts/${tampered}/verify`));
    expect(bad.status()).toBe(404);
    expect(await bad.json()).toEqual({ valid: false });
    evidence.receipt = { receiptNo, verifiedPublicly: true, tamperedRejected: true };
  });

  test("escalation: callback and email follow-up are recorded; repeating is idempotent; unknown channels are refused", async ({
    request,
  }) => {
    const h = { ...auth(), "X-Customer-Token": token };
    const cb = await request.post(api(`/api/v1/egain/cases/${caseRef}/escalations`), {
      headers: h,
      data: { channel: "callback_request", reason: "Please call me about the approval" },
    });
    expect(cb.status()).toBe(200);
    const cbj = await cb.json();
    expect(cbj).toMatchObject({ status: "OPEN", channel: "callback_request" });
    const again = await request.post(api(`/api/v1/egain/cases/${caseRef}/escalations`), {
      headers: h,
      data: { channel: "callback_request", reason: "Please call me about the approval" },
    });
    expect((await again.json()).escalationId).toBe(cbj.escalationId);
    const em = await request.post(api(`/api/v1/egain/cases/${caseRef}/escalations`), {
      headers: h,
      data: { channel: "email_request", reason: "Email me an update" },
    });
    expect((await em.json()).channel).toBe("email_request");
    expect(
      (
        await request.post(api(`/api/v1/egain/cases/${caseRef}/escalations`), {
          headers: h,
          data: { channel: "carrier_pigeon", reason: "x" },
        })
      ).status(),
    ).toBe(400);
    evidence.escalation = { callback: cbj.status, email: "OPEN", idempotent: true };
  });

  test("independent read-back: the operator console (a different channel) shows the same receipt on the case", async ({
    page,
  }) => {
    await ownerLogin(page);
    await page.goto(`${BASE}/app/cases/${caseRef}`);
    await expect(page.locator("main")).toContainText(receiptNo, { timeout: 30_000 });
    evidence.operatorConsoleShowsReceipt = true;
  });

  test("brute force: repeated identity attempts are rate limited with Retry-After", async ({ request }) => {
    let last = 0;
    let retry: string | undefined;
    for (let i = 0; i < 8; i++) {
      const r = await request.post(api("/api/v1/egain/sessions"), {
        headers: auth(),
        data: { fullName: "x", email: "bruteforce@evil.example", accountNumber: `NF-10099${i}`, issue: "x" },
      });
      last = r.status();
      retry = r.headers()["retry-after"];
      if (last === 429) break;
    }
    expect(last).toBe(429);
    expect(Number(retry)).toBeGreaterThan(0);
    evidence.bruteForceLimited = true;
  });

  test("the temporary key is revoked and immediately stops working", async ({ page, request }) => {
    await ownerLogin(page);
    await page.goto(`${BASE}/app/admin/api-keys`);
    const row = page.locator("tr", { hasText: "live gateway test (temporary)" }).first();
    await row.getByRole("button", { name: "Revoke" }).click();
    await expect(row.getByText("revoked")).toBeVisible({ timeout: 20_000 });
    const r = await request.get(api(`/api/v1/egain/cases/${caseRef}`), {
      headers: { ...auth(), "X-Customer-Token": token },
    });
    expect(r.status()).toBe(401);
    evidence.keyRevoked = true;
  });
});
