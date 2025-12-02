import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  
  // Avoid hydration errors with Live2D
  experimental: {
    // This ensures proper loading of Dynamic components
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  
  // Configure CORS for external model files
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/(.*)',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods', 
            value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
          },
        ],
      },
    ];
  },

  // Webpack configuration for better compatibility (used in production builds)
  webpack: (config) => {
    // Handle canvas-related modules for SSR
    config.externals = [...(config.externals || []), { canvas: 'canvas' }];
    
    return config;
  },

  // Turbopack configuration (Next.js 16 uses Turbopack by default for dev)
  turbopack: {
    // Add empty config to silence the error
    // The webpack config above will still be used for production builds
  },
};

export default nextConfig;
