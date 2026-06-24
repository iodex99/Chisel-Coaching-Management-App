/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Chisel brand palette, sampled from the logo
        brand: {
          50: '#ececf9',
          100: '#d6d6f2',
          200: '#aeaee6',
          300: '#8585d9',
          400: '#4f4fc4',
          500: '#2d2bab',
          600: '#1e1b8c', // primary navy
          700: '#191674',
          800: '#13115a',
          900: '#0e0c42',
          950: '#080725'
        },
        accent: {
          50: '#fdf2f0',
          100: '#fbe0db',
          200: '#f5c0b8',
          300: '#ed988b',
          400: '#e06b5a',
          500: '#c0392b', // tagline red
          600: '#a52d22',
          700: '#86241c',
          800: '#6e2019',
          900: '#5c1f1a'
        }
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'Inter', 'Arial', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)'
      }
    }
  },
  plugins: []
}
