/** @type {import('tailwindcss').Config} */
// Mesmo tema que antes vinha do script inline do CDN em app/layout.tsx.
export default {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './App.tsx',
    './types.ts',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      colors: {
        primary: '#d97706',
        secondary: '#c2410c',
        'forest-deep': '#020617',
        'forest-base': '#0f172a',
        'forest-surface': '#1e293b',
        'forest-border': '#334155',
        'stone-200': '#e2e8f0',
        'stone-400': '#94a3b8',
      },
    },
  },
  plugins: [],
};
