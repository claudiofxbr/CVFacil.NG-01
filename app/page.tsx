'use client';

import dynamic from 'next/dynamic';

// Dynamically import App to avoid SSR issues with browser-only APIs (localStorage, window)
const App = dynamic(() => import('../App'), { ssr: false });

export default function Home() {
  return <App />;
}
