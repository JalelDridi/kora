// The name is decision D1; changing it here changes it everywhere.
export const site = {
  name: "Kora",
  // Vercel sets this to the production address, without the protocol.
  url: process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000",
};
