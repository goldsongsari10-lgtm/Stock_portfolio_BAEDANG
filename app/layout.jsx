import "./globals.css";

export const metadata = {
  title: "배당 포트폴리오",
  description: "배당 포트폴리오"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
