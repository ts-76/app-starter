const chunks = []

process.stdin.on('data', (chunk) => chunks.push(chunk))
process.stdin.on('end', () => {
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  const command = String(payload.tool_input?.command ?? payload.tool_input?.cmd ?? '')

  const blocked = [
    /\bwrangler\s+deploy\b/,
    /\bwrangler\s+delete\b/,
    /\bwrangler\s+d1\s+migrations\s+apply\b.*\s--remote\b/,
    /\bterraform\s+apply\b/,
    /\bterraform\s+destroy\b/,
    /\bgit\s+push\s+origin\s+main\b/,
    /\bcat\s+\.env\b/,
  ]

  if (blocked.some((pattern) => pattern.test(command))) {
    console.error(`Blocked dangerous command: ${command}`)
    process.exit(2)
  }
})
