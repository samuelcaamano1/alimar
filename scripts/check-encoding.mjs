import { readFile } from 'node:fs/promises'

const files = ['src/App.tsx', 'index.html']
const findings = []

for (const file of files) {
  const text = await readFile(file, 'utf8')
  const checks = [
    ['mojibake marker Ã', text.includes('Ã')],
    ['mojibake marker Â', text.includes('Â')],
    ['mojibake marker â', text.includes('â')],
    ['replacement character', text.includes('\uFFFD')],
    ['literal PowerShell CRLF token', text.includes('`r`n')],
  ]

  for (const [label, bad] of checks) {
    if (bad) findings.push(`${file}: ${label}`)
  }
}

const app = await readFile('src/App.tsx', 'utf8')

if (!app.includes('Ideas que se vuelven')) {
  findings.push('src/App.tsx: hero prefix missing')
}

if (!app.includes('<span> Recuerdos</span>')) {
  findings.push('src/App.tsx: new hero text missing')
}

if (findings.length) {
  console.error('Encoding/hero check failed:')
  for (const finding of findings) console.error(`- ${finding}`)
  process.exit(1)
}

console.log('Encoding/hero check OK')
