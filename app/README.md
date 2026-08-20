
node scripts/svg-to-visual-json.mjs --in public/generated/mc.svg --out public/generated/visual.from-svg.json --width 10000 --height 3929 

npm run generate:map:centers -- --in public/teste/visual.from-svg.json --out public/teste/map.json --precision 0
