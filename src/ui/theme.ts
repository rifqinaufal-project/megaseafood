export const THEME_STORAGE_KEY = "megaseafood-theme";

// Dijalankan sinkron sebelum paint. Nilai tersimpan: "light" | "dark" | "system" (atau kosong = system).
export const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem("${THEME_STORAGE_KEY}");var dark=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",dark?"dark":"light");}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;
