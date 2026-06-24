/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0B0F19',
          800: '#151D30',
          700: '#1F2942',
          600: '#2E3C5E',
        }
      }
    },
  },
  plugins: [],
}
