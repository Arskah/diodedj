import { watch, copyFileSync, mkdirSync } from 'fs';

const assets = ['index.html', 'styles.css'];

mkdirSync('dist/renderer', { recursive: true });

// Initial copy
for (const file of assets) {
  copyFileSync(`src/renderer/${file}`, `dist/renderer/${file}`);
}

// Watch for changes
watch('src/renderer', (event, filename) => {
  if (assets.includes(filename)) {
    copyFileSync(`src/renderer/${filename}`, `dist/renderer/${filename}`);
    console.log(`[assets] copied ${filename}`);
  }
});
