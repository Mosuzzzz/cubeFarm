import { expect, test } from "@playwright/test";

test("shows the bounded watering lifecycle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3000");
  await expect(page.locator(".farm-heading")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "MANUAL" }).click();
  await page.getByRole("button", { name: "รดน้ำ 5 วิ" }).click();
  await expect(page.getByText("ปั๊มกำลังรดน้ำ และจะหยุดอัตโนมัติใน 5 วินาที")).toBeVisible();
  await page.screenshot({ path: "../../.impeccable/review/mobile-watering.png", fullPage: true });
  await expect(page.getByText("รดน้ำครบ 5 วินาที ปั๊มหยุดแล้ว")).toBeVisible({ timeout: 7000 });
  await page.screenshot({ path: "../../.impeccable/review/mobile-watered.png", fullPage: true });
});
