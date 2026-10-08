import { expect, test } from "@playwright/test";
import { PHONES } from "./support/env";
import { signInWithUi } from "./support/session";

test("the harness can sign in through the real login screen", async ({ page }) => {
  await signInWithUi(page, PHONES.smallOwner);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("خوش آمدید");
});
