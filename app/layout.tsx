import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "CVFacil.NG",
  description: "A professional resume builder with dark mode aesthetics, real-time preview, and dashboard management.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Google Fonts: Inter and Outfit */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet" />
        
        {/* Material Symbols: importada em globals.css, antes do Tailwind (ordem de cascata) */}

        <style dangerouslySetInnerHTML={{
          __html: `
            /* Custom scrollbar */
            ::-webkit-scrollbar {
                width: 8px;
                height: 8px;
            }
            ::-webkit-scrollbar-track {
                background: #020617; 
            }
            ::-webkit-scrollbar-thumb {
                background: #334155; 
                border-radius: 4px;
            }
            ::-webkit-scrollbar-thumb:hover {
                background: #d97706; 
            }
          `
        }} />
      </head>
      <body className="bg-forest-deep text-stone-200 h-full overflow-x-hidden selection:bg-primary selection:text-white">
        {/* Libraries for PDF Generation */}
        <Script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" strategy="beforeInteractive" />
        <Script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" strategy="beforeInteractive" />
        
        {children}
      </body>
    </html>
  );
}
