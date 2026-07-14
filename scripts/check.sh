#!/bin/bash

echo "=== TRAIN DELAY MONITOR CHECK ==="

echo ""
echo "Sprawdzam strukturę plików..."

test -f functions/train.js && echo "OK: functions/train.js" || echo "BRAK: functions/train.js"
test -f functions/api.js && echo "OK: functions/api.js" || echo "BRAK: functions/api.js"
test -f moje-pociagi/index.html && echo "OK: moje-pociagi/index.html" || echo "BRAK: moje-pociagi/index.html"

echo ""
echo "Sprawdzam status Git..."

git status --short

echo ""
echo "Gotowe."
