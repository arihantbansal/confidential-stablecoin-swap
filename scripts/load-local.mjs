import { readFile } from 'node:fs/promises';

// Surfpool fixture loading avoids distributing a program's secret keypair.
// Transactions and native proof verification still execute normally afterward.
const rpcUrl = 'http://127.0.0.1:8899';
const programId = 'GxEQHbmE777LzkJjLX2EV7t1n37bZq1gD47gC8Xp9i9m';
const binary = await readFile(new URL('../target/deploy/spl_token_wrap.so', import.meta.url));
const response = await fetch(rpcUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'surfnet_writeProgram',
    params: [programId, binary.toString('hex'), 0],
  }),
});
if (!response.ok) throw new Error(`Surfpool HTTP ${response.status}`);
const result = await response.json();
if (result.error) throw new Error(JSON.stringify(result.error));
console.log(`Loaded local wrapper ${programId} (${binary.length} bytes)`);
