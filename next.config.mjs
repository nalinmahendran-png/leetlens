/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // the Postgres driver loads optional modules at runtime; leave it to Node instead of bundling it
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
  // Prisma's Rust-free engine reads query_compiler_bg.wasm from node_modules/.prisma/client at runtime;
  // make sure Vercel ships that folder with every route
  outputFileTracingIncludes: {
    "/*": ["./node_modules/.prisma/client/**/*"],
    "/**/*": ["./node_modules/.prisma/client/**/*"],
  },
};

export default nextConfig;
