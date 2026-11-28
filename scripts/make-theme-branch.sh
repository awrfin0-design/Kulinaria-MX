#!/usr/bin/env bash
# Builds/updates the lightweight branch "shopify-theme": ONLY the Shopify theme folders (assets, config, layout, locales,
# sections, snippets, templates), no backend / brand videos / previews / ZIPs, and a tiny history.
# Connect the client's Shopify store (Online Store > Themes > Add theme > Connect from GitHub) to that branch.
#   scripts/make-theme-branch.sh            builds the branch locally
#   scripts/make-theme-branch.sh --push     builds it and pushes it to origin
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
BR=shopify-theme
SRC=$(git rev-parse HEAD)
IDX=$(mktemp -u)
export GIT_INDEX_FILE=$IDX
git add -f assets config layout locales sections snippets templates
TREE=$(git write-tree)
unset GIT_INDEX_FILE; rm -f "$IDX"
PARENT=""
if git rev-parse -q --verify "refs/heads/$BR" >/dev/null; then
  if [ "$(git rev-parse "$BR^{tree}")" = "$TREE" ]; then echo "$BR is already up to date ($(git rev-parse --short "$BR"))"; [ "${1:-}" = "--push" ] && git push -u origin "$BR"; exit 0; fi
  PARENT="-p $(git rev-parse "$BR")"
fi
C=$(git commit-tree "$TREE" $PARENT -m "Theme snapshot from ${SRC:0:7}")
git update-ref "refs/heads/$BR" "$C"
echo "$BR -> $(git rev-parse --short "$BR") ($(git ls-tree -r --name-only "$BR" | wc -l) files)"
[ "${1:-}" = "--push" ] && git push -u origin "$BR"
exit 0
