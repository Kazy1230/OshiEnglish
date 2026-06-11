import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本番ビルド用スタンドアロンモード（Docker最適化）
  output: "standalone",
};

export default nextConfig;
