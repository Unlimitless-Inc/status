# Unl status

The code behind [status.unlimitless.ai](https://status.unlimitless.ai): whether Unl is working right now, the last 90 days of each part, and every incident.

It runs here, apart from Unl itself, so the page stays up when Unl is down. Every ten minutes a GitHub Action checks each part from outside (`src/probe.mjs`), adds one line to the history on the `status-data` branch, and rebuilds a static page (`src/build.mjs`) that Pages serves.

The rules the page keeps, each tested in `test.mjs`:

- Every state comes from a real check, never from a hand.
- A day nobody checked is never drawn green.
- One failed check opens nothing. Two in a row open an incident, and two working checks in a row close it.
- If the checks go quiet, the top line says so instead of showing old states as current.
- Parts are named in customer words only.
- The page wears the site's own look (`src/brand.mjs` says where each value came from) and carries it with it: the fonts sit in `brand/fonts` with their licences, so nothing is loaded from the site when the page is opened.
- The page is built when the checks run, so it asks again how old the last check is when someone opens it.

Run the tests with `node test.mjs` (Node 20, no dependencies).
