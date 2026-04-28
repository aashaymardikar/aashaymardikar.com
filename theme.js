(function() {
  var root = document.documentElement;
  var themeToggle = document.querySelector("[data-theme-toggle]");
  var themeToggleLabel = document.querySelector("[data-theme-toggle-label]");
  var themeColorMeta = document.querySelector('meta[name="theme-color"]');
  var themeColors = {
    light: "#f4f1ea",
    dark: "#0d1217"
  };

  function syncThemeUi(theme) {
    root.style.colorScheme = theme;

    if (themeColorMeta && themeColors[theme]) {
      themeColorMeta.setAttribute("content", themeColors[theme]);
    }

    if (themeToggleLabel) {
      themeToggleLabel.textContent = theme.charAt(0).toUpperCase() + theme.slice(1);
    }

    if (themeToggle) {
      themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
      themeToggle.setAttribute(
        "title",
        theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      );
    }
  }

  function getCurrentTheme() {
    return root.dataset.theme === "dark" ? "dark" : "light";
  }

  function setTheme(theme, persist) {
    root.dataset.theme = theme;
    syncThemeUi(theme);

    if (persist) {
      try {
        localStorage.setItem("theme", theme);
      } catch (error) {
        return;
      }
    }
  }

  syncThemeUi(getCurrentTheme());

  if (themeToggle) {
    themeToggle.addEventListener("click", function() {
      var nextTheme = getCurrentTheme() === "dark" ? "light" : "dark";
      setTheme(nextTheme, true);
    });
  }
})();
