const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { PassThrough } = require('stream');

// Read configurations from environment variables or command-line arguments
const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL || getArg('--url') || 'http://localhost:8124';
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE || getArg('--database') || 'music_analytics';
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER || getArg('--user') || 'default123';
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD || getArg('--password') || 'analytics12345';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'analytics/backup/file');
const DEFAULT_BACKUP_FILE = path.join(BACKUP_DIR, `backup_${CLICKHOUSE_DATABASE}.sql`);
const TARGET_FILE = getArg('--file') || DEFAULT_BACKUP_FILE;

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index !== -1 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  return null;
}

function unescapeClickHouseString(str) {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
}

// Helper to query ClickHouse via HTTP
async function queryClickHouse(sql, format = '', body = null, useDb = true) {
  const url = new URL(CLICKHOUSE_URL);
  url.searchParams.append('user', CLICKHOUSE_USER);
  url.searchParams.append('password', CLICKHOUSE_PASSWORD);
  if (useDb) {
    url.searchParams.append('database', CLICKHOUSE_DATABASE);
  }
  
  let fullSql = sql;
  if (format) {
    fullSql = `${sql} FORMAT ${format}`;
  }

  // If there is custom body (e.g. TSV data/INSERTs), pass SQL query in URL parameters.
  // Otherwise, send the SQL query as the POST request body.
  let requestBody;
  if (body !== null) {
    url.searchParams.append('query', fullSql);
    requestBody = body;
  } else {
    requestBody = fullSql;
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
    body: requestBody,
    headers: {
      'Content-Type': 'text/plain',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ClickHouse error: ${errorText}`);
  }

  return response;
}

const RESUME = process.argv.includes('--resume');
const MAX_RETRIES = 3;

async function queryClickHouseWithRetry(sql, format = '', body = null, useDb = true, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await queryClickHouse(sql, format, body, useDb);
    } catch (err) {
      if (attempt < retries) {
        const wait = attempt * 5000;
        console.warn(`  Retry ${attempt}/${retries - 1} after ${wait / 1000}s... (${err.message})`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
}

async function findLastCompletedTable(filePath) {
  if (!fs.existsSync(filePath)) return { completed: new Set(), truncateTo: 0 };

  return new Promise((resolve, reject) => {
    const completedTables = new Set();
    let lastInsertTable = null;
    let prevLine = '';
    let byteOffset = 0;
    let truncateTo = 0;

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      byteOffset += Buffer.byteLength(line, 'utf8') + 1; // +1 for \n

      if (prevLine === '-- STATEMENT_SEPARATOR') {
        const createMatch = line.match(/^CREATE TABLE(?: IF NOT EXISTS)? `([^`]+)`/);
        if (createMatch) completedTables.add(createMatch[1]);

        const insertMatch = line.match(/^INSERT INTO `([^`]+)` VALUES /);
        if (insertMatch) {
          completedTables.delete(insertMatch[1]);
          lastInsertTable = insertMatch[1];
        }
      }

      if (line === ';' && lastInsertTable) {
        completedTables.add(lastInsertTable);
        truncateTo = byteOffset;
        lastInsertTable = null;
      }

      prevLine = line;
    });

    rl.on('close', () => resolve({ completed: new Set(completedTables), truncateTo }));
    rl.on('error', reject);
  });
}

async function runBackup() {
  console.log(`Starting ClickHouse Backup...`);
  console.log(`URL: ${CLICKHOUSE_URL}`);
  console.log(`Database: ${CLICKHOUSE_DATABASE}`);
  console.log(`User: ${CLICKHOUSE_USER}`);
  console.log(`Target File: ${TARGET_FILE}`);
  console.log(`Resume mode: ${RESUME}\n`);

  fs.mkdirSync(path.dirname(TARGET_FILE), { recursive: true });

  let completedTables = new Set();
  let appendOffset = 0;
  if (RESUME && fs.existsSync(TARGET_FILE)) {
    console.log('Scanning existing backup file to find completed tables...');
    const result = await findLastCompletedTable(TARGET_FILE);
    completedTables = result.completed;
    appendOffset = result.truncateTo;
    console.log(`Resuming — completed: [${[...completedTables].join(', ') || 'none'}], truncating file to byte ${appendOffset}\n`);
    // Truncate file to the end of the last complete table block
    const fd = fs.openSync(TARGET_FILE, 'r+');
    fs.ftruncateSync(fd, appendOffset);
    fs.closeSync(fd);
  }

  // In resume mode, append to file; otherwise overwrite
  const writeStream = RESUME && fs.existsSync(TARGET_FILE)
    ? fs.createWriteStream(TARGET_FILE, { flags: 'a' })
    : fs.createWriteStream(TARGET_FILE);

  const writeText = (text) => {
    return new Promise((resolve) => {
      if (!writeStream.write(text)) {
        writeStream.once('drain', resolve);
      } else {
        process.nextTick(resolve);
      }
    });
  };

  const writeStreamFromReader = async (reader, tableName) => {
    let done = false;
    let rowCount = 0;
    let state = 0; // 0: normal, 1: saw ')', 2: saw '), '
    
    while (!done) {
      const { value, done: readingDone } = await reader.read();
      if (value) {
        let outBuffer = [];
        
        for (let i = 0; i < value.length; i++) {
          const b = value[i];
          
          if (state === 0) {
            if (b === 41) { // ')'
              state = 1;
            } else {
              outBuffer.push(b);
            }
          } else if (state === 1) {
            if (b === 44) { // ','
              state = 2;
            } else {
              outBuffer.push(41); // write the stored ')'
              if (b === 41) {
                state = 1; // stay in state 1 since we saw another ')'
              } else {
                outBuffer.push(b);
                state = 0;
              }
            }
          } else if (state === 2) {
            if (b === 40) { // '('
              // Found a match: ),(
              rowCount++;
              if (rowCount >= 50000) {
                // End statement and start a new one
                const insertText = `);\n-- STATEMENT_SEPARATOR\nINSERT INTO \`${tableName}\` VALUES (`;
                for (let j = 0; j < insertText.length; j++) {
                  outBuffer.push(insertText.charCodeAt(j));
                }
                rowCount = 0;
              } else {
                // Normal row separator, add a newline to keep lines short
                const sepText = `),\n(`;
                for (let j = 0; j < sepText.length; j++) {
                  outBuffer.push(sepText.charCodeAt(j));
                }
              }
              state = 0;
            } else {
              // Not a match, write out the stored '),'
              outBuffer.push(41, 44);
              if (b === 41) {
                state = 1;
              } else {
                outBuffer.push(b);
                state = 0;
              }
            }
          }
        }
        
        if (outBuffer.length > 0) {
          const chunk = new Uint8Array(outBuffer);
          await new Promise((resolve) => {
            if (!writeStream.write(chunk)) {
              writeStream.once('drain', resolve);
            } else {
              resolve();
            }
          });
        }
      }
      done = readingDone;
    }
    
    // Flush any pending state at the end of the stream
    if (state === 1) {
      await writeText(')');
    } else if (state === 2) {
      await writeText('),');
    }
  };

  // Write Database Headers (only on fresh backup, not resume)
  if (!RESUME || !fs.existsSync(TARGET_FILE)) {
    await writeText(`-- STATEMENT_SEPARATOR\nCREATE DATABASE IF NOT EXISTS \`${CLICKHOUSE_DATABASE}\`;\n`);
    await writeText(`-- STATEMENT_SEPARATOR\nUSE \`${CLICKHOUSE_DATABASE}\`;\n`);
  }

  // Get all tables & views
  const tablesQuery = `
    SELECT name, engine
    FROM system.tables
    WHERE database = '${CLICKHOUSE_DATABASE}' AND is_temporary = 0
  `;
  const tablesRes = await queryClickHouseWithRetry(tablesQuery, 'JSON');
  const tablesData = await tablesRes.json();
  const tables = tablesData.data;

  console.log(`Found ${tables.length} tables/views to backup.`);

  // Process tables first, then views
  const physicalTables = [];
  const views = [];

  for (const table of tables) {
    if (table.engine.includes('View')) {
      views.push(table);
    } else {
      physicalTables.push(table);
    }
  }

  // 1. Backup Tables
  for (const { name: tableName, engine } of physicalTables) {
    if (completedTables.has(tableName)) {
      console.log(`Skipping table (already done): ${tableName}`);
      continue;
    }
    console.log(`Processing table: ${tableName} (${engine})...`);

    // Get Schema (and strip specific database prefixes so it can be restored to a different DB name)
    const schemaRes = await queryClickHouseWithRetry(`SHOW CREATE TABLE \`${CLICKHOUSE_DATABASE}\`.\`${tableName}\``);
    const schemaSql = await schemaRes.text();
    const unescapedSchema = unescapeClickHouseString(schemaSql);
    const cleanSchema = unescapedSchema.replace(new RegExp(`\\\`?${CLICKHOUSE_DATABASE}\\\`?\\.`, 'g'), '');

    await writeText(`-- STATEMENT_SEPARATOR\nDROP TABLE IF EXISTS \`${tableName}\`;\n`);
    await writeText(`-- STATEMENT_SEPARATOR\n${cleanSchema.trim()};\n`);

    // Get Data
    const countRes = await queryClickHouseWithRetry(`SELECT count() FROM \`${CLICKHOUSE_DATABASE}\`.\`${tableName}\``);
    const countText = await countRes.text();
    const count = parseInt(countText.trim(), 10);

    if (count > 0) {
      console.log(`  -> Streaming ${count} rows...`);
      await writeText(`-- STATEMENT_SEPARATOR\nINSERT INTO \`${tableName}\` VALUES `);
      const dataRes = await queryClickHouseWithRetry(`SELECT * FROM \`${CLICKHOUSE_DATABASE}\`.\`${tableName}\``, 'Values');
      const reader = dataRes.body.getReader();
      await writeStreamFromReader(reader, tableName);
      await writeText(`;\n`);
    } else {
      console.log(`  -> Table is empty, skipping data export.`);
    }
  }

  // 2. Backup Views
  for (const { name: viewName, engine } of views) {
    if (completedTables.has(viewName)) {
      console.log(`Skipping view (already done): ${viewName}`);
      continue;
    }
    console.log(`Processing view: ${viewName} (${engine})...`);

    const schemaRes = await queryClickHouseWithRetry(`SHOW CREATE TABLE \`${CLICKHOUSE_DATABASE}\`.\`${viewName}\``);
    const schemaSql = await schemaRes.text();
    const unescapedSchema = unescapeClickHouseString(schemaSql);
    const cleanSchema = unescapedSchema.replace(new RegExp(`\\\`?${CLICKHOUSE_DATABASE}\\\`?\\.`, 'g'), '');

    const isMV = engine.includes('MaterializedView');
    const dropType = isMV ? 'TABLE' : 'VIEW'; // ClickHouse stores MV as tables internally

    await writeText(`-- STATEMENT_SEPARATOR\nDROP ${dropType} IF EXISTS \`${viewName}\`;\n`);
    await writeText(`-- STATEMENT_SEPARATOR\n${cleanSchema.trim()};\n`);
  }

  writeStream.end();
  console.log(`\nBackup completed successfully! Saved in: ${TARGET_FILE}`);
}

async function runRestore() {
  console.log(`Starting ClickHouse Restore...`);
  console.log(`URL: ${CLICKHOUSE_URL}`);
  console.log(`Database: ${CLICKHOUSE_DATABASE}`);
  console.log(`User: ${CLICKHOUSE_USER}`);
  console.log(`Source File: ${TARGET_FILE}\n`);

  if (!fs.existsSync(TARGET_FILE)) {
    console.error(`Error: Backup file ${TARGET_FILE} does not exist.`);
    process.exit(1);
  }

  // Determine backed up database name from target file name if possible
  const filename = path.basename(TARGET_FILE);
  const oldDbMatch = filename.match(/backup_(.*?)\.sql/);
  const oldDbName = oldDbMatch ? oldDbMatch[1] : 'music_analytics';

  console.log(`Dropping database '${CLICKHOUSE_DATABASE}' if exists for a clean restore...`);
  await queryClickHouse(`DROP DATABASE IF EXISTS \`${CLICKHOUSE_DATABASE}\``, '', null, false);
  console.log(`Creating database '${CLICKHOUSE_DATABASE}'...`);
  await queryClickHouse(`CREATE DATABASE \`${CLICKHOUSE_DATABASE}\``, '', null, false);

  const separator = Buffer.from('-- STATEMENT_SEPARATOR\n');
  let statementCount = 0;
  let current = { chunks: [], length: 0, stream: null, request: null };

  const remapDatabase = (sql) => {
    if (CLICKHOUSE_DATABASE === oldDbName) return sql;
    return sql
      .replace(new RegExp(`\\\`?${oldDbName}\\\`?\\.`, 'g'), `\`${CLICKHOUSE_DATABASE}\`.`)
      .replace(new RegExp(`DATABASE IF NOT EXISTS \\\`?${oldDbName}\\\`?`, 'g'), `DATABASE IF NOT EXISTS \`${CLICKHOUSE_DATABASE}\``)
      .replace(new RegExp(`USE \\\`?${oldDbName}\\\`?`, 'g'), `USE \`${CLICKHOUSE_DATABASE}\``);
  };

  const startInsertStream = () => {
    const stream = new PassThrough();
    const url = new URL(CLICKHOUSE_URL);
    url.searchParams.append('user', CLICKHOUSE_USER);
    url.searchParams.append('password', CLICKHOUSE_PASSWORD);
    url.searchParams.append('database', CLICKHOUSE_DATABASE);
    current.stream = stream;
    current.request = fetch(url.toString(), {
      method: 'POST',
      body: stream,
      duplex: 'half',
      headers: { 'Content-Type': 'text/plain' },
    }).then(async (response) => {
      if (!response.ok) throw new Error(`ClickHouse error: ${await response.text()}`);
    });
    for (const chunk of current.chunks) stream.write(chunk);
    current.chunks = [];
  };

  const append = async (chunk) => {
    if (!chunk.length) return;
    if (current.stream) {
      if (!current.stream.write(chunk)) await new Promise(resolve => current.stream.once('drain', resolve));
      return;
    }
    current.chunks.push(chunk);
    current.length += chunk.length;
    const preview = Buffer.concat(current.chunks, current.length).toString('utf8').trimStart();
    if (preview.startsWith('INSERT INTO')) {
      statementCount++;
      console.log(`Executing streamed INSERT #${statementCount}: ${preview.slice(0, 100).replace(/\n/g, ' ')}...`);
      startInsertStream();
    } else if (current.length > 1024 * 1024) {
      throw new Error('A non-INSERT restore statement exceeded 1 MiB.');
    }
  };

  const finishStatement = async () => {
    if (current.stream) {
      current.stream.end();
      await current.request;
    } else if (current.length) {
      let sql = Buffer.concat(current.chunks, current.length).toString('utf8').trim();
      if (sql) {
        statementCount++;
        sql = remapDatabase(sql);
        const preview = sql.slice(0, 100).replace(/\n/g, ' ');
        console.log(`Executing statement #${statementCount}: ${preview}...`);
        const isDbCommand = sql.toUpperCase().startsWith('CREATE DATABASE') || sql.toUpperCase().startsWith('USE ') || sql.toUpperCase().startsWith('DROP DATABASE');
        await queryClickHouse(sql, '', null, !isDbCommand);
      }
    }
    current = { chunks: [], length: 0, stream: null, request: null };
  };

  let pending = Buffer.alloc(0);
  for await (const chunk of fs.createReadStream(TARGET_FILE)) {
    let data = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    let markerIndex;
    while ((markerIndex = data.indexOf(separator)) !== -1) {
      await append(data.subarray(0, markerIndex));
      await finishStatement();
      data = data.subarray(markerIndex + separator.length);
    }
    const safeLength = Math.max(0, data.length - separator.length + 1);
    if (safeLength) await append(data.subarray(0, safeLength));
    pending = data.subarray(safeLength);
  }
  await append(pending);
  await finishStatement();

  console.log(`\nRestore completed successfully! Executed ${statementCount} statements.`);
}

// Decide action (backup is default)
const action = process.argv.includes('--restore') ? 'restore' : 'backup';

if (action === 'backup') {
  runBackup().catch(err => {
    console.error('Backup failed:', err.message);
    process.exit(1);
  });
} else {
  runRestore().catch(err => {
    console.error('Restore failed:', err.message);
    process.exit(1);
  });
}
