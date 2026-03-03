import forms from "@tailwindcss/forms";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {
      fontFamily: {
        quicksand: ["Quicksand", "sans-serif"],
      },
    },
  },
  plugins: [forms],
};
