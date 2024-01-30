/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        port: '',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: 'uxjubqdyhv4aowsi.public.blob.vercel-storage.com',
        port: '',
      },
    ],
  },
};
module.exports = nextConfig;
