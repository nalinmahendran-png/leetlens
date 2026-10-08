/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // the Postgres driver loads optional modules at runtime; leave it to Node instead of bundling it
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
};

export default nextConfig;
