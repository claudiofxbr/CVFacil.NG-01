/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    API_KEY: process.env.API_KEY,
  },
  output: 'standalone',
  // Disable strict mode if it causes double-renders that confuse the user (optional)
  reactStrictMode: true,
};

export default nextConfig;
