import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("landing page shows the promise, the honest notice and the Hindi version", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Maa ki khairiyat");
    await expect(
      page.getByText("Not an emergency service: in an emergency, call 112"),
    ).toBeVisible();
    await expect(page.getByText("₹1,499/month")).toBeVisible();
    await page.getByRole("link", { name: "हिंदी" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("ख़ैरियत");
    for (const path of ["/privacy", "/terms", "/not-an-emergency-service"]) {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
    }

    // Mobile-first: nothing may scroll sideways on a 390px phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("health endpoint reports demo mode without secrets", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("no-store");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      status: "ok",
      app: "Khairiyat",
      demo: true,
      modes: { voice: "mock", whatsapp: "mock", email: "mock", payments: "mock" },
    });
    const text = JSON.stringify(body).toLowerCase();
    for (const word of ["secret", "token", "api_key", "password"]) {
      expect(text).not.toContain(word);
    }
  });
});
