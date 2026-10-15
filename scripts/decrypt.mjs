// Local only: node scripts/decrypt.mjs PRIVATE_KEY DIAGNOSTICS.enc OUTPUT.json
import { readFileSync, writeFileSync } from 'node:fs';
import { open } from './envelope.mjs';
const [key, input, output] = process.argv.slice(2);
if (!key || !input || !output) throw new Error('Expected private key, ciphertext and output paths');
writeFileSync(output, open(readFileSync(input, 'utf8'), readFileSync(key)), { mode: 0o600, flag: 'wx' });
