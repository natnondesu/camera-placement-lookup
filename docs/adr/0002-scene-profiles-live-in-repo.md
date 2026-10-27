# Scene profiles live in a repo file; Excel is an export

The placement rule was maintained in three places (the generator, the page script, and Book1.xlsx) and they had already drifted apart. Each scene profile is now one set of thresholds in a single file in the repo, changed through a reviewed PR; the lookup table is computed from it, and any spreadsheet is exported from the tool rather than edited by hand.
