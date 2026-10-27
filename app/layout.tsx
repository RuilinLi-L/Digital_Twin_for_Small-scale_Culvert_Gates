import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "涵闸智维 | 轻量化数字孪生运维原型",
  description: "小型涵闸轻量化数字孪生运维技术与系统构建项目演示网站。",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
