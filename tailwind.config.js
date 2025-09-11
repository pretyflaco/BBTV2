/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'blink-orange': '#FF6600',
        'blink-dark': '#1a1a1a',
      },
      animation: {
        'payment-pulse': 'payment-pulse 0.6s ease-in-out',
        'payment-celebration': 'payment-celebration 4s ease-in-out',
      },
      keyframes: {
        'payment-pulse': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
        'payment-celebration': {
          '0%': { opacity: '0', transform: 'scale(0.1)' },
          '15%': { opacity: '1', transform: 'scale(1.2)' },
          '85%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
