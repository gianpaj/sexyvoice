import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  experimental: {
    useTypeScriptCli: true,
  },
  serverExternalPackages: ['@takumi-rs/core', '@takumi-rs/image-response'],
  reactStrictMode: true,
};

export default withMDX(config);
