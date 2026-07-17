from pathlib import Path

p = Path("monitorowane-pociagi/train.html")
txt = p.read_text(encoding="utf-8")

# 1. +17 => +17 min
txt = txt.replace(
"""delayElement.textContent =
    `${delay &gt; 0 ? '+' : ''}${delay}`;""",
"""delayElement.textContent =
    `${delay &gt; 0 ? '+' : ''}${delay} min`;"""
)

# 2. Ikony
txt = txt.replace(
"let icon = '○';",
"let icon = '⏳';"
)

txt = txt.replace(
"icon = '✓';",
"icon = '✅';"
)

txt = txt.replace(
"icon = '▶';",
"icon = '🚆';"
)

# 3. Timeline CSS
timeline_css = """

.route{
  position:relative;
  display:flex;
  flex-direction:column;
  gap:0;
}

.routeItem{
  position:relative;
  padding:14px 14px 14px 54px;
  background:transparent;
  border-radius:0;
}

.routeItem::before{
  content:'';
  position:absolute;
  left:22px;
  top:-6px;
  bottom:-6px;
  width:2px;
  background:#34495e;
}

.routeItem:first-child::before{
  top:18px;
}

.routeItem:last-child::before{
  bottom:18px;
}

.routeMarker{
  position:absolute;
  left:8px;
  top:12px;
  width:28px;
  height:28px;
  border-radius:50%;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:14px;
}

.routePast .routeMarker{
  background:#1f5a35;
}

.routeCurrent .routeMarker{
  background:#2ecc71;
  animation:pulse 2s infinite;
}

.routeFuture .routeMarker{
  background:#34495e;
}

.routeCurrent{
  background:rgba(46,204,113,.12);
  border-left:4px solid #2ecc71;
}

@keyframes pulse{
  0%{
    box-shadow:0 0 0 0 rgba(46,204,113,.7);
  }

  70%{
    box-shadow:0 0 0 12px rgba(46,204,113,0);
  }

  100%{
    box-shadow:0 0 0 0 rgba(46,204,113,0);
  }
}
"""

txt = txt.replace(
"&lt;/style&gt;",
timeline_css + "\n&lt;/style&gt;"
)

# 4. Renderer stacji
old = """      return `
        &lt;div class="routeItem ${cls}"&gt;
          &lt;div class="routeName"&gt;
            ${icon}
            ${station.stationName || station.stationId}
          &lt;/div&gt;
        &lt;/div&gt;
      `;"""

new = """      return `
        &lt;div class="routeItem ${cls}"&gt;

          &lt;div class="routeMarker"&gt;
            ${icon}
          &lt;/div&gt;

          &lt;div class="routeName"&gt;
            ${station.stationName || station.stationId}
          &lt;/div&gt;

        &lt;/div&gt;
      `;"""

txt = txt.replace(old, new)

p.write_text(txt, encoding="utf-8")

print("✅ Train View v2 patch applied")
