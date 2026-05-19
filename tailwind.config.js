/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/webview/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        teal: {
          DEFAULT: '#00b4a4',
          txt: '#00c8b6',
          btn: '#0a5f56',
          'btn-h': '#0d7a6e',
          dim: 'rgba(0,180,164,0.12)',
          bdr: 'rgba(0,180,164,0.28)',
        },
      },
    },
  },
  plugins: [],
};
