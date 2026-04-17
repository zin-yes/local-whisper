const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="100" ry="100" fill="url(#bg)"/>
  <g transform="translate(128,96) scale(10.67)" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="2" width="6" height="11" rx="3"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="8" y1="22" x2="16" y2="22"/>
  </g>
</svg>`;

async function generate() {
  const buildDir = path.join(__dirname, '..', 'build');

  const png256 = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer();
  fs.writeFileSync(path.join(buildDir, 'icon.png'), png256);
  console.log('Created build/icon.png (256x256)');

  const sizes = [16, 32, 48, 64, 128, 256];
  const pngBuffers = [];
  for (const size of sizes) {
    const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
    pngBuffers.push(buf);
  }

  const toIco = (await import('to-ico')).default;
  const ico = await toIco(pngBuffers);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
  console.log('Created build/icon.ico (16-256px)');
}

generate().catch(e => { console.error(e); process.exit(1); });
