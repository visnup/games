import { expect, test } from "@playwright/test";
import { randomUUID } from "crypto";

test("deals a game against three bots", async ({ page }) => {
  await page.goto(`/${randomUUID()}`);
  await page.getByRole("button", { name: "Deal 4 players" }).click();
  await expect(page.getByText(/leads? with|Waiting for|Pick the chip/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /^You/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Bot/ })).toHaveCount(3);
});

test("a reload keeps your seat", async ({ page }) => {
  await page.goto(`/${randomUUID()}`);
  await page.getByRole("button", { name: "Deal 4 players" }).click();
  await expect(page.getByRole("heading", { name: /^You/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /^You/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Bot/ })).toHaveCount(3);
});

test("plays a whole game by passing", async ({ page }) => {
  // 15 seconds alone, and past the 30-second default while a dataset has every core
  test.setTimeout(90e3);
  await page.goto(`/${randomUUID()}`);
  await page.getByRole("button", { name: "Deal 4 players" }).click();
  const over = page.getByText(/ won!$|Nobody won/);
  while (!(await over.isVisible())) {
    for (const name of ["Pass", "Discard it", "pink", "Continue"]) {
      const button = page.getByRole("button", { name, exact: true });
      if (await button.isVisible()) await button.click();
    }
    await page.waitForTimeout(200);
  }
  await expect(over).toBeVisible();
});

test("two people at one table each see the game", async ({ browser }) => {
  const table = randomUUID();
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  await a.goto(`/${table}`);
  await b.goto(`/${table}`);
  await expect(a.getByText("Player 2")).toBeVisible({ timeout: 10e3 });
  await a.getByRole("button", { name: "Remove bot" }).first().click();
  await a.getByRole("button", { name: "Deal 4 players" }).click();
  for (const page of [a, b]) await expect(page.getByRole("heading", { name: /^You/ })).toBeVisible();
});
