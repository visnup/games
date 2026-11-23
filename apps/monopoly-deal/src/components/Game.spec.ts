import { expect, test } from "@playwright/test";
import { randomUUID } from "crypto";

test("deals a game against a bot", async ({ page }) => {
  await page.goto(`/${randomUUID()}`);
  await page.getByRole("button", { name: "Deal 2 players" }).click();
  await expect(page.getByText(/plays? left|Waiting for/)).toBeVisible();
  await expect(page).toHaveTitle((await page.getByText(/plays? left/).isVisible()) ? "Your move · Monopoly Deal" : "Monopoly Deal");
  await expect(page.getByRole("heading", { name: /^You/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Bot/ })).toBeVisible();
});

test("a reload keeps your seat", async ({ page }) => {
  await page.goto(`/${randomUUID()}`);
  await page.getByRole("button", { name: "Deal 2 players" }).click();
  await expect(page.getByRole("heading", { name: /^You/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /^You/ })).toBeVisible();
  await expect(page.getByText("you're watching")).toBeHidden();
});

test("plays a whole game by ending every turn", async ({ page }) => {
  test.setTimeout(180e3);
  await page.goto(`/${randomUUID()}`);
  await page.getByRole("button", { name: "Deal 2 players" }).click();
  const over = page.getByText(/ won!$|Nobody won/);
  const cards = page.locator("button.card");
  // the bar redraws with every play, so a button can go before the click lands
  const click = (button: ReturnType<typeof page.locator>) => button.click({ timeout: 1e3 }).catch(() => {});
  while (!(await over.isVisible())) {
    for (const name of ["Skip", "Let it through", "End turn"]) {
      const button = page.getByRole("button", { name, exact: true });
      if (await button.isVisible()) await click(button);
    }
    const pay = page.getByRole("button", { name: "Pay", exact: true });
    for (let i = 0; (await pay.isVisible()) && (await pay.isDisabled()) && i < (await cards.count()); i++) await click(cards.nth(i));
    if (await pay.isVisible()) await click(pay);
    const discard = await page
      .getByText(/^Discard \d+ cards?\.$/)
      .textContent({ timeout: 100 })
      .catch(() => null);
    if (discard) {
      for (let i = 0; i < Number(discard.match(/\d+/)![0]); i++) await click(cards.nth(i));
      await click(page.getByRole("button", { name: "Done", exact: true }));
    }
    await page.waitForTimeout(100);
  }
  await expect(over).toBeVisible();
});

test("two people at one table each see the game", async ({ browser }) => {
  const table = randomUUID();
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  await a.goto(`/${table}`);
  await b.goto(`/${table}`);
  await expect(a.getByText("Player 2")).toBeVisible({ timeout: 10e3 });
  await a.getByRole("button", { name: "Remove bot" }).click();
  await a.getByRole("button", { name: "Deal 2 players" }).click();
  for (const page of [a, b]) await expect(page.getByText(/plays? left|Waiting for Player/)).toBeVisible();
});

test("a sixth visitor to a full table watches", async ({ browser }) => {
  const table = randomUUID();
  const pages = await Promise.all(Array.from({ length: 5 }, () => browser.newPage()));
  for (const page of pages) await page.goto(`/${table}`);
  await expect(pages[0].getByText("Player 5")).toBeVisible({ timeout: 10e3 });
  await pages[0].getByRole("button", { name: "Remove bot" }).click();
  await pages[0].getByRole("button", { name: "Deal 5 players" }).click();
  const watcher = await browser.newPage();
  await watcher.goto(`/${table}`);
  await expect(watcher.getByText("you're watching")).toBeVisible();
  await expect(watcher.getByRole("heading", { name: /^Player 1/ })).toBeVisible();
});

test("a name typed in the lobby shows to the others, and on the board", async ({ browser }) => {
  const table = randomUUID();
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  await a.goto(`/${table}`);
  await b.goto(`/${table}`);
  await a.getByLabel("Your name").fill("Ada");
  await expect(b.getByText("Ada")).toBeVisible({ timeout: 10e3 });
  await b.getByRole("button", { name: "Remove bot" }).click();
  await b.getByRole("button", { name: "Deal 2 players" }).click();
  await expect(b.getByRole("heading", { name: /^Ada/ })).toBeVisible();
});
