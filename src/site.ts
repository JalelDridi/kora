// The name is decision D1; changing it here changes it everywhere.
export const site = {
  name: "Kora",
  // Vercel sets this to the production address, without the protocol.
  url: process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000",
  // Same as --color-pitch-950 in src/app/globals.css (checked by a test).
  themeColor: "#0b1510",
  // The public repository: code, data, licences and the issue tracker that
  // the Sources and privacy pages point to for contact.
  repo: "https://github.com/JalelDridi/kora",
};
