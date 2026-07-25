import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRootEnv } from "./load-root-env.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicEnv = loadRootEnv(here);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  outputFileTracingRoot: path.join(here, "../.."),
  transpilePackages: ["@verimesh/shared"],
  env: publicEnv,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
