/* PostHog website analytics for index.chaos.fail.
 * No report text, search terms, source URLs, or account identities are captured.
 * A public PostHog project key and ingestion host are supplied by build-generated config. */
(function () {
  "use strict";

  if (window.location.hostname !== "index.chaos.fail") return;
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
  const cfg = window.__INDEX_POSTHOG__;
  if (!cfg || !cfg.token || !/^https:\/\/(?:eu|us)\.i\.posthog\.com$/.test(cfg.host || "")) {
    if (window.location.search.includes("analytics-debug=1")) {
      console.error("INDEX_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once INDEX_POSTHOG_PROJECT_TOKEN is configured");
    }
    return;
  }

  // Official PostHog HTML snippet loader, suitable for this static (non-NPM) site.
  (function (t, e) {
    var o, n, p, r;
    if (e.__SV) return;
    window.posthog = e;
    e._i = [];
    e.init = function (i, s, a) {
      function g(t, e) {
        var o = e.split(".");
        if (o.length === 2) { t = t[o[0]]; e = o[1]; }
        t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); };
      }
      (p = t.createElement("script")).type = "text/javascript";
      p.crossOrigin = "anonymous";
      p.async = true;
      p.src = s.api_host.replace(".i.posthog.com", "-assets.i.posthog.com") + "/static/1/array.js";
      (r = t.getElementsByTagName("script")[0]).parentNode.insertBefore(p, r);
      var u = e;
      if (a !== undefined) u = e[a] = [];
      else a = "posthog";
      u.people = u.people || [];
      u.toString = function (t) {
        var e = "posthog";
        if (a !== "posthog") e += "." + a;
        if (!t) e += " (stub)";
        return e;
      };
      u.people.toString = function () { return u.toString(1) + ".people (stub)"; };
      o = "init capture identify alias people.set people.set_once reset group register register_once unregister onFeatureFlags reloadFeatureFlags getFeatureFlag getFeatureFlagPayload isFeatureEnabled opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing get_distinct_id get_session_id".split(" ");
      for (n = 0; n < o.length; n++) g(u, o[n]);
      e._i.push([i, s, a]);
    };
    e.__SV = 1;
  })(document, window.posthog || []);

  window.posthog.init(cfg.token, {
    api_host: cfg.host,
    defaults: "2025-05-24",
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false,
    disable_session_recording: true,
    disable_surveys: true,
    capture_performance: false,
    capture_heatmaps: false,
    advanced_disable_flags: true,
    person_profiles: "never",
    persistence: "localStorage",
    respect_dnt: true
  });

  function capture(name, properties) {
    try { window.posthog.capture(name, properties || {}); }
    catch { /* Analytics can never interfere with studying. */ }
  }
  function locationContext(element) {
    const module = element.closest(".module");
    const subject = element.closest(".subject");
    const group = module && module.closest(".year");
    const info = {
      module_index: module ? Number(module.getAttribute("data-module-group")) : null,
      year: group ? Number(group.getAttribute("data-year-group")) : null
    };
    if (subject) info.subject = subject.getAttribute("data-subject") || "General";
    return info;
  }

  document.body.addEventListener("click", function (event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const year = target.closest(".year-button[data-year]");
    if (year) {
      if (year.getAttribute("aria-expanded") === "true") capture("index_year_opened", { year: Number(year.dataset.year) });
      return;
    }
    const module = target.closest(".module-button[data-module]");
    if (module) {
      if (module.getAttribute("aria-expanded") === "true") {
        capture("index_module_opened", {
          year: Number(module.closest(".year")?.getAttribute("data-year-group")),
          module_index: Number(module.dataset.module)
        });
      }
      return;
    }
    const tab = target.closest("[data-tab][data-module-index]");
    if (tab) {
      capture("index_tab_selected", {
        tab: tab.dataset.tab,
        module_index: Number(tab.dataset.moduleIndex),
        ...locationContext(tab)
      });
      return;
    }
    const item = target.closest("[data-report-item]");
    if (item) {
      capture("index_report_opened", {
        type: item.dataset.reportType,
        issue: item.dataset.reportIssue,
        module_index: Number(item.dataset.reportModule)
      });
      return;
    }
    const link = target.closest("a[href]");
    const row = link && link.closest(".material-row");
    if (row && /^https:\/\/t\.me\//.test(link.href)) {
      capture("index_material_opened", {
        ...locationContext(row),
        material_type: row.dataset.kind || "other",
        destination: link.classList.contains("quiz-link") ? "questions" : "material"
      });
    }
  }, { passive: true });

  window.addEventListener("index:report-submitted", function (event) {
    const detail = event.detail || {};
    capture("index_report_submitted", {
      year: Number(detail.year) || null,
      module_index: Number.isInteger(detail.moduleIndex) ? detail.moduleIndex : null,
      type: String(detail.type || "Other").slice(0, 32),
      issue: detail.issue === "incorrect" ? "incorrect" : "missing"
    });
  });
})();
