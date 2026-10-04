// tailwind.config.js
module.exports = {
  content: [
    "./app/**/*.{ts,tsx,js,jsx}",
    "./pages/**/*.{ts,tsx,js,jsx}",
    "./components/**/*.{ts,tsx,js,jsx}",
    "./src/**/*.{ts,tsx,js,jsx}"
  ],
  theme: { extend: {} },
  plugins: [],
  safelist: ['bg-slate-50', 'bg-slate-100', 'text-red-600', 'text-green-600']
};

