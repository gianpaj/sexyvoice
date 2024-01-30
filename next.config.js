const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        port: '',
        pathname: '**'
      },
      {
        protocol: 'https',
        hostname: 'uxjubqdyhv4aowsi.public.blob.vercel-storage.com',
        port: ''
      }
    ]
  },
  sassOptions: {
    includePaths: [path.join(__dirname, 'styles')]
  },
  experimental: {
    serverComponentsExternalPackages: ['oslo']
    // typedRoutes: true
  }
}
module.exports = nextConfig
