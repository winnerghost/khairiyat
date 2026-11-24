import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("home page shows the brand and the honest positioning", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Maa ki khairiyat");
    await expect(page.getByText("not a medical or emergency service")).toBeVisible();

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
