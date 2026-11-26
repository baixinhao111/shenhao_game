/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#0A0B0F',
        panel: '#141720',
        gold: {
          DEFAULT: '#E6C165',
          light: '#F9DF8B',
          dark: '#B58E35',
        },
        cyber: {
          DEFAULT: '#38BDF8',
          bright: '#22D3EE',
        },
        crimson: '#F43F5E',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
      },
      boxShadow: {
        gold: '0 0 24px rgba(230, 193, 101, 0.25)',
        cyber: '0 0 24px rgba(56, 189, 248, 0.28)',
      },
    },
  },
  plugins: [],
};
