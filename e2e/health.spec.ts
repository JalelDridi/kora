import { expect, test } from "@playwright/test";

// The first check of the bundled Prisma client and the proxy matcher under
// `next start`: the route must reach Postgres and must not be redirected to a
// locale.
test("the health endpoint answers in the built app", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    status: "ok",
    database: "ok",
    redis: "off",
  });
});
