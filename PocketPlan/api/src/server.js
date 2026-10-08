import mysql from 'mysql2/promise';
import { createApp } from './app.js';

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'finance_app',
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'finance_manager',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: false,
  dateStrings: true,
});

const port = Number(process.env.PORT || 8080);

try {
  await pool.query('SELECT 1');
  const server = createApp({ pool }).listen(port, '0.0.0.0', () => {
    console.info(`PocketPlan Node.js API listening on port ${port}.`);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      server.close(async () => {
        await pool.end();
        process.exit(0);
      });
    });
  }
} catch (error) {
  console.error('The Node.js API could not connect to MySQL:', error);
  process.exitCode = 1;
}
