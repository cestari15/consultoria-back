const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;

if (!global._mysqlPool) {
  global._mysqlPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 25530,
    ssl: {
      rejectUnauthorized: false
    },
    waitForConnections: true,
    connectionLimit: 5, // Reduzido para não estourar conexões no Vercel
    queueLimit: 0,
    connectTimeout: 10000
  });
}

pool = global._mysqlPool;

module.exports = pool;