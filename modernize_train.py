from pathlib import Path

file = "monitorowane-pociagi/train.html"

with open(file, "r", encoding="utf-8") as f:
    txt = f.read()

# 1. Większe opóźnienie
txt = txt.replace(
    "font-size:42px;",
    "font-size:72px;"
)

# 2. Hero sticky
txt = txt.replace(
    '&lt;div class="card"&gt;',
    '&lt;div class="card heroCard"&gt;',
    1
)

# 3. CSS
css = """
.heroCard{
  position:sticky;
  top:0;
  z-index:100;
  backdrop-filter:blur(10px);
}

.route{
  position:relative;
}

.routeItem{
  position:relative;
  padding:12px 12px 12px 52px;
  background:transparent;
  border:none;
  border-radius:0;
}

.routeItem::before{
  content:'';
  position:absolute;
  left:22px;
  top:-8px;
  bottom:-8px;
  width:2px;
  background:#34495e;
}

.routeItem:first-child::before{
  top:20px;
}

.routeItem:last-child::before{
  bottom:20px;
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
    css + "\n&lt;/style&gt;"
)

# 4. +17 => +17 min
txt = txt.replace(
    "`${delay &gt; 0 ? '+' : ''}${delay}`",
    "`${delay &gt; 0 ? '+' : ''}${delay} min`"
)

# 5. Timeline marker
old = """        &lt;div class="routeItem ${cls}"&gt;
          &lt;div class="routeName"&gt;
            ${icon}
            ${station.stationName || station.stationId}
          &lt;/div&gt;
        &lt;/div&gt;"""

new = """        &lt;div class="routeItem ${cls}"&gt;

          &lt;div class="routeMarker"&gt;
            ${icon}
          &lt;/div&gt;

          &lt;div class="routeName"&gt;
            ${station.stationName || station.stationId}
          &lt;/div&gt;
        &lt;/div&gt;"""

txt = txt.replace(old, new)

with open(file, "w", encoding="utf-8") as f:
    f.write(txt)

print("✅ train.html zmodernizowany")
