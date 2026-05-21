/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/@:handle",
        destination: "/:handle",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
