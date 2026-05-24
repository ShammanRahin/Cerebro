/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cerebro: {
          bg: '#0f1117',
          surface: '#1a1d27',
          border: '#2a2d3a',
          accent: '#6c63ff',
          'accent-hover': '#5a52e8',
          correct: '#22c55e',
          wrong: '#ef4444',
          review: '#f59e0b',
        },
      },
    },
  },
  plugins: [],
}
