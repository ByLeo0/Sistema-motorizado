/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand:  {DEFAULT: '#534AB7', light: '#EEEDFE', dark: '#3C3489'},
        teal:   {DEFAULT: '#1D9E75', light: '#E1F5EE', dark: '#0F6E56'},
        coral:  {DEFAULT: '#D85A30', light: '#FAECE7', dark: '#993C1D'},
        amber:  {DEFAULT: '#BA7517', light: '#FAEEDA', dark: '#854F0B'},
      },
    },
  },
  plugins: [],
};
