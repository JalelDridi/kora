// Vercel Web Analytics counts page views without cookies. Its script is
// served by Vercel itself (/_vercel/insights/script.js), so the component is
// rendered only in a Vercel build: a local or CI build would request a file
// that is not there and log an error on every page.
/** `vercel` is the value of the VERCEL environment variable. */
export function webAnalyticsEnabled(vercel: string | undefined): boolean {
  return vercel === "1";
}
