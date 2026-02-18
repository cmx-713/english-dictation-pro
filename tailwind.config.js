/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563EB', // Blue 600
        secondary: '#059669', // Emerald 600
        accent: '#F59E0B', // Amber 500
      }
    },
  },
  plugins: [],
}
