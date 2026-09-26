import { expect, test } from "@playwright/test";

const TOKEN = "0x4b7d1e5ec6889e63e70d39561edf925095dbed88";

test.describe("main flow: paste address → report", () => {
  test("home shows the scanner, disclaimer and onchain-only state", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("address-input")).toBeVisible();
    await expect(page.getByTestId("disclaimer")).toContainText(
      "not affiliated with or endorsed by Robinhood or Fomo",
    );
    // No green "Safe" wording anywhere ("Безопасность контракта" is the score name, allowed).
    await expect(page.locator("body")).not.toContainText(/Безопасно(?!сть)|\bSafe\b/);
  });

  test("invalid address is rejected client-side", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("address-input").fill("0x1234");
    await page.getByTestId("scan-button").click();
    await expect(page.locator("#addr-err")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("test contract produces a sourced report without invented values", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("address-input").fill(TOKEN);
    await page.getByTestId("scan-button").click();
    await expect(page).toHaveURL(new RegExp(`/token/${TOKEN}`));

    const report = page.getByTestId("token-report");
    await expect(report).toBeVisible();
    await expect(page.getByTestId("chain-badge")).toContainText("Robinhood Chain");
    await expect(page.getByTestId("chain-badge")).toContainText("4663");
    await expect(page.getByTestId("token-address")).toHaveText(
      "0x4B7d1E5ec6889e63e70D39561edf925095dbed88",
    );

    // Links to primary sources.
    await expect(page.getByTestId("link-blockscout")).toHaveAttribute(
      "href",
      /robinhoodchain\.blockscout\.com\/token\//,
    );
    await expect(page.getByTestId("link-dexscreener")).toHaveAttribute(
      "href",
      /dexscreener\.com\/robinhood\//,
    );

    // Market numbers come from Dexscreener and carry a source label.
    for (const id of ["stat-mcap", "stat-liquidity", "stat-volume"]) {
      const cell = page.getByTestId(id);
      await expect(cell).toHaveAttribute("data-source", "dexscreener");
      await expect(cell).toHaveAttribute("data-missing", "false");
      await expect(cell).toContainText("$");
    }

    // Four independent scores; social is "insufficient" without FOMO_API_KEY.
    for (const k of ["contractSafety", "liquidityHealth", "distributionHealth", "socialMomentum"]) {
      await expect(page.getByTestId(`score-${k}`)).toBeVisible();
    }
    // Social: a momentum level with Fomo data, "insufficient" without (never a fake number).
    await expect(page.getByTestId("level-socialMomentum")).toContainText(
      /импульс|momentum|Недостаточно данных|Insufficient data/i,
    );

    // Missing values say "no data" — never a fake zero.
    const missing = page.locator('[data-missing="true"]');
    for (const el of await missing.all()) await expect(el).not.toHaveText(/^\s*\$?0([.,]0+)?\s*$/);

    await expect(page.getByTestId("simulation")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Безопасно(?!сть)|\bSafe\b/);
  });

  test("language switch shows English", async ({ page }) => {
    await page.goto(`/token/${TOKEN}`);
    await page.getByTestId("language-select").selectOption("en");
    await expect(
      page.getByText("Add to watchlist").or(page.getByText("Remove from watchlist")),
    ).toBeVisible();
    await page.getByTestId("language-select").selectOption("ru");
    await expect(
      page.getByText("Добавить в наблюдение").or(page.getByText("Убрать из наблюдения")),
    ).toBeVisible();
    await page.getByTestId("language-select").selectOption("de");
    await expect(
      page.getByText("Zur Watchlist").or(page.getByText("Von Watchlist entfernen")),
    ).toBeVisible();
    await page.goto(`/token/${TOKEN}?lang=zh`);
    await expect(page.locator("html")).toHaveAttribute("lang", "zh");
  });

  test("watchlist toggle works through our API only", async ({ page }) => {
    await page.goto(`/token/${TOKEN}`);
    const btn = page.getByTestId("watch-button");
    await expect(btn).toBeVisible();
    const before = (await btn.textContent()) ?? "";
    await btn.click();
    await expect(btn).not.toHaveText(before);
    await btn.click();
    await expect(btn).toHaveText(before);
  });

  test("invalid token route returns 404 and API validates input", async ({ page, request }) => {
    const res = await page.goto("/token/not-an-address");
    expect(res?.status()).toBe(404);
    const api = await request.get("/api/scan/0x123");
    expect(api.status()).toBe(400);
  });

  test("source status is internal: no public page or API", async ({ page, request }) => {
    expect((await page.goto("/status"))?.status()).toBe(404);
    expect((await page.goto("/admin/status"))?.status()).toBe(404);
    expect((await request.get("/api/status")).status()).toBe(404);
  });

  test("security headers are present", async ({ request }) => {
    const res = await request.get("/");
    const csp = res.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  });
});
