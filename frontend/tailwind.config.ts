import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Latin system fonts first; Indic glyphs fall through to the Noto faces (lib/i18n/fonts.ts).
        sans: [
          'ui-sans-serif',
          'system-ui',
          'var(--font-deva)',
          'var(--font-beng)',
          'var(--font-orya)',
          'var(--font-knda)',
          'sans-serif',
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
          '"Noto Color Emoji"',
        ],
      },
      colors: {
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
      },
    },
  },
  plugins: [],
};
export default config;
