import { expect, type Page, test } from "@playwright/test";

/**
 * The whole family journey in demo mode:
 * sign up → onboarding (7 steps) → introduction call → red-flag call →
 * summary + alert → phone preview → billing → export → delete.
 *
 * Calls are only allowed 08:00–20:00 in the parent's time zone (a hard
 * rule, even in tests), so we pick a time zone where it's daytime now.
 */
test.setTimeout(240_000);

const ZONES: [string, number][] = [
  ["Asia/Kolkata", 330],
  ["Asia/Dubai", 240],
  ["Asia/Riyadh", 180],
  ["Asia/Singapore", 480],
  ["Australia/Sydney", 660],
  ["Pacific/Auckland", 780],
  ["America/Los_Angeles", -480],
  ["America/Chicago", -360],
  ["America/New_York", -300],
];

function daytimeZone(): string {
  const now = new Date();
  for (const [zone] of ZONES) {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        hour: "2-digit",
        hourCycle: "h23",
      }).format(now),
    );
    if (hour >= 9 && hour < 18) return zone;
  }
  return "Asia/Kolkata";
}

async function saveAndExpectStep(page: Page, title: string) {
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
}

async function waitForText(page: Page, url: string, text: RegExp, timeoutMs = 90_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    await page.goto(url);
    if ((await page.getByText(text).count()) > 0) return;
    await page.waitForTimeout(3000);
  }
  throw new Error(`Timed out waiting for ${text} on ${url}`);
}

test("a family sets up Maa, hears about calls and alerts, pays, exports and deletes", async ({
  page,
}, info) => {
  const email = `e2e-${info.project.name}-${Date.now()}@example.com`;
  const zone = daytimeZone();

  // 1. Sign up
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Riya Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-strong-password");
  await page.getByRole("button", { name: "Start free trial" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("Let's set up the first call")).toBeVisible();

  // 2. Onboarding wizard
  await page.getByRole("link", { name: "Add your parent" }).click();
  await page.getByLabel("Parent's name").fill("Kamla Test");
  await page.getByLabel("How should the assistant address them?").fill("Maa");
  await page.getByLabel("Their phone number").fill("98765 43210");
  await page.getByLabel("City").fill("Lucknow");
  await saveAndExpectStep(page, "Call time");

  await page.getByLabel("What time should we call?").fill("10:00");
  await page.getByLabel("Your parent's time zone").selectOption(zone);
  await saveAndExpectStep(page, "Medicines");

  await page.getByRole("button", { name: "+ Add a medicine" }).click();
  await page.getByLabel("Name").fill("BP tablet");
  await saveAndExpectStep(page, "Things they love");

  await page.getByLabel("What do they enjoy talking about?").fill("bhajans, cricket");
  await saveAndExpectStep(page, "Health notes");
  await page
    .getByLabel("Anything the assistant should be gentle about?")
    .fill("Knee pain in the mornings");
  await saveAndExpectStep(page, "Who to alert");

  await page.getByLabel("Name").fill("Neighbour aunty");
  await page.getByLabel("WhatsApp number").fill("+91 99999 12345");
  await saveAndExpectStep(page, "Consent");

  await page.getByLabel("I have told Maa about these calls.").check();
  await page.getByRole("button", { name: "Finish setup and start free trial" }).click();
  await expect(page.getByText("All set!")).toBeVisible();
  const dashboardUrl = page.url().split("?")[0]!;
  await expect(page.getByTestId("today-status")).toContainText(/Introduction call/);

  // 3. Introduction (consent) call from the demo room: Maa says yes
  await page.goto("/demo");
  await page.getByLabel("What happens on the call").selectOption("consent_yes");
  await page.getByRole("button", { name: "Call now" }).click();
  await expect(page.getByText(/Calling Maa/)).toBeVisible();
  await waitForText(page, dashboardUrl, /Maa agreed to daily calls/);

  // 4. A call where Maa mentions a fall → urgent alert
  await page.goto("/demo");
  await page.getByLabel("What happens on the call").selectOption("fall");
  await page.getByRole("button", { name: "Call now" }).click();
  await waitForText(page, dashboardUrl, /Maa mentioned a fall/);
  await expect(page.getByText("Needs your attention")).toBeVisible();

  // 5. The alert contact's WhatsApp got the urgent message
  await page.goto("/demo/phone");
  await page.getByRole("link", { name: /Neighbour aunty/ }).click();
  await expect(page.getByText(/Please call Maa now/).first()).toBeVisible();

  // 6. Billing: choose a plan and pay (demo)
  await page.goto("/app/billing");
  await page.getByRole("button", { name: "Choose Standard" }).click();
  await page.getByRole("button", { name: /Pay ₹1,499 \(demo\)/ }).click();
  await expect(page.getByText("Payment successful")).toBeVisible();
  await expect(page.getByText(/Standard plan for Maa/)).toBeVisible();

  // 7. Export all data
  await page.goto("/app/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download all data (JSON)" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const data = JSON.parse(await readFile(path!, "utf8")) as {
    parents: { profile: { name: string }; healthNotes: string }[];
  };
  expect(data.parents[0]!.profile.name).toBe("Kamla Test");
  expect(data.parents[0]!.healthNotes).toBe("Knee pain in the mornings");

  // 8. Delete the parent
  await page.goto(`${dashboardUrl}/delete`);
  await page.getByLabel("Type Maa to confirm").fill("Maa");
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByText("Deleted. All of their data has been removed.")).toBeVisible();
});

test("demo login shows the Sharma family and the admin panel", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Open the Sharma family demo" }).click();
  await expect(page.getByRole("heading", { name: "Sharma family" })).toBeVisible();
  await expect(page.getByTestId("home-status").first()).toBeVisible();

  await page.goto("/login");
  // Already logged in → redirected to the app; log in as admin from a fresh context instead.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: "Open the admin panel" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Today");
  for (const path of [
    "/admin/families",
    "/admin/costs",
    "/admin/failures",
    "/admin/audit",
    "/admin/settings",
  ]) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
  }
});

test("family pages are private", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
  const res = await page.request.get("/api/export");
  expect(res.url()).toContain("/login");
});
