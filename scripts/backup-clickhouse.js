const fs = require('fs');
const path = require('path');
const readline = require('readline');

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

async function runBackup() {
  console.log(`Starting ClickHouse Backup...`);
  console.log(`URL: ${CLICKHOUSE_URL}`);
  console.log(`Database: ${CLICKHOUSE_DATABASE}`);
  console.log(`User: ${CLICKHOUSE_USER}`);
  console.log(`Target File: ${TARGET_FILE}\n`);

  fs.mkdirSync(path.dirname(TARGET_FILE), { recursive: true });
  const writeStream = fs.createWriteStream(TARGET_FILE);

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

  // Write Database Headers
  await writeText(`-- STATEMENT_SEPARATOR\nCREATE DATABASE IF NOT EXISTS \`${CLICKHOUSE_DATABASE}\`;\n`);
  await writeText(`-- STATEMENT_SEPARATOR\nUSE \`${CLICKHOUSE_DATABASE}\`;\n`);

  // Get all tables & views
  const tablesQuery = `
    SELECT name, engine 
    FROM system.tables 
    WHERE database = '${CLICKHOUSE_DATABASE}' AND is_temporary = 0
  `;
  const tablesRes = await queryClickHouse(tablesQuery, 'JSON');
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
    console.log(`Processing table: ${tableName} (${engine})...`);

    // Get Schema (and strip specific database prefixes so it can be restored to a different DB name)
    const schemaRes = await queryClickHouse(`SHOW CREATE TABLE \`${CLICKHOUSE_DATABASE}\`.\`${tableName}\``);
    const schemaSql = await schemaRes.text();
    const unescapedSchema = unescapeClickHouseString(schemaSql);
    const cleanSchema = unescapedSchema.replace(new RegExp(`\\\`?${CLICKHOUSE_DATABASE}\\\`?\\.`, 'g'), '');

    await writeText(`-- STATEMENT_SEPARATOR\nDROP TABLE IF EXISTS \`${tableName}\`;\n`);
    await writeText(`-- STATEMENT_SEPARATOR\n${cleanSchema.trim()};\n`);

    // Get Data
    const countRes = await queryClickHouse(`SELECT count() FROM \`${CLICKHOUSE_DATABASE}\`.\`${tableName}\``);
    const countText = await countRes.text();
    const count = parseInt(countText.trim(), 10);

    if (count > 0) {
      console.log(`  -> Streaming ${count} rows...`);
      await writeText(`-- STATEMENT_SEPARATOR\nINSERT INTO \`${tableName}\` VALUES `);
      const dataRes = await queryClickHouse(`SELECT * FROM \`${CLICKHOUSE_DATABASE}\`.\`${tableName}\``, 'Values');
      const reader = dataRes.body.getReader();
      await writeStreamFromReader(reader, tableName);
      await writeText(`;\n`);
    } else {
      console.log(`  -> Table is empty, skipping data export.`);
    }
  }

  // 2. Backup Views
  for (const { name: viewName, engine } of views) {
    console.log(`Processing view: ${viewName} (${engine})...`);

    const schemaRes = await queryClickHouse(`SHOW CREATE TABLE \`${CLICKHOUSE_DATABASE}\`.\`${viewName}\``);
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

  const fileStream = fs.createReadStream(TARGET_FILE);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let currentStatement = [];
  let statementCount = 0;

  for await (const line of rl) {
    if (line.trim() === '-- STATEMENT_SEPARATOR') {
      if (currentStatement.length > 0) {
        let sql = currentStatement.join('\n').trim();
        if (sql) {
          statementCount++;
          
          // Dynamically map database name if different
          if (CLICKHOUSE_DATABASE !== oldDbName) {
            sql = sql.replace(new RegExp(`\\\`?${oldDbName}\\\`?\\.`, 'g'), `\`${CLICKHOUSE_DATABASE}\`.`);
            sql = sql.replace(new RegExp(`DATABASE IF NOT EXISTS \\\`?${oldDbName}\\\`?`, 'g'), `DATABASE IF NOT EXISTS \`${CLICKHOUSE_DATABASE}\``);
            sql = sql.replace(new RegExp(`USE \\\`?${oldDbName}\\\`?`, 'g'), `USE \`${CLICKHOUSE_DATABASE}\``);
          }

          const preview = sql.slice(0, 100).replace(/\n/g, ' ');
          console.log(`Executing statement #${statementCount}: ${preview}...`);
          const isDbCommand = sql.toUpperCase().startsWith('CREATE DATABASE') || sql.toUpperCase().startsWith('USE ') || sql.toUpperCase().startsWith('DROP DATABASE');
          try {
            await queryClickHouse(sql, '', null, !isDbCommand);
          } catch (err) {
            console.error(`Error running statement #${statementCount}:`, err.message);
            process.exit(1);
          }
        }
        currentStatement = [];
      }
    } else {
      currentStatement.push(line);
    }
  }

  // Execute remaining statements if any
  if (currentStatement.length > 0) {
    let sql = currentStatement.join('\n').trim();
    if (sql) {
      statementCount++;
      if (CLICKHOUSE_DATABASE !== oldDbName) {
        sql = sql.replace(new RegExp(`\\\`?${oldDbName}\\\`?\\.`, 'g'), `\`${CLICKHOUSE_DATABASE}\`.`);
        sql = sql.replace(new RegExp(`DATABASE IF NOT EXISTS \\\`?${oldDbName}\\\`?`, 'g'), `DATABASE IF NOT EXISTS \`${CLICKHOUSE_DATABASE}\``);
        sql = sql.replace(new RegExp(`USE \\\`?${oldDbName}\\\`?`, 'g'), `USE \`${CLICKHOUSE_DATABASE}\``);
      }
      console.log(`Executing statement #${statementCount}: ${sql.slice(0, 100)}...`);
      const isDbCommand = sql.toUpperCase().startsWith('CREATE DATABASE') || sql.toUpperCase().startsWith('USE ') || sql.toUpperCase().startsWith('DROP DATABASE');
      await queryClickHouse(sql, '', null, !isDbCommand);
    }
  }

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
