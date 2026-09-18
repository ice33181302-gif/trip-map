/** @type {import('next').NextConfig} */
const nextConfig = {
  // jsdom은 번들링하면 깨지기 쉬워서 서버에서 그대로 불러오게 합니다.
  serverExternalPackages: ["jsdom"],
};

export default nextConfig;
