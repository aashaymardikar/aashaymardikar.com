/**
 * Lightweight, provider-agnostic event tracking.
 *
 * This file contains no tracking service of its own. It normalizes a set of
 * meaningful site events and forwards them to whichever analytics script is
 * loaded in index.html (Umami, Plausible, or GoatCounter). If no provider is
 * present, every call is a safe no-op, so the site works unchanged.
 *
 * Nothing here reads or writes cookies, and no personal data is collected.
 * Visitor-level identity (country, unique-visitor counting) is handled by the
 * provider, cookielessly, and is never available to this script.
 */
(function() {
  var CONFIG = {
    // Event groups — flip any of these off if a dashboard gets noisy.
    links: true,        // outbound links, DOIs, profiles, CV downloads
    navigation: true,   // in-page nav clicks
    reading: true,      // which sections actually get read
    scrollDepth: true,  // 25 / 50 / 75 / 100 percent milestones
    engagement: true,   // active seconds on page, sent once on exit
    theme: true,        // light/dark toggle usage

    // A section must be at least half visible this long to count as "read".
    readDwellMs: 2000,

    // Log to the console instead of the network when no provider is loaded.
    debug: false
  };

  var root = document.documentElement;

  /* ---------------------------------------------------------------------
   * Opt-outs. Do not track local development or visitors who have asked
   * not to be tracked (Do Not Track / Global Privacy Control).
   * ------------------------------------------------------------------ */

  function isLocal() {
    var host = location.hostname;
    return (
      location.protocol === "file:" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "" ||
      /\.local$/.test(host)
    );
  }

  function optedOut() {
    return (
      navigator.doNotTrack === "1" ||
      window.doNotTrack === "1" ||
      navigator.msDoNotTrack === "1" ||
      navigator.globalPrivacyControl === true
    );
  }

  if (isLocal() && !CONFIG.debug) {
    return;
  }

  if (optedOut()) {
    return;
  }

  /* ---------------------------------------------------------------------
   * Provider adapters. The first provider found wins.
   * ------------------------------------------------------------------ */

  function dispatch(name, props) {
    var data = props || {};

    if (window.umami && typeof window.umami.track === "function") {
      window.umami.track(name, data);
      return;
    }

    if (typeof window.plausible === "function") {
      window.plausible(name, { props: data });
      return;
    }

    if (window.goatcounter && typeof window.goatcounter.count === "function") {
      window.goatcounter.count({
        path: goatcounterPath(name, data),
        title: name,
        event: true
      });
      return;
    }

    if (CONFIG.debug) {
      console.debug("[analytics]", name, data);
    }
  }

  // GoatCounter has no structured properties, so fold them into the path.
  function goatcounterPath(name, data) {
    var parts = [];
    var key;

    for (key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        parts.push(key + "=" + data[key]);
      }
    }

    return parts.length ? name + "?" + parts.join("&") : name;
  }

  var track = dispatch;

  /* ---------------------------------------------------------------------
   * Link clicks: papers, profiles, CV, and any other outbound link.
   * ------------------------------------------------------------------ */

  function journalFor(link) {
    var item = link.closest("li");
    var journal = item && item.querySelector("em");

    if (!journal) {
      return null;
    }

    return journal.textContent.trim().replace(/[.,]\s*$/, "");
  }

  function trackLink(link) {
    var href = link.getAttribute("href") || "";

    if (href.indexOf("mailto:") === 0) {
      track("Profile Click", { network: "email" });
      return;
    }

    var url;

    try {
      url = new URL(link.href);
    } catch (error) {
      return;
    }

    if (/\.pdf$/i.test(url.pathname)) {
      track("CV Download", { file: url.pathname.split("/").pop() });
      return;
    }

    if (url.hostname === location.hostname) {
      return;
    }

    if (/(^|\.)doi\.org$/.test(url.hostname)) {
      track("Paper Click", {
        doi: url.pathname.replace(/^\//, ""),
        journal: journalFor(link) || "unknown"
      });
      return;
    }

    if (/scholar\.google\./.test(url.hostname)) {
      track("Profile Click", { network: "google-scholar" });
      return;
    }

    if (/(^|\.)linkedin\.com$/.test(url.hostname)) {
      track("Profile Click", { network: "linkedin" });
      return;
    }

    track("Outbound Link", { host: url.hostname, url: url.href });
  }

  if (CONFIG.links || CONFIG.navigation) {
    document.addEventListener("click", function(event) {
      var link = event.target.closest("a");

      if (!link) {
        return;
      }

      var href = link.getAttribute("href") || "";

      if (href.indexOf("#") === 0) {
        if (CONFIG.navigation && href !== "#" && href !== "#top") {
          track("Nav Click", { to: href.slice(1) });
        }
        return;
      }

      if (CONFIG.links) {
        trackLink(link);
      }
    });
  }

  /* ---------------------------------------------------------------------
   * Reading depth: which sections a visitor actually stops on.
   * ------------------------------------------------------------------ */

  var sectionsRead = [];

  if (CONFIG.reading && "IntersectionObserver" in window) {
    var timers = new WeakMap();

    var observer = new IntersectionObserver(
      function(entries) {
        entries.forEach(function(entry) {
          var section = entry.target;

          if (entry.isIntersecting) {
            if (timers.has(section)) {
              return;
            }

            timers.set(
              section,
              window.setTimeout(function() {
                observer.unobserve(section);
                sectionsRead.push(section.id);
                track("Section Read", { section: section.id });
              }, CONFIG.readDwellMs)
            );
            return;
          }

          if (timers.has(section)) {
            window.clearTimeout(timers.get(section));
            timers.delete(section);
          }
        });
      },
      { threshold: 0.5 }
    );

    document.querySelectorAll("section[id]").forEach(function(section) {
      observer.observe(section);
    });
  }

  /* ---------------------------------------------------------------------
   * Scroll depth milestones.
   * ------------------------------------------------------------------ */

  var maxDepth = 0;

  if (CONFIG.scrollDepth) {
    var milestones = [25, 50, 75, 100];
    var reached = {};
    var queued = null;

    var measure = function() {
      queued = null;

      var scrollable = root.scrollHeight - window.innerHeight;
      var depth = scrollable > 0
        ? Math.min(100, Math.round((window.scrollY / scrollable) * 100))
        : 100;

      if (depth <= maxDepth) {
        return;
      }

      maxDepth = depth;

      milestones.forEach(function(milestone) {
        if (depth >= milestone && !reached[milestone]) {
          reached[milestone] = true;
          track("Scroll Depth", { depth: milestone });
        }
      });
    };

    // Throttled with a timer rather than requestAnimationFrame: rAF does not
    // run in a background tab, which would latch the pending flag forever and
    // silently kill scroll tracking for pages opened in an unfocused tab.
    window.addEventListener(
      "scroll",
      function() {
        if (queued !== null) {
          return;
        }

        queued = window.setTimeout(measure, 250);
      },
      { passive: true }
    );

    measure();
  }

  /* ---------------------------------------------------------------------
   * Theme toggle usage.
   * ------------------------------------------------------------------ */

  if (CONFIG.theme) {
    var toggle = document.querySelector("[data-theme-toggle]");

    if (toggle) {
      toggle.addEventListener("click", function() {
        // theme.js flips the attribute on the same click, so read it after.
        window.setTimeout(function() {
          track("Theme Toggle", { to: root.dataset.theme || "light" });
        }, 0);
      });
    }
  }

  /* ---------------------------------------------------------------------
   * Engaged time, counted only while the tab is actually visible and
   * reported once when the visitor leaves.
   * ------------------------------------------------------------------ */

  if (CONFIG.engagement) {
    var activeMs = 0;
    var lastResume = document.visibilityState === "visible" ? Date.now() : null;
    var reported = false;

    var accumulate = function() {
      if (lastResume !== null) {
        activeMs += Date.now() - lastResume;
        lastResume = null;
      }
    };

    var report = function() {
      if (reported) {
        return;
      }

      reported = true;
      accumulate();

      // A page opened in a background tab and closed unseen has nothing
      // worth reporting; skip it rather than logging an empty visit.
      if (activeMs === 0 && maxDepth === 0 && sectionsRead.length === 0) {
        return;
      }

      track("Page Engagement", {
        seconds: Math.round(activeMs / 1000),
        depth: maxDepth,
        sections: sectionsRead.length
      });
    };

    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "hidden") {
        report();
      } else if (lastResume === null) {
        lastResume = Date.now();
      }
    });

    window.addEventListener("pagehide", report);
  }
})();
